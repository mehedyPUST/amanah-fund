import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type {
  Contribution,
  FundConfig,
  HalalProject,
  InstallmentItem,
  LoanRequest,
  UserRegistrationDetails,
  UserRole,
} from '../types/coop.ts';
import {
  type AuthenticatedRequest,
  clearAuthCookie,
  requireAuth,
  requireRole,
  sanitizeUser,
  setAuthCookie,
  signAuthToken,
  signGoogleRegistrationToken,
  verifyFirebaseGoogleIdToken,
  verifyGoogleRegistrationToken,
} from './auth.ts';
import {
  appendAuditLog,
  buildDashboardOverview,
  buildGoogleSheetsBlueprint,
  buildMemberSummaries,
  computeRequiredApprovals,
  escapeCsvCell,
  evaluateLoanEligibility,
  hydrateContributionForViewer,
  hydrateHalalProjectForViewer,
  hydrateLoanForViewer,
  queueEmailNotification,
} from './coopService.ts';
import {
  computeSha256Hash,
  decryptSensitiveObject,
  encryptSensitiveObject,
  maskReference,
} from './crypto.ts';
import { loadVaultState, type StoredUser, updateVaultState } from './db.ts';
import { broadcastRealtimeEvent, registerSseClient } from './realtime.ts';

function extractGoogleBearerToken(req: AuthenticatedRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function computeInstallmentDueDate(anchor: Date | string, monthOffset: number): string {
  const base = anchor instanceof Date ? anchor : new Date(anchor);
  const due = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 15));
  return due.toISOString().slice(0, 10);
}

function nextMemberCode(users: StoredUser[]): string {
  const maxNum = users.reduce((max, u) => {
    const num = Number(u.memberCode.replace(/\D/g, ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);
  return `AC-${String(maxNum + 1).padStart(3, '0')}`;
}

function nextLoanId(loans: LoanRequest[], year = new Date().getUTCFullYear()): string {
  const prefix = `loan-${year}-`;
  const maxNum = loans.reduce((max, l) => {
    if (!l.id.startsWith(prefix)) return max;
    const seq = Number(l.id.slice(prefix.length));
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export const apiRouter = Router();

// Real-time Server-Sent Events stream for live voting and treasury synchronization
apiRouter.get('/events', requireAuth, (req: AuthenticatedRequest, res) => {
  registerSseClient(req.authUser!.id, res);
});

// ---------------------------------------------------------------------------
// 1. Authentication (JWT + HttpOnly Cookie)
// ---------------------------------------------------------------------------

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const state = await loadVaultState();
    const user = state.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (!user.passwordHash) {
      res.status(401).json({
        error: 'This account uses Google Sign-In. Please click "Continue with Google" to sign in.',
      });
      return;
    }
    if (!bcrypt.compareSync(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.status === 'pending_approval') {
      res.status(403).json({
        error:
          'Your registration is awaiting administrator approval. Only approved members can sign in.',
      });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is suspended. Contact an administrator.' });
      return;
    }

    const sanitized = sanitizeUser(user);
    const token = signAuthToken(user);
    setAuthCookie(req, res, token);

    await updateVaultState((draft) => {
      appendAuditLog(draft, {
        actor: sanitized,
        action: 'AUTH_LOGIN',
        resourceType: 'auth',
        resourceId: sanitized.id,
        summary: `${sanitized.name} (${sanitized.role}) signed in via HttpOnly JWT session`,
        payload: { email: sanitized.email, role: sanitized.role },
      });
      return draft;
    });

    broadcastRealtimeEvent('audit:updated', {
      action: 'AUTH_LOGIN',
      resourceType: 'auth',
      resourceId: sanitized.id,
    });
    res.json({ user: sanitized });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication service failed.' });
  }
});

apiRouter.post('/auth/google', async (req, res) => {
  try {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required.' });
      return;
    }

    let googleIdentity;
    try {
      googleIdentity = await verifyFirebaseGoogleIdToken(idToken);
    } catch (verifyErr) {
      res.status(401).json({
        error:
          verifyErr instanceof Error
            ? verifyErr.message
            : 'Unable to verify Google Sign-In credentials.',
      });
      return;
    }

    if (!googleIdentity.emailVerified) {
      res.status(403).json({
        error: 'Your Google account email must be verified before signing in.',
      });
      return;
    }

    const state = await loadVaultState();
    const existingUser = state.users.find(
      (u) =>
        u.googleUid === googleIdentity.uid ||
        u.email.toLowerCase() === googleIdentity.email
    );

    if (existingUser) {
      if (existingUser.status === 'pending_approval') {
        res.status(403).json({
          status: 'pending_approval',
          error:
            'Your membership application is awaiting administrator approval. Only approved members can sign in.',
        });
        return;
      }

      if (existingUser.status !== 'active') {
        res.status(403).json({
          status: 'suspended',
          error: 'Account is suspended. Contact an administrator.',
        });
        return;
      }

      let updatedUser = existingUser;
      await updateVaultState((draft) => {
        const target = draft.users.find((u) => u.id === existingUser.id);
        if (target) {
          if (!target.googleUid) {
            target.googleUid = googleIdentity.uid;
          }
          target.authProvider = target.passwordHash ? 'both' : 'google';
          updatedUser = target;
        }
        const actor = sanitizeUser(updatedUser);
        appendAuditLog(draft, {
          actor,
          action: 'AUTH_LOGIN',
          resourceType: 'auth',
          resourceId: actor.id,
          summary: `${actor.name} (${actor.role}) signed in via Google SSO`,
          payload: { email: actor.email, role: actor.role, provider: 'google' },
        });
        return draft;
      });

      broadcastRealtimeEvent('audit:updated', {
        action: 'AUTH_LOGIN',
        resourceType: 'auth',
        resourceId: existingUser.id,
      });
      const sanitized = sanitizeUser(updatedUser);
      const token = signAuthToken(updatedUser);
      setAuthCookie(req, res, token);

      res.json({
        status: 'authenticated',
        user: sanitized,
      });
      return;
    }

    const registrationToken = signGoogleRegistrationToken(googleIdentity);
    res.json({
      status: 'needs_onboarding',
      registrationToken,
      googleProfile: {
        name: googleIdentity.name,
        email: googleIdentity.email,
        photoUrl: googleIdentity.picture || '',
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed.' });
  }
});

const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');

apiRouter.get('/uploads/:filename', (req, res) => {
  const safeName = path.basename(String(req.params.filename || ''));
  if (!safeName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    res.status(400).json({ error: 'Invalid file name.' });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.sendFile(filePath);
});

apiRouter.post('/upload/imgbb', async (req, res) => {
  try {
    const rawData = String(req.body?.imageBase64 || '').trim();
    const rawName = String(req.body?.name || 'member-upload').replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!rawData) {
      res.status(400).json({ error: 'Image payload is required.' });
      return;
    }

    let mimeType = 'image/jpeg';
    let base64Payload = rawData;
    const dataUrlMatch = rawData.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1].toLowerCase();
      base64Payload = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be a valid image under 8 MB.' });
      return;
    }

    const apiKey = process.env.IMGBB_API_KEY?.trim();
    if (apiKey) {
      const formBody = new URLSearchParams();
      formBody.set('key', apiKey);
      formBody.set('image', base64Payload);
      formBody.set('name', rawName);

      const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });

      const imgbbJson = (await imgbbRes.json()) as {
        success?: boolean;
        data?: { url?: string; display_url?: string };
        error?: { message?: string };
      };

      if (!imgbbRes.ok || !imgbbJson.success || !imgbbJson.data) {
        res.status(502).json({
          error: imgbbJson.error?.message || 'ImgBB upload failed. Check IMGBB_API_KEY configuration.',
        });
        return;
      }

      res.json({
        url: imgbbJson.data.display_url || imgbbJson.data.url,
        provider: 'imgbb',
      });
      return;
    }

    // Graceful server-side storage fallback when IMGBB_API_KEY is not configured in environment
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const ext =
      mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

    res.json({
      url: `/api/uploads/${filename}`,
      provider: 'local_vault',
    });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Failed to process image upload.' });
  }
});

apiRouter.get('/auth/references', async (_req, res) => {
  try {
    const state = await loadVaultState();
    const activeMembers = state.users
      .filter((u) => u.status === 'active')
      .map((u) => ({ name: u.name, memberCode: u.memberCode }));
    res.json({ members: activeMembers });
  } catch (err) {
    console.error('Reference list error:', err);
    res.status(500).json({ error: 'Failed to load reference members.' });
  }
});

apiRouter.post('/auth/register', async (req, res) => {
  try {
    const googleRegistrationToken = String(req.body?.googleRegistrationToken || '').trim();
    let verifiedGoogle: ReturnType<typeof verifyGoogleRegistrationToken> | null = null;
    if (googleRegistrationToken) {
      try {
        verifiedGoogle = verifyGoogleRegistrationToken(googleRegistrationToken);
      } catch (tokenErr) {
        res.status(401).json({
          error:
            tokenErr instanceof Error
              ? tokenErr.message
              : 'Google onboarding token expired. Please verify with Google again.',
        });
        return;
      }
    }

    const name = String(req.body?.name || verifiedGoogle?.name || '').trim();
    const email = (verifiedGoogle ? verifiedGoogle.email : String(req.body?.email || ''))
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const dateOfBirth = String(req.body?.dateOfBirth || '').trim();
    const referenceMemberName = String(req.body?.referenceMemberName || '').trim();
    const mobile = String(req.body?.mobile || '').trim();
    const occupation = String(req.body?.occupation || '').trim();
    const companyOrganization = String(req.body?.companyOrganization || '').trim();
    const nid = String(req.body?.nid || '').trim();
    const presentAddress = String(req.body?.presentAddress || '').trim();
    const permanentAddress = String(req.body?.permanentAddress || '').trim();
    const photoUrl = String(req.body?.photoUrl || '').trim();
    const agreementPhotoUrl = String(req.body?.agreementPhotoUrl || '').trim();

    if (!verifiedGoogle && password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    if (verifiedGoogle && password.length > 0 && password.length < 6) {
      res.status(400).json({
        error: 'Optional backup password must be at least 6 characters long (or leave it blank).',
      });
      return;
    }

    if (
      !name ||
      !email ||
      !dateOfBirth ||
      !referenceMemberName ||
      !mobile ||
      !occupation ||
      !companyOrganization ||
      !nid ||
      !presentAddress ||
      !permanentAddress ||
      !photoUrl
    ) {
      res.status(400).json({
        error:
          'All required registration fields (including photo, NID, DOB, reference member, mobile, occupation, organization, and addresses) must be completed.',
      });
      return;
    }

    const registrationDetails: UserRegistrationDetails = {
      dateOfBirth,
      referenceMemberName,
      mobile,
      occupation,
      companyOrganization,
      nid,
      presentAddress,
      permanentAddress,
      photoUrl,
      agreementPhotoUrl: agreementPhotoUrl || undefined,
    };

    const passwordHash = password.length >= 6 ? bcrypt.hashSync(password, 10) : '';
    const authProvider: StoredUser['authProvider'] = verifiedGoogle
      ? passwordHash
        ? 'both'
        : 'google'
      : 'password';
    let createdUser!: StoredUser;
    let sanitized!: ReturnType<typeof sanitizeUser>;

    await updateVaultState((draft) => {
      if (
        draft.users.some(
          (u) =>
            u.email.toLowerCase() === email ||
            (verifiedGoogle && u.googleUid === verifiedGoogle.uid)
        )
      ) {
        throw new Error('EMAIL_IN_USE');
      }

      createdUser = {
        id: `usr-mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        passwordHash,
        googleUid: verifiedGoogle?.uid,
        authProvider,
        role: 'member',
        memberCode: nextMemberCode(draft.users),
        status: 'pending_approval',
        joinedAt: new Date().toISOString(),
        phoneMasked: maskReference(mobile),
        photoUrl,
        encryptedRegistrationDetails: encryptSensitiveObject(registrationDetails),
      };

      sanitized = sanitizeUser(createdUser);
      draft.users.push(createdUser);

      const activeAdmins = draft.users.filter((u) => u.role === 'admin' && u.status === 'active');
      activeAdmins.forEach((admin) => {
        queueEmailNotification(draft, {
          type: 'signup_pending_admin',
          recipientEmail: admin.email,
          recipientName: admin.name,
          recipientUserId: admin.id,
          subject: `New Member Signup Pending Approval: ${name} (${createdUser.memberCode})`,
          body: `${name} (${email}, Mobile: ${mobile}, Ref: ${referenceMemberName}${verifiedGoogle ? ', Google-verified email' : ''}) submitted a cooperative membership application (${createdUser.memberCode}). Inspect their registration details and approve in Admin & Reports before they can sign in.`,
          relatedId: createdUser.id,
        });
      });

      appendAuditLog(draft, {
        actor: sanitized,
        action: 'MEMBER_SIGNUP_REQUESTED',
        resourceType: 'auth',
        resourceId: createdUser.id,
        summary: `New registration from ${name} (${createdUser.memberCode}) queued for administrator approval`,
        payload: {
          email: createdUser.email,
          memberCode: createdUser.memberCode,
          referenceMemberName,
          authProvider,
          status: 'pending_approval',
        },
      });
      return draft;
    });

    broadcastRealtimeEvent('members:updated', { userId: createdUser.id });
    broadcastRealtimeEvent('notification:created', { type: 'signup_pending_admin' });
    broadcastRealtimeEvent('audit:updated', {
      action: 'MEMBER_SIGNUP_REQUESTED',
      resourceType: 'auth',
      resourceId: createdUser.id,
    });

    res.status(201).json({
      pendingApproval: true,
      user: sanitized,
      message: verifiedGoogle
        ? 'Membership application submitted with your verified Google account. An administrator will review your KYC details and approve your account before you can sign in with Google.'
        : 'Membership application submitted. An administrator will verify your registration details and approve your account before you can sign in.',
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

apiRouter.post('/auth/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.authUser });
});

apiRouter.get('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const storedUser = state.users.find((u) => u.id === req.authUser!.id);
    if (!storedUser) {
      res.status(404).json({ error: 'Member profile not found.' });
      return;
    }

    let registrationDetails: UserRegistrationDetails | undefined;
    if (storedUser.encryptedRegistrationDetails) {
      try {
        registrationDetails = decryptSensitiveObject<UserRegistrationDetails>(
          storedUser.encryptedRegistrationDetails
        );
      } catch {
        registrationDetails = undefined;
      }
    }

    res.json({
      user: {
        ...sanitizeUser(storedUser),
        registrationDetails,
      },
    });
  } catch (err) {
    console.error('Profile load error:', err);
    res.status(500).json({ error: 'Failed to load member profile.' });
  }
});

apiRouter.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const email =
      req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
    const mobile = String(req.body?.mobile || '').trim();
    const presentAddress = String(req.body?.presentAddress || '').trim();
    const permanentAddress = String(req.body?.permanentAddress || '').trim();
    const occupation =
      req.body?.occupation !== undefined ? String(req.body.occupation).trim() : undefined;
    const companyOrganization =
      req.body?.companyOrganization !== undefined
        ? String(req.body.companyOrganization).trim()
        : undefined;

    if (!mobile || !presentAddress || !permanentAddress) {
      res.status(400).json({
        error: 'Mobile number, present address, and permanent address are required.',
      });
      return;
    }

    if (name !== undefined && name.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    if (email !== undefined && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    let updatedPublicUser: ReturnType<typeof sanitizeUser> & {
      registrationDetails?: UserRegistrationDetails;
    } | null = null;

    await updateVaultState((draft) => {
      const target = draft.users.find((u) => u.id === viewer.id);
      if (!target) return draft;

      if (email && email !== target.email.toLowerCase()) {
        const duplicate = draft.users.some(
          (u) => u.id !== target.id && u.email.toLowerCase() === email
        );
        if (duplicate) {
          throw new Error('EMAIL_IN_USE');
        }
        target.email = email;
      }

      if (name) {
        target.name = name;
      }

      target.phoneMasked = maskReference(mobile);

      let existingDetails: UserRegistrationDetails = {
        dateOfBirth: '',
        referenceMemberName: 'Amanah Administrator',
        mobile,
        occupation: occupation || '',
        companyOrganization: companyOrganization || '',
        nid: '',
        presentAddress,
        permanentAddress,
        photoUrl: target.photoUrl || '',
      };

      if (target.encryptedRegistrationDetails) {
        try {
          existingDetails = decryptSensitiveObject<UserRegistrationDetails>(
            target.encryptedRegistrationDetails
          );
        } catch {
          // fallback to baseline object if decryption fails
        }
      }

      const nextDetails: UserRegistrationDetails = {
        ...existingDetails,
        mobile,
        presentAddress,
        permanentAddress,
        occupation: occupation !== undefined ? occupation : existingDetails.occupation,
        companyOrganization:
          companyOrganization !== undefined
            ? companyOrganization
            : existingDetails.companyOrganization,
      };

      target.encryptedRegistrationDetails = encryptSensitiveObject(nextDetails);

      const sanitized = sanitizeUser(target);
      updatedPublicUser = {
        ...sanitized,
        registrationDetails: nextDetails,
      };

      appendAuditLog(draft, {
        actor: sanitized,
        action: 'MEMBER_PROFILE_UPDATED',
        resourceType: 'auth',
        resourceId: target.id,
        summary: `${target.name} (${target.memberCode}) updated encrypted contact & profile information`,
        payload: {
          userId: target.id,
          email: target.email,
          phoneMasked: target.phoneMasked,
        },
      });

      return draft;
    });

    if (!updatedPublicUser) {
      res.status(404).json({ error: 'Member profile not found.' });
      return;
    }

    broadcastRealtimeEvent('members:updated', { userId: viewer.id });
    broadcastRealtimeEvent('audit:updated', {
      action: 'MEMBER_PROFILE_UPDATED',
      resourceType: 'auth',
      resourceId: viewer.id,
    });
    res.json({ user: updatedPublicUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
      res.status(409).json({ error: 'Another member account already uses that email address.' });
      return;
    }
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update member profile.' });
  }
});

// ---------------------------------------------------------------------------
// 2. Real-time Dashboard Overview
// ---------------------------------------------------------------------------

apiRouter.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const overview = buildDashboardOverview(state, req.authUser!);
    res.json(overview);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load treasury overview.' });
  }
});

// ---------------------------------------------------------------------------
// 3. Monthly Contributions (Bank / MFS -> Manager Approval)
// ---------------------------------------------------------------------------

apiRouter.get('/contributions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const isReviewer = viewer.role === 'admin' || viewer.role === 'manager';

    const list = isReviewer
      ? state.contributions
      : state.contributions.filter((c) => c.userId === viewer.id);

    const hydrated = list.map((c) => hydrateContributionForViewer(c, viewer));
    res.json({ contributions: hydrated });
  } catch (err) {
    console.error('List contributions error:', err);
    res.status(500).json({ error: 'Failed to load contributions.' });
  }
});

apiRouter.post('/contributions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const billingMonth = String(req.body?.billingMonth || '').trim();
    const amount = Number(req.body?.amount);
    const channel = req.body?.channel === 'mfs' ? 'mfs' : 'bank';
    const providerName = String(req.body?.providerName || '').trim();
    const referenceId = String(req.body?.referenceId || '').trim();
    const senderAccount = String(req.body?.senderAccount || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      res.status(400).json({ error: 'Billing month must be in YYYY-MM format.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Contribution amount must be greater than zero.' });
      return;
    }
    if (!providerName || !referenceId || !senderAccount) {
      res
        .status(400)
        .json({ error: 'Provider/bank name, sender account/number, and TrxID/reference are required.' });
      return;
    }

    const id = `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const encryptedDetails = encryptSensitiveObject({
      referenceId,
      senderAccount,
      notes: notes || `Monthly contribution for ${billingMonth}`,
    });

    const newContribution: Contribution = {
      id,
      userId: viewer.id,
      memberName: viewer.name,
      memberCode: viewer.memberCode,
      billingMonth,
      amount,
      channel,
      providerName,
      maskedReference: maskReference(referenceId),
      encryptedDetails,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      entryHash: computeSha256Hash({
        id,
        userId: viewer.id,
        billingMonth,
        amount,
        channel,
        referenceId,
      }),
    };

    await updateVaultState((draft) => {
      draft.contributions.unshift(newContribution);
      const reviewers = draft.users.filter(
        (u) => (u.role === 'manager' || u.role === 'admin') && u.status === 'active'
      );
      reviewers.forEach((mgr) => {
        queueEmailNotification(draft, {
          type: 'contribution_placed_manager',
          recipientEmail: mgr.email,
          recipientName: mgr.name,
          recipientUserId: mgr.id,
          subject: `Contribution Placement Request: ${viewer.name} (${billingMonth})`,
          body: `${viewer.name} (${viewer.memberCode}) submitted a monthly contribution of ${amount} ${draft.fundConfig.currency} via ${channel.toUpperCase()} (${providerName}, Ref ${newContribution.maskedReference}) for ${billingMonth}. Please review and approve to credit the central balance.`,
          relatedId: id,
        });
      });

      appendAuditLog(draft, {
        actor: viewer,
        action: 'CONTRIBUTION_SUBMITTED',
        resourceType: 'contribution',
        resourceId: id,
        summary: `${viewer.name} submitted ${channel.toUpperCase()} contribution (${providerName}) for ${billingMonth}`,
        payload: {
          contributionId: id,
          billingMonth,
          amount,
          channel,
          providerName,
          maskedReference: newContribution.maskedReference,
        },
      });
      return draft;
    });

    broadcastRealtimeEvent('contribution:submitted', {
      contributionId: newContribution.id,
      billingMonth: newContribution.billingMonth,
      amount: newContribution.amount,
    });
    broadcastRealtimeEvent('notification:created', { type: 'contribution_placed_manager' });
    broadcastRealtimeEvent('audit:updated', {
      action: 'CONTRIBUTION_SUBMITTED',
      resourceType: 'contribution',
      resourceId: newContribution.id,
    });

    res.status(201).json({
      contribution: hydrateContributionForViewer(newContribution, viewer),
    });
  } catch (err) {
    console.error('Create contribution error:', err);
    res.status(500).json({ error: 'Failed to submit contribution request.' });
  }
});

apiRouter.patch(
  '/contributions/:id/review',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const decision = req.body?.decision === 'approved' ? 'approved' : req.body?.decision === 'rejected' ? 'rejected' : null;
      const reviewNote = String(req.body?.reviewNote || '').trim();

      if (!decision) {
        res.status(400).json({ error: 'Decision must be "approved" or "rejected".' });
        return;
      }

      const viewer = req.authUser!;
      let updated: Contribution | null = null;

      await updateVaultState((draft) => {
        const idx = draft.contributions.findIndex((c) => c.id === id);
        if (idx === -1) return draft;

        const target = draft.contributions[idx];
        if (target.status !== 'pending') {
          throw new Error('ALREADY_REVIEWED');
        }

        target.status = decision;
        target.reviewedAt = new Date().toISOString();
        target.reviewedBy = viewer.id;
        target.reviewerName = viewer.name;
        target.reviewNote =
          reviewNote ||
          (decision === 'approved'
            ? 'Verified against Bank/MFS settlement statement.'
            : 'Reference could not be reconciled.');

        updated = target;

        if (decision === 'approved') {
          const member = draft.users.find((u) => u.id === target.userId);
          if (member) {
            queueEmailNotification(draft, {
              type: 'contribution_accepted',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Contribution Accepted: ${target.amount} ${draft.fundConfig.currency} (${target.billingMonth})`,
              body: `Assalamu Alaikum ${member.name}, your monthly contribution of ${target.amount} ${draft.fundConfig.currency} via ${target.providerName} (${target.billingMonth}) has been verified by ${viewer.name} and added to the cooperative central fund balance.`,
              relatedId: target.id,
            });
          }
        }

        appendAuditLog(draft, {
          actor: viewer,
          action: decision === 'approved' ? 'CONTRIBUTION_APPROVED' : 'CONTRIBUTION_REJECTED',
          resourceType: 'contribution',
          resourceId: target.id,
          summary: `${viewer.name} ${decision} ${target.memberName}'s ${target.billingMonth} contribution (${target.amount})`,
          payload: {
            contributionId: target.id,
            memberId: target.userId,
            amount: target.amount,
            decision,
            reviewNote: target.reviewNote,
          },
        });

        return draft;
      });

      if (!updated) {
        res.status(404).json({ error: 'Contribution request not found.' });
        return;
      }

      broadcastRealtimeEvent('contribution:reviewed', {
        contributionId: (updated as Contribution).id,
        decision,
      });
      broadcastRealtimeEvent('notification:created', { type: 'contribution_accepted' });
      broadcastRealtimeEvent('audit:updated', {
        action: decision === 'approved' ? 'CONTRIBUTION_APPROVED' : 'CONTRIBUTION_REJECTED',
        resourceType: 'contribution',
        resourceId: (updated as Contribution).id,
      });
      res.json({ contribution: hydrateContributionForViewer(updated, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_REVIEWED') {
        res.status(409).json({ error: 'This contribution has already been reviewed.' });
        return;
      }
      console.error('Review contribution error:', err);
      res.status(500).json({ error: 'Failed to review contribution.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. Qard Hasan Loans, Eligibility, 2/3 Member Voting, Disbursement & Repayments
// ---------------------------------------------------------------------------

apiRouter.get('/loans/eligibility', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const eligibility = evaluateLoanEligibility(state, req.authUser!.id);
    res.json({ eligibility });
  } catch (err) {
    console.error('Eligibility check error:', err);
    res.status(500).json({ error: 'Failed to evaluate eligibility.' });
  }
});

apiRouter.get('/loans', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const loans = state.loans.map((l) => hydrateLoanForViewer(l, viewer));
    res.json({ loans });
  } catch (err) {
    console.error('List loans error:', err);
    res.status(500).json({ error: 'Failed to load loan requests.' });
  }
});

apiRouter.post('/loans', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const amount = Number(req.body?.amount);
    const installmentMonths = Number(req.body?.installmentMonths);
    const purpose = String(req.body?.purpose || '').trim();
    const emergencyContext = String(req.body?.emergencyContext || '').trim();
    const disbursementAccount = String(req.body?.disbursementAccount || '').trim();
    const channel = req.body?.channel === 'mfs' ? 'mfs' : 'bank';
    const provider = String(req.body?.provider || '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Loan amount must be positive.' });
      return;
    }
    if (!Number.isInteger(installmentMonths) || installmentMonths < 1 || installmentMonths > 24) {
      res.status(400).json({ error: 'Installment duration must be between 1 and 24 months.' });
      return;
    }
    if (!purpose || !disbursementAccount || !provider) {
      res.status(400).json({
        error: 'Loan purpose, payout channel provider, and payout account/number are required.',
      });
      return;
    }

    const encryptedSensitiveNotes = encryptSensitiveObject({
      emergencyContext: emergencyContext || purpose,
      disbursementAccount,
      channel,
      provider,
    });

    let createdLoan!: LoanRequest;
    let currency: FundConfig['currency'] = 'BDT';

    await updateVaultState((draft) => {
      const dbUser = draft.users.find((u) => u.id === viewer.id);
      if (!dbUser || dbUser.status !== 'active') {
        throw new Error('UNVERIFIED_MEMBER');
      }

      const eligibility = evaluateLoanEligibility(draft, viewer.id);
      if (!eligibility.eligible) {
        const err = new Error('LOAN_INELIGIBLE') as Error & { eligibility?: typeof eligibility };
        err.eligibility = eligibility;
        throw err;
      }

      if (amount > draft.fundConfig.maxLoanAmount) {
        throw new Error(`AMOUNT_EXCEEDS_MAX:${draft.fundConfig.maxLoanAmount}`);
      }
      if (installmentMonths > draft.fundConfig.maxInstallmentMonths) {
        throw new Error(`MONTHS_EXCEED_MAX:${draft.fundConfig.maxInstallmentMonths}`);
      }

      const overview = buildDashboardOverview(draft, viewer);
      const { activeVoters, requiredApprovals } = computeRequiredApprovals(draft);
      const id = nextLoanId(draft.loans);
      const requestedAt = new Date().toISOString();
      currency = draft.fundConfig.currency;

      const baseInstallment = Math.floor((amount / installmentMonths) * 100) / 100;
      const installments: InstallmentItem[] = Array.from({ length: installmentMonths }, (_, idx) => {
        const isLast = idx === installmentMonths - 1;
        const installmentAmount = isLast
          ? Math.round((amount - baseInstallment * (installmentMonths - 1)) * 100) / 100
          : baseInstallment;

        return {
          installmentNumber: idx + 1,
          dueDate: computeInstallmentDueDate(requestedAt, idx + 1),
          amount: installmentAmount,
          paidAmount: 0,
          status: 'scheduled',
        };
      });

      createdLoan = {
        id,
        borrowerId: viewer.id,
        borrowerName: viewer.name,
        borrowerCode: viewer.memberCode,
        amount,
        installmentMonths,
        monthlyInstallment: Math.round((amount / installmentMonths) * 100) / 100,
        purpose,
        encryptedSensitiveNotes,
        status: 'pending_vote',
        eligibilitySnapshot: eligibility,
        votes: [],
        requiredApprovals,
        totalEligibleVoters: activeVoters,
        installments,
        totalRepaid: 0,
        remainingBalance: amount,
        requestedAt,
        entryHash: computeSha256Hash({
          id,
          borrowerId: viewer.id,
          amount,
          installmentMonths,
          purpose,
        }),
      };

      draft.loans.unshift(createdLoan);

      const notifiedIds = new Set<string>();
      const adminsAndManagers = draft.users.filter(
        (u) => u.status === 'active' && (u.role === 'admin' || u.role === 'manager')
      );
      adminsAndManagers.forEach((staff) => {
        notifiedIds.add(staff.id);
        queueEmailNotification(draft, {
          type: 'loan_vote_requested',
          recipientEmail: staff.email,
          recipientName: staff.name,
          recipientUserId: staff.id,
          subject: `Qard Hasan Loan Review Needed: ${viewer.name} (${id})`,
          body: `${viewer.name} (${viewer.memberCode}) submitted a ${amount} ${currency} Qard Hasan loan request (${installmentMonths} monthly installments) for "${purpose}". Review in Admin & Reports or 2/3 Member Voting (Available liquidity: ${overview.treasury.availableLiquidity} ${currency}).`,
          relatedId: id,
        });
      });

      const eligibleVoters = draft.users.filter(
        (u) => u.status === 'active' && u.id !== viewer.id && !notifiedIds.has(u.id)
      );
      eligibleVoters.forEach((member) => {
        queueEmailNotification(draft, {
          type: 'loan_vote_requested',
          recipientEmail: member.email,
          recipientName: member.name,
          recipientUserId: member.id,
          subject: `2/3 Majority Vote Needed: ${viewer.name} (${id})`,
          body: `${viewer.name} (${viewer.memberCode}) submitted a ${amount} ${currency} Qard Hasan loan proposal (${installmentMonths} monthly installments) for "${purpose}". Your vote is requested in the 2/3 Member Voting tab (${requiredApprovals} of ${activeVoters} approvals required).`,
          relatedId: id,
        });
      });

      appendAuditLog(draft, {
        actor: viewer,
        action: 'LOAN_REQUEST_CREATED',
        resourceType: 'loan',
        resourceId: id,
        summary: `${viewer.name} submitted a ${amount} Qard Hasan request (${installmentMonths} monthly installments) for administrative review & 2/3 vote`,
        payload: {
          loanId: id,
          amount,
          installmentMonths,
          requiredApprovals,
          totalEligibleVoters: activeVoters,
          availableLiquidityAtSubmission: overview.treasury.availableLiquidity,
        },
      });
      return draft;
    });

    broadcastRealtimeEvent('loan:created', {
      loanId: createdLoan.id,
      borrowerId: viewer.id,
      borrowerName: viewer.name,
      borrowerCode: viewer.memberCode,
      amount,
      currency,
      requiredApprovals: createdLoan.requiredApprovals,
      totalEligibleVoters: createdLoan.totalEligibleVoters,
      purpose,
    });
    broadcastRealtimeEvent('notification:created', {
      type: 'loan_vote_requested',
      loanId: createdLoan.id,
    });
    broadcastRealtimeEvent('audit:updated', {
      action: 'LOAN_REQUEST_CREATED',
      resourceType: 'loan',
      resourceId: createdLoan.id,
    });

    res.status(201).json({ loan: hydrateLoanForViewer(createdLoan, viewer) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'UNVERIFIED_MEMBER') {
        res.status(403).json({
          error: 'Only verified active members can submit a Qard Hasan loan request.',
        });
        return;
      }
      if (err.message === 'LOAN_INELIGIBLE') {
        const eligibility = (err as Error & { eligibility?: ReturnType<typeof evaluateLoanEligibility> }).eligibility;
        res.status(400).json({
          error: eligibility?.reasons[0] || 'Member is not eligible for a Qard Hasan loan right now.',
          eligibility,
        });
        return;
      }
      if (err.message.startsWith('AMOUNT_EXCEEDS_MAX:')) {
        const cap = err.message.split(':')[1];
        res.status(400).json({ error: `Requested amount exceeds cooperative cap of ${cap}.` });
        return;
      }
      if (err.message.startsWith('MONTHS_EXCEED_MAX:')) {
        const maxM = err.message.split(':')[1];
        res.status(400).json({ error: `Installment schedule cannot exceed ${maxM} months.` });
        return;
      }
    }
    console.error('Create loan error:', err);
    res.status(500).json({ error: 'Failed to submit loan request.' });
  }
});

apiRouter.post('/loans/:id/vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const rawDecision = String(req.body?.decision || '').toLowerCase();
    const decision =
      rawDecision === 'approve' || rawDecision === 'upvote'
        ? 'approve'
        : rawDecision === 'reject' || rawDecision === 'downvote'
          ? 'reject'
          : null;
    const comment = String(req.body?.comment || '').trim();

    if (!decision) {
      res.status(400).json({
        error: 'Vote decision must be "upvote", "downvote", "approve", or "reject".',
      });
      return;
    }

    const viewer = req.authUser!;
    if (viewer.status !== 'active') {
      res.status(403).json({
        error: 'Only verified active cooperative members can vote on Qard Hasan loan requests.',
      });
      return;
    }

    let updatedLoan: LoanRequest | null = null;
    let quorumDecision: 'approve' | 'reject' | null = null;

    await updateVaultState((draft) => {
      const voterRecord = draft.users.find((u) => u.id === viewer.id);
      if (!voterRecord || voterRecord.status !== 'active') {
        throw new Error('UNVERIFIED_MEMBER');
      }

      const loan = draft.loans.find((l) => l.id === id);
      if (!loan) return draft;

      if (loan.status !== 'pending_vote') {
        throw new Error('VOTING_CLOSED');
      }
      if (loan.votes.some((v) => v.voterId === viewer.id)) {
        throw new Error('ALREADY_VOTED');
      }

      const castAt = new Date().toISOString();
      loan.votes.push({
        voterId: viewer.id,
        voterName: viewer.name,
        voterRole: viewer.role,
        decision,
        comment: comment || undefined,
        castAt,
        signatureHash: computeSha256Hash({
          loanId: loan.id,
          voterId: viewer.id,
          decision,
          castAt,
        }),
      });

      const approveCount = loan.votes.filter((v) => v.decision === 'approve').length;
      const rejectCount = loan.votes.filter((v) => v.decision === 'reject').length;

      if (approveCount >= loan.requiredApprovals) {
        loan.status = 'approved_pending_disbursement';
        loan.approvedAt = castAt;
        quorumDecision = 'approve';
        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: 'loan_approved_confirmation',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: `Qard Hasan Approved (2/3 Quorum): ${loan.id}`,
            body: `Assalamu Alaikum ${borrower.name}, your interest-free Qard Hasan request (${loan.id}) for ${loan.amount} ${draft.fundConfig.currency} reached the 2/3 member quorum (${approveCount}/${loan.requiredApprovals}). The principal has been allocated from the central fund balance and is ready for treasury disbursement.`,
            relatedId: loan.id,
          });
        }
      } else if (rejectCount > loan.totalEligibleVoters - loan.requiredApprovals) {
        loan.status = 'rejected';
        quorumDecision = 'reject';
        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: 'loan_rejected_notice',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: `Qard Hasan Request Declined (Member Vote): ${loan.id}`,
            body: `Assalamu Alaikum ${borrower.name}, your Qard Hasan request (${loan.id}) for ${loan.amount} ${draft.fundConfig.currency} did not reach the required 2/3 member approval quorum and has been declined.`,
            relatedId: loan.id,
          });
        }
      }

      updatedLoan = loan;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'LOAN_VOTE_CAST',
        resourceType: 'vote',
        resourceId: loan.id,
        summary: `An anonymized verified member cast ${decision === 'approve' ? 'UPVOTE (Approve)' : 'DOWNVOTE (Reject)'} on ${loan.borrowerName}'s loan (${approveCount}/${loan.requiredApprovals} approvals)`,
        payload: {
          loanId: loan.id,
          decision,
          approveCount,
          rejectCount,
          requiredApprovals: loan.requiredApprovals,
          resultingStatus: loan.status,
        },
      });

      if (loan.status === 'approved_pending_disbursement' || loan.status === 'rejected') {
        appendAuditLog(draft, {
          actor: viewer,
          action:
            loan.status === 'approved_pending_disbursement'
              ? 'LOAN_QUORUM_APPROVED'
              : 'LOAN_QUORUM_REJECTED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary:
            loan.status === 'approved_pending_disbursement'
              ? `Qard Hasan loan ${loan.id} (${loan.borrowerName}) reached 2/3 approval quorum and moved to approved_pending_disbursement`
              : `Qard Hasan loan ${loan.id} (${loan.borrowerName}) failed 2/3 approval quorum and moved to rejected`,
          payload: {
            loanId: loan.id,
            previousStatus: 'pending_vote',
            resultingStatus: loan.status,
            approveCount,
            rejectCount,
            requiredApprovals: loan.requiredApprovals,
          },
        });
      }

      return draft;
    });

    if (!updatedLoan) {
      res.status(404).json({ error: 'Loan request not found.' });
      return;
    }

    broadcastRealtimeEvent('loan:voted', { loanId: id });
    if (quorumDecision) {
      broadcastRealtimeEvent('loan:reviewed', {
        loanId: id,
        borrowerId: (updatedLoan as LoanRequest).borrowerId,
        decision: quorumDecision,
      });
      broadcastRealtimeEvent('notification:created', {
        type: quorumDecision === 'approve' ? 'loan_approved_confirmation' : 'loan_rejected_notice',
        recipientUserId: (updatedLoan as LoanRequest).borrowerId,
      });
    }
    broadcastRealtimeEvent('audit:updated', {
      action: 'LOAN_VOTE_CAST',
      resourceType: 'vote',
      resourceId: id,
    });
    res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNVERIFIED_MEMBER') {
      res.status(403).json({
        error: 'Only verified active cooperative members can vote on Qard Hasan loan requests.',
      });
      return;
    }
    if (err instanceof Error && err.message === 'VOTING_CLOSED') {
      res.status(409).json({ error: 'Voting has already closed for this loan request.' });
      return;
    }
    if (err instanceof Error && err.message === 'ALREADY_VOTED') {
      res.status(409).json({ error: 'You have already cast your vote on this loan request.' });
      return;
    }
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote.' });
  }
});

apiRouter.patch(
  '/loans/:id/admin-review',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const decision =
        req.body?.decision === 'approve'
          ? 'approve'
          : req.body?.decision === 'reject'
            ? 'reject'
            : null;
      const reviewNote = String(req.body?.reviewNote || '').trim();

      if (!decision) {
        res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
        return;
      }

      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;
      let reviewedBorrowerId = '';

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        if (loan.status !== 'pending_vote') {
          throw new Error('ALREADY_REVIEWED');
        }

        const reviewedAt = new Date().toISOString();
        loan.adminDecision = decision === 'approve' ? 'approved' : 'rejected';
        loan.adminReviewedAt = reviewedAt;
        loan.adminReviewedBy = viewer.name;
        loan.adminReviewNote = reviewNote || undefined;
        reviewedBorrowerId = loan.borrowerId;

        if (decision === 'approve') {
          const overview = buildDashboardOverview(draft, viewer);
          if (loan.amount > overview.treasury.availableLiquidity) {
            throw new Error('INSUFFICIENT_LIQUIDITY');
          }
          loan.status = 'approved_pending_disbursement';
          loan.approvedAt = reviewedAt;
        } else {
          loan.status = 'rejected';
        }

        updatedLoan = loan;

        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: decision === 'approve' ? 'loan_approved_confirmation' : 'loan_rejected_notice',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject:
              decision === 'approve'
                ? `Qard Hasan Approved by Administration: ${loan.id}`
                : `Qard Hasan Request Declined: ${loan.id}`,
            body:
              decision === 'approve'
                ? `Assalamu Alaikum ${borrower.name}, your Qard Hasan request (${loan.id}) for ${loan.amount} ${draft.fundConfig.currency} has been approved during administrative review by ${viewer.name} and queued for treasury disbursement.${reviewNote ? ` Note: ${reviewNote}` : ''}`
                : `Assalamu Alaikum ${borrower.name}, your Qard Hasan request (${loan.id}) for ${loan.amount} ${draft.fundConfig.currency} was declined during administrative review by ${viewer.name}.${reviewNote ? ` Reason: ${reviewNote}` : ''}`,
            relatedId: loan.id,
          });
        }

        appendAuditLog(draft, {
          actor: viewer,
          action: decision === 'approve' ? 'LOAN_ADMIN_APPROVED' : 'LOAN_ADMIN_REJECTED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} ${decision === 'approve' ? 'approved' : 'declined'} ${loan.borrowerName}'s Qard Hasan request (${loan.id}) in administrative review`,
          payload: {
            loanId: loan.id,
            decision,
            reviewNote: reviewNote || undefined,
            resultingStatus: loan.status,
          },
        });

        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan request not found.' });
        return;
      }

      const notifType =
        decision === 'approve' ? 'loan_approved_confirmation' : 'loan_rejected_notice';
      broadcastRealtimeEvent('loan:reviewed', {
        loanId: id,
        borrowerId: reviewedBorrowerId,
        decision,
      });
      broadcastRealtimeEvent('loan:voted', { loanId: id });
      broadcastRealtimeEvent('notification:created', {
        type: notifType,
        recipientUserId: reviewedBorrowerId,
      });
      broadcastRealtimeEvent('audit:updated', {
        action: decision === 'approve' ? 'LOAN_ADMIN_APPROVED' : 'LOAN_ADMIN_REJECTED',
        resourceType: 'loan',
        resourceId: id,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_REVIEWED') {
        res.status(409).json({ error: 'This loan request is no longer pending review.' });
        return;
      }
      if (err instanceof Error && err.message === 'INSUFFICIENT_LIQUIDITY') {
        res.status(400).json({
          error: 'Insufficient available central treasury liquidity to approve this loan for disbursement.',
        });
        return;
      }
      console.error('Admin loan review error:', err);
      res.status(500).json({ error: 'Failed to process administrative loan review.' });
    }
  }
);

apiRouter.post(
  '/loans/:id/disburse',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        if (loan.status !== 'approved_pending_disbursement') {
          throw new Error('NOT_READY_FOR_DISBURSEMENT');
        }

        const overview = buildDashboardOverview(draft, viewer);
        if (overview.treasury.centralBalance < 0) {
          throw new Error('INSUFFICIENT_LIQUIDITY');
        }

        const signedAt = new Date().toISOString();
        loan.status = 'active';
        loan.disbursedAt = signedAt;
        loan.disbursementSignature = {
          signedById: viewer.id,
          signedByName: viewer.name,
          signedByRole: viewer.role,
          signedAt,
          signatureHash: computeSha256Hash({
            disburse: loan.id,
            amount: loan.amount,
            signedBy: viewer.id,
            signedAt,
          }),
        };

        loan.installments = loan.installments.map((inst, idx) => ({
          ...inst,
          dueDate: computeInstallmentDueDate(signedAt, idx + 1),
        }));

        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: 'loan_approved_confirmation',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: `Qard Hasan Disbursed: ${loan.id}`,
            body: `Assalamu Alaikum ${borrower.name}, ${viewer.name} completed multi-sig treasury disbursement of ${loan.amount} ${draft.fundConfig.currency} for ${loan.id}. Your ${loan.installmentMonths}-month 0% repayment schedule is now active.`,
            relatedId: loan.id,
          });
        }

        updatedLoan = loan;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'LOAN_DISBURSED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} executed multi-sig Qard Hasan disbursement of ${loan.amount} to ${loan.borrowerName}`,
          payload: {
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            amount: loan.amount,
            signatureHash: loan.disbursementSignature.signatureHash,
          },
        });

        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan request not found.' });
        return;
      }

      broadcastRealtimeEvent('loan:reviewed', {
        loanId: id,
        borrowerId: (updatedLoan as LoanRequest).borrowerId,
        decision: 'disbursed',
      });
      broadcastRealtimeEvent('notification:created', {
        type: 'loan_approved_confirmation',
        recipientUserId: (updatedLoan as LoanRequest).borrowerId,
      });
      broadcastRealtimeEvent('audit:updated', {
        action: 'LOAN_DISBURSED',
        resourceType: 'loan',
        resourceId: id,
      });

      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_READY_FOR_DISBURSEMENT') {
        res.status(409).json({ error: 'Loan must pass 2/3 member voting before disbursement.' });
        return;
      }
      if (err instanceof Error && err.message === 'INSUFFICIENT_LIQUIDITY') {
        res.status(400).json({ error: 'Insufficient cooperative treasury liquidity for disbursement.' });
        return;
      }
      console.error('Disbursement error:', err);
      res.status(500).json({ error: 'Failed to disburse loan.' });
    }
  }
);

apiRouter.post(
  '/loans/:id/installments/:installmentNumber/submit',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id, installmentNumber } = req.params;
      const num = Number(installmentNumber);
      const channel = req.body?.channel === 'mfs' ? 'mfs' : 'bank';
      const providerName = String(req.body?.providerName || '').trim();
      const referenceId = String(req.body?.referenceId || '').trim();
      const senderAccount = String(req.body?.senderAccount || '').trim();
      const notes = String(req.body?.notes || '').trim();

      if (!Number.isInteger(num) || num < 1) {
        res.status(400).json({ error: 'Installment number must be a positive integer.' });
        return;
      }
      if (!providerName || !referenceId || !senderAccount) {
        res
          .status(400)
          .json({ error: 'Payment provider, sender account/number, and reference TrxID are required.' });
        return;
      }

      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        if (loan.borrowerId !== viewer.id && viewer.role === 'member') {
          throw new Error('FORBIDDEN');
        }
        if (loan.status !== 'active') {
          throw new Error('LOAN_NOT_ACTIVE');
        }

        const inst = loan.installments.find((i) => i.installmentNumber === num);
        if (!inst) {
          throw new Error('INSTALLMENT_NOT_FOUND');
        }
        if (inst.status === 'paid' || inst.status === 'pending_verification') {
          throw new Error('INSTALLMENT_ALREADY_SUBMITTED');
        }

        inst.status = 'pending_verification';
        inst.submittedAt = new Date().toISOString();
        inst.repaymentChannel = channel;
        inst.repaymentProvider = providerName;
        inst.maskedReference = maskReference(referenceId);
        inst.encryptedReceipt = encryptSensitiveObject({
          referenceId,
          senderAccount,
          notes: notes || `Installment #${num} repayment`,
        });

        updatedLoan = loan;

        const staff = draft.users.filter(
          (u) => (u.role === 'manager' || u.role === 'admin') && u.status === 'active'
        );
        staff.forEach((mgr) => {
          queueEmailNotification(draft, {
            type: 'loan_repayment_notice',
            recipientEmail: mgr.email,
            recipientName: mgr.name,
            recipientUserId: mgr.id,
            subject: `Loan Repayment Submitted: ${loan.id} Installment #${num}`,
            body: `${viewer.name} submitted installment #${num} (${inst.amount} ${draft.fundConfig.currency}) for ${loan.id} via ${providerName} (${inst.maskedReference}). Verify receipt to credit the central balance.`,
            relatedId: `${loan.id}#${num}`,
          });
        });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'REPAYMENT_SUBMITTED',
          resourceType: 'repayment',
          resourceId: `${loan.id}#${num}`,
          summary: `${viewer.name} submitted installment #${num} repayment (${inst.amount}) via ${providerName}`,
          payload: {
            loanId: loan.id,
            installmentNumber: num,
            amount: inst.amount,
            channel,
            providerName,
            maskedReference: inst.maskedReference,
          },
        });

        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan not found.' });
        return;
      }

      broadcastRealtimeEvent('repayment:submitted', {
        loanId: id,
        installmentNumber: num,
      });
      broadcastRealtimeEvent('notification:created', { type: 'loan_repayment_notice' });
      broadcastRealtimeEvent('audit:updated', {
        action: 'REPAYMENT_SUBMITTED',
        resourceType: 'repayment',
        resourceId: `${id}#${num}`,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Only the borrower or treasury staff can submit installments.' });
        return;
      }
      if (err instanceof Error && err.message === 'LOAN_NOT_ACTIVE') {
        res.status(409).json({ error: 'Repayments can only be submitted on active disbursed loans.' });
        return;
      }
      if (err instanceof Error && err.message === 'INSTALLMENT_NOT_FOUND') {
        res.status(404).json({ error: 'Installment number not found on this loan schedule.' });
        return;
      }
      if (err instanceof Error && err.message === 'INSTALLMENT_ALREADY_SUBMITTED') {
        res.status(409).json({ error: 'Installment is already paid or awaiting verification.' });
        return;
      }
      console.error('Submit installment error:', err);
      res.status(500).json({ error: 'Failed to submit installment repayment.' });
    }
  }
);

apiRouter.patch(
  '/loans/:id/installments/:installmentNumber/verify',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id, installmentNumber } = req.params;
      const num = Number(installmentNumber);
      const rawDecision = req.body?.decision;
      if (!Number.isInteger(num) || num < 1) {
        res.status(400).json({ error: 'Installment number must be a positive integer.' });
        return;
      }
      if (rawDecision !== 'approve' && rawDecision !== 'reject') {
        res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
        return;
      }
      const approve = rawDecision === 'approve';
      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        const inst = loan.installments.find((i) => i.installmentNumber === num);
        if (!inst) {
          throw new Error('INSTALLMENT_NOT_FOUND');
        }
        if (inst.status !== 'pending_verification') {
          throw new Error('NO_PENDING_INSTALLMENT');
        }

        if (approve) {
          inst.status = 'paid';
          inst.paidAmount = inst.amount;
          inst.paidAt = new Date().toISOString();
          inst.verifiedBy = viewer.id;
          inst.verifierName = viewer.name;

          loan.totalRepaid =
            Math.round(loan.installments.reduce((s, i) => s + i.paidAmount, 0) * 100) / 100;
          loan.remainingBalance = Math.max(0, Math.round((loan.amount - loan.totalRepaid) * 100) / 100);

          if (loan.remainingBalance <= 0) {
            loan.status = 'repaid';
            loan.completedAt = new Date().toISOString();
          }
        } else {
          inst.status = 'scheduled';
          inst.submittedAt = undefined;
          inst.repaymentChannel = undefined;
          inst.repaymentProvider = undefined;
          inst.maskedReference = undefined;
          inst.encryptedReceipt = undefined;
        }

        updatedLoan = loan;

        if (approve) {
          const borrower = draft.users.find((u) => u.id === loan.borrowerId);
          if (borrower) {
            queueEmailNotification(draft, {
              type: 'loan_repayment_notice',
              recipientEmail: borrower.email,
              recipientName: borrower.name,
              recipientUserId: borrower.id,
              subject: `Repayment Verified: ${loan.id} Installment #${num}`,
              body: `Assalamu Alaikum ${borrower.name}, installment #${num} (${inst.amount} ${draft.fundConfig.currency}) for ${loan.id} has been verified by ${viewer.name} and added back to the central fund balance. Remaining balance: ${loan.remainingBalance} ${draft.fundConfig.currency}.`,
              relatedId: `${loan.id}#${num}`,
            });
          }
        }

        appendAuditLog(draft, {
          actor: viewer,
          action: approve ? 'REPAYMENT_VERIFIED' : 'REPAYMENT_REJECTED',
          resourceType: 'repayment',
          resourceId: `${loan.id}#${num}`,
          summary: `${viewer.name} ${approve ? 'verified' : 'rejected'} installment #${num} for ${loan.borrowerName}'s loan`,
          payload: {
            loanId: loan.id,
            installmentNumber: num,
            approved: approve,
            remainingBalance: loan.remainingBalance,
            loanStatus: loan.status,
          },
        });

        if (approve && loan.status === 'repaid') {
          appendAuditLog(draft, {
            actor: viewer,
            action: 'LOAN_REPAID_COMPLETED',
            resourceType: 'loan',
            resourceId: loan.id,
            summary: `Qard Hasan loan ${loan.id} (${loan.borrowerName}) fully repaid and closed`,
            payload: {
              loanId: loan.id,
              previousStatus: 'active',
              resultingStatus: 'repaid',
              totalRepaid: loan.totalRepaid,
            },
          });
        }

        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan not found.' });
        return;
      }

      broadcastRealtimeEvent('repayment:verified', {
        loanId: id,
        installmentNumber: num,
        approved: approve,
      });
      broadcastRealtimeEvent('notification:created', { type: 'loan_repayment_notice' });
      broadcastRealtimeEvent('audit:updated', {
        action: approve ? 'REPAYMENT_VERIFIED' : 'REPAYMENT_REJECTED',
        resourceType: 'repayment',
        resourceId: `${id}#${num}`,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'INSTALLMENT_NOT_FOUND') {
        res.status(404).json({ error: 'Installment number not found on this loan schedule.' });
        return;
      }
      if (err instanceof Error && err.message === 'NO_PENDING_INSTALLMENT') {
        res.status(409).json({ error: 'Installment is not pending verification.' });
        return;
      }
      console.error('Verify installment error:', err);
      res.status(500).json({ error: 'Failed to verify installment.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 5. Halal Investment Projects (Post-Maturity Deployment)
// ---------------------------------------------------------------------------

apiRouter.get('/halal-projects', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    res.json({
      projects: state.halalProjects.map((project) => hydrateHalalProjectForViewer(project, viewer)),
    });
  } catch (err) {
    console.error('Halal projects error:', err);
    res.status(500).json({ error: 'Failed to load Halal projects.' });
  }
});

apiRouter.post(
  '/halal-projects',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const sector = String(req.body?.sector || '').trim();
      const shariahStructure = req.body?.shariahStructure as HalalProject['shariahStructure'];
      const targetAllocation = Number(req.body?.targetAllocation);
      const projectedAnnualReturn = String(req.body?.projectedAnnualReturn || '').trim();
      const riskTier = (req.body?.riskTier as HalalProject['riskTier']) || 'Balanced';
      const shariahScholarNote = String(req.body?.shariahScholarNote || '').trim();

      if (!title || !sector || !['Mudarabah', 'Musharakah', 'Murabahah'].includes(shariahStructure)) {
        res.status(400).json({ error: 'Valid project title, sector, and Shariah structure are required.' });
        return;
      }
      if (!Number.isFinite(targetAllocation) || targetAllocation <= 0) {
        res.status(400).json({ error: 'Target allocation must be greater than zero.' });
        return;
      }

      const viewer = req.authUser!;
      let project!: HalalProject;

      await updateVaultState((draft) => {
        const { activeVoters, requiredApprovals } = computeRequiredApprovals(draft);
        project = {
          id: `halal-proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          sector,
          shariahStructure,
          targetAllocation,
          projectedAnnualReturn: projectedAnnualReturn || '10% – 13% p.a.',
          riskTier,
          status: 'proposed',
          shariahScholarNote: shariahScholarNote || 'Submitted for member 2/3 placement vote.',
          createdAt: new Date().toISOString(),
          votingStatus: 'open',
          votes: [],
          requiredApprovals,
          totalEligibleVoters: activeVoters,
          proposedBy: viewer.name,
        };

        draft.halalProjects.unshift(project);
        appendAuditLog(draft, {
          actor: viewer,
          action: 'HALAL_PROJECT_PROPOSED',
          resourceType: 'halal_project',
          resourceId: project.id,
          summary: `${viewer.name} proposed investment placement "${title}" (${shariahStructure}) for 2/3 member vote`,
          payload: {
            projectId: project.id,
            shariahStructure,
            targetAllocation,
            requiredApprovals,
            totalEligibleVoters: activeVoters,
          },
        });
        return draft;
      });

      broadcastRealtimeEvent('investment:created', { projectId: project.id });
      broadcastRealtimeEvent('audit:updated', {
        action: 'HALAL_PROJECT_CREATED',
        resourceType: 'investment',
        resourceId: project.id,
      });
      res.status(201).json({ project: hydrateHalalProjectForViewer(project, viewer) });
    } catch (err) {
      console.error('Create Halal project error:', err);
      res.status(500).json({ error: 'Failed to create Halal project.' });
    }
  }
);

apiRouter.post('/halal-projects/:id/vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const rawDecision = String(req.body?.decision || '').toLowerCase();
    const decision = rawDecision === 'yes' ? 'yes' : rawDecision === 'no' ? 'no' : null;
    const comment = String(req.body?.comment || '').trim();

    if (!decision) {
      res.status(400).json({ error: 'Vote decision must be "yes" or "no".' });
      return;
    }

    const viewer = req.authUser!;
    let updatedProject: HalalProject | null = null;

    await updateVaultState((draft) => {
      const project = draft.halalProjects.find((p) => p.id === id);
      if (!project) return draft;

      if (project.votingStatus !== 'open') {
        throw new Error('PLACEMENT_VOTING_CLOSED');
      }
      if (project.votes.some((v) => v.voterId === viewer.id)) {
        throw new Error('PLACEMENT_ALREADY_VOTED');
      }

      const { activeVoters, requiredApprovals } = computeRequiredApprovals(draft);
      project.totalEligibleVoters = activeVoters;
      project.requiredApprovals = requiredApprovals;

      const castAt = new Date().toISOString();
      project.votes.push({
        voterId: viewer.id,
        voterName: viewer.name,
        voterRole: viewer.role,
        decision,
        comment: comment || undefined,
        castAt,
        signatureHash: computeSha256Hash({
          projectId: project.id,
          voterId: viewer.id,
          decision,
          castAt,
        }),
      });

      const yesCount = project.votes.filter((v) => v.decision === 'yes').length;
      const noCount = project.votes.filter((v) => v.decision === 'no').length;

      if (yesCount >= project.requiredApprovals) {
        project.votingStatus = 'approved';
        project.status = 'vetted';
        project.approvedAt = castAt;
      } else if (noCount > project.totalEligibleVoters - project.requiredApprovals) {
        project.votingStatus = 'rejected';
      }

      updatedProject = project;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'INVESTMENT_VOTE_CAST',
        resourceType: 'vote',
        resourceId: project.id,
        summary: `An anonymized verified member voted ${decision.toUpperCase()} on "${project.title}" (${yesCount}/${project.requiredApprovals} yes votes)`,
        payload: {
          projectId: project.id,
          decision,
          yesCount,
          noCount,
          requiredApprovals: project.requiredApprovals,
          votingStatus: project.votingStatus,
        },
      });

      return draft;
    });

    if (!updatedProject) {
      res.status(404).json({ error: 'Investment placement proposal not found.' });
      return;
    }

    broadcastRealtimeEvent('investment:voted', { projectId: id });
    broadcastRealtimeEvent('audit:updated', {
      action: 'INVESTMENT_VOTE_CAST',
      resourceType: 'vote',
      resourceId: id,
    });
    res.json({ project: hydrateHalalProjectForViewer(updatedProject, viewer) });
  } catch (err) {
    if (err instanceof Error && err.message === 'PLACEMENT_VOTING_CLOSED') {
      res.status(409).json({ error: 'Voting has already closed for this investment placement.' });
      return;
    }
    if (err instanceof Error && err.message === 'PLACEMENT_ALREADY_VOTED') {
      res.status(409).json({ error: 'You have already voted on this investment placement.' });
      return;
    }
    console.error('Placement vote error:', err);
    res.status(500).json({ error: 'Failed to record placement vote.' });
  }
});

// ---------------------------------------------------------------------------
// 6. Admin Governance, RBAC, Fund Settings, Audit Logs & Automated Reports
// ---------------------------------------------------------------------------

apiRouter.get('/members/active', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const summaries = buildMemberSummaries(state, true);
    const activeMembers = summaries
      .filter((m) => m.status === 'active')
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        memberCode: m.memberCode,
        status: m.status,
        joinedAt: m.joinedAt,
        photoUrl: m.registrationDetails?.photoUrl || m.photoUrl,
        mobile: m.registrationDetails?.mobile || m.phoneMasked || 'Not provided',
        occupation: m.registrationDetails?.occupation || undefined,
        companyOrganization: m.registrationDetails?.companyOrganization || undefined,
        presentAddress: m.registrationDetails?.presentAddress || undefined,
        totalContributed: m.totalContributed,
        approvedContributionsCount: m.approvedContributionsCount,
        monthlyTarget: state.fundConfig.monthlyContributionAmount,
      }))
      .sort((a, b) => a.memberCode.localeCompare(b.memberCode));

    res.json({ members: activeMembers });
  } catch (err) {
    console.error('Active members directory error:', err);
    res.status(500).json({ error: 'Failed to load active members directory.' });
  }
});

apiRouter.get(
  '/admin/registrations/pending',
  requireAuth,
  requireRole(['admin']),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const state = await loadVaultState();
      const registrations = buildMemberSummaries(state, true)
        .filter((m) => m.status === 'pending_approval')
        .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
      res.json({ registrations });
    } catch (err) {
      console.error('Pending registrations load error:', err);
      res.status(500).json({ error: 'Failed to load pending user registrations.' });
    }
  }
);

apiRouter.get(
  '/admin/members',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const state = await loadVaultState();
      const includeDetails = req.authUser?.role === 'admin';
      res.json({ members: buildMemberSummaries(state, includeDetails) });
    } catch (err) {
      console.error('Members error:', err);
      res.status(500).json({ error: 'Failed to load members.' });
    }
  }
);

apiRouter.post(
  '/admin/members',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewer = req.authUser!;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const role = (['admin', 'manager', 'member'].includes(String(req.body?.role))
        ? req.body.role
        : 'member') as UserRole;
      const status = (['active', 'pending_approval', 'suspended'].includes(String(req.body?.status))
        ? req.body.status
        : 'active') as 'pending_approval' | 'active' | 'suspended';

      const mobile = String(req.body?.mobile || '').trim();
      const occupation = String(req.body?.occupation || '').trim();
      const companyOrganization = String(req.body?.companyOrganization || '').trim();
      const presentAddress = String(req.body?.presentAddress || '').trim();
      const permanentAddress = String(req.body?.permanentAddress || '').trim();
      const nid = String(req.body?.nid || '').trim();
      const dateOfBirth = String(req.body?.dateOfBirth || '').trim();

      if (!name || name.length < 2) {
        res.status(400).json({ error: 'Full name is required (at least 2 characters).' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'A valid email address is required.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      const hasDetails = Boolean(
        mobile || occupation || companyOrganization || presentAddress || permanentAddress || nid || dateOfBirth
      );
      const regDetails: UserRegistrationDetails | undefined = hasDetails
        ? {
            dateOfBirth: dateOfBirth || '',
            referenceMemberName: viewer.name,
            mobile: mobile || '',
            occupation: occupation || '',
            companyOrganization: companyOrganization || '',
            nid: nid || '',
            presentAddress: presentAddress || '',
            permanentAddress: permanentAddress || '',
            photoUrl: '',
          }
        : undefined;

      const passwordHash = bcrypt.hashSync(password, 10);
      let newUser!: StoredUser;

      const nextState = await updateVaultState((draft) => {
        if (draft.users.some((u) => u.email.toLowerCase() === email)) {
          throw new Error('EMAIL_IN_USE');
        }

        newUser = {
          id: `usr-${role === 'admin' ? 'adm' : role === 'manager' ? 'mgr' : 'mem'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          email,
          passwordHash,
          role,
          memberCode: nextMemberCode(draft.users),
          status,
          joinedAt: new Date().toISOString(),
          phoneMasked: mobile ? maskReference(mobile) : undefined,
          encryptedRegistrationDetails: regDetails ? encryptSensitiveObject(regDetails) : undefined,
        };

        draft.users.push(newUser);
        if (status === 'active') {
          queueEmailNotification(draft, {
            type: 'signup_approved',
            recipientEmail: newUser.email,
            recipientName: newUser.name,
            recipientUserId: newUser.id,
            subject: `Welcome to ${draft.fundConfig.fundName} — Account Provisioned`,
            body: `Assalamu Alaikum ${newUser.name}, administrator ${viewer.name} created your cooperative account (${newUser.memberCode}) with role "${role}". You can sign in immediately.`,
            relatedId: newUser.id,
          });
        }
        appendAuditLog(draft, {
          actor: viewer,
          action: 'MEMBER_CREATED_BY_ADMIN',
          resourceType: 'auth',
          resourceId: newUser.id,
          summary: `${viewer.name} created user ${newUser.name} (${newUser.memberCode}, role: ${role}, status: ${status})`,
          payload: { targetUserId: newUser.id, email: newUser.email, role, status },
        });
        return draft;
      });

      broadcastRealtimeEvent('members:updated', { userId: newUser.id });
      broadcastRealtimeEvent('audit:updated', {
        action: 'MEMBER_CREATED_BY_ADMIN',
        resourceType: 'auth',
        resourceId: newUser.id,
      });
      res.status(201).json({ members: buildMemberSummaries(nextState, true) });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
        res.status(409).json({ error: 'A user with this email already exists.' });
        return;
      }
      console.error('Admin create member error:', err);
      res.status(500).json({ error: 'Failed to create user account.' });
    }
  }
);

apiRouter.patch(
  '/admin/members/:id',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const role = req.body?.role as UserRole | undefined;
      const status = req.body?.status as 'pending_approval' | 'active' | 'suspended' | undefined;
      const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
      const email =
        req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
      const newPassword =
        req.body?.password !== undefined ? String(req.body.password) : undefined;
      const mobile = req.body?.mobile !== undefined ? String(req.body.mobile).trim() : undefined;
      const occupation =
        req.body?.occupation !== undefined ? String(req.body.occupation).trim() : undefined;
      const companyOrganization =
        req.body?.companyOrganization !== undefined
          ? String(req.body.companyOrganization).trim()
          : undefined;
      const presentAddress =
        req.body?.presentAddress !== undefined
          ? String(req.body.presentAddress).trim()
          : undefined;
      const permanentAddress =
        req.body?.permanentAddress !== undefined
          ? String(req.body.permanentAddress).trim()
          : undefined;
      const viewer = req.authUser!;

      if (id === viewer.id && status && status !== 'active') {
        res.status(400).json({ error: 'Administrators cannot suspend or lock their own account.' });
        return;
      }

      if (name !== undefined && name.length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        return;
      }
      if (email !== undefined && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        res.status(400).json({ error: 'Please provide a valid email address.' });
        return;
      }
      if (newPassword !== undefined && newPassword.length > 0 && newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }

      let found = false;
      let approvedNow = false;
      const nextState = await updateVaultState((draft) => {
        const user = draft.users.find((u) => u.id === id);
        if (!user) return draft;
        found = true;

        if (email && email !== user.email.toLowerCase()) {
          if (draft.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) {
            throw new Error('EMAIL_IN_USE');
          }
          user.email = email;
        }
        if (name) {
          user.name = name;
        }
        if (newPassword && newPassword.length >= 6) {
          user.passwordHash = bcrypt.hashSync(newPassword, 10);
        }

        const prevStatus = user.status;
        const prevRole = user.role;
        if (role && ['admin', 'manager', 'member'].includes(role)) {
          user.role = role;
        }
        if (status && ['pending_approval', 'active', 'suspended'].includes(status)) {
          user.status = status;
        }

        if (
          mobile !== undefined ||
          occupation !== undefined ||
          companyOrganization !== undefined ||
          presentAddress !== undefined ||
          permanentAddress !== undefined
        ) {
          let details: UserRegistrationDetails = {
            dateOfBirth: '',
            referenceMemberName: viewer.name,
            mobile: '',
            occupation: '',
            companyOrganization: '',
            nid: '',
            presentAddress: '',
            permanentAddress: '',
            photoUrl: user.photoUrl || '',
          };
          if (user.encryptedRegistrationDetails) {
            try {
              details = decryptSensitiveObject<UserRegistrationDetails>(
                user.encryptedRegistrationDetails
              );
            } catch {
              // ignore corrupted envelope
            }
          }
          if (mobile !== undefined) {
            details.mobile = mobile;
            user.phoneMasked = mobile ? maskReference(mobile) : undefined;
          }
          if (occupation !== undefined) details.occupation = occupation;
          if (companyOrganization !== undefined) details.companyOrganization = companyOrganization;
          if (presentAddress !== undefined) details.presentAddress = presentAddress;
          if (permanentAddress !== undefined) details.permanentAddress = permanentAddress;
          user.encryptedRegistrationDetails = encryptSensitiveObject(details);
        }

        if (prevStatus === 'pending_approval' && user.status === 'active') {
          approvedNow = true;
          queueEmailNotification(draft, {
            type: 'signup_approved',
            recipientEmail: user.email,
            recipientName: user.name,
            recipientUserId: user.id,
            subject: `Welcome to ${draft.fundConfig.fundName} — Account Approved`,
            body: `Assalamu Alaikum ${user.name}, your cooperative membership (${user.memberCode}) has been approved by administrator ${viewer.name}. You may now sign in to submit monthly contributions and participate in 2/3 governance voting.`,
            relatedId: user.id,
          });
        }

        const memberAuditAction = approvedNow
          ? 'MEMBER_SIGNUP_APPROVED'
          : prevStatus !== 'suspended' && user.status === 'suspended'
            ? 'MEMBER_SUSPENDED'
            : prevStatus === 'suspended' && user.status === 'active'
              ? 'MEMBER_REACTIVATED'
              : 'MEMBER_RBAC_UPDATED';

        appendAuditLog(draft, {
          actor: viewer,
          action: memberAuditAction,
          resourceType: 'auth',
          resourceId: user.id,
          summary: `${viewer.name} updated ${user.name} (${user.memberCode}) -> role: ${user.role}, status: ${user.status}`,
          payload: {
            targetUserId: user.id,
            previousRole: prevRole,
            role: user.role,
            previousStatus: prevStatus,
            status: user.status,
          },
        });

        return draft;
      });

      if (!found) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }

      broadcastRealtimeEvent('members:updated', { userId: id });
      if (approvedNow) {
        broadcastRealtimeEvent('notification:created', { type: 'signup_approved' });
      }
      broadcastRealtimeEvent('audit:updated', {
        action: 'MEMBER_RBAC_UPDATED',
        resourceType: 'auth',
        resourceId: id,
      });
      res.json({ members: buildMemberSummaries(nextState, true) });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
        res.status(409).json({ error: 'Another user account already uses that email address.' });
        return;
      }
      console.error('Update member error:', err);
      res.status(500).json({ error: 'Failed to update member.' });
    }
  }
);

apiRouter.delete(
  '/admin/members/:id',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      if (id === viewer.id) {
        res.status(400).json({ error: 'Administrators cannot delete their own active account.' });
        return;
      }

      let removedName = '';
      let wasPending = false;
      const nextState = await updateVaultState((draft) => {
        const idx = draft.users.findIndex((u) => u.id === id);
        if (idx === -1) return draft;
        const target = draft.users[idx];

        const hasActiveLoan = draft.loans.some(
          (l) =>
            l.borrowerId === target.id &&
            (l.status === 'active' || l.status === 'approved_pending_disbursement')
        );
        if (hasActiveLoan) {
          throw new Error('USER_HAS_ACTIVE_LOAN');
        }

        wasPending = target.status === 'pending_approval';
        removedName = `${target.name} (${target.memberCode})`;
        draft.users.splice(idx, 1);
        appendAuditLog(draft, {
          actor: viewer,
          action: wasPending ? 'MEMBER_SIGNUP_REJECTED' : 'MEMBER_REMOVED_BY_ADMIN',
          resourceType: 'auth',
          resourceId: id,
          summary: wasPending
            ? `${viewer.name} declined pending registration for ${removedName}`
            : `${viewer.name} removed user account ${removedName}`,
          payload: { targetUserId: id, email: target.email },
        });
        return draft;
      });

      if (!removedName) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      broadcastRealtimeEvent('members:updated', { userId: id });
      broadcastRealtimeEvent('audit:updated', {
        action: wasPending ? 'MEMBER_SIGNUP_REJECTED' : 'MEMBER_REMOVED_BY_ADMIN',
        resourceType: 'auth',
        resourceId: id,
      });
      res.json({ members: buildMemberSummaries(nextState, true) });
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_HAS_ACTIVE_LOAN') {
        res.status(400).json({
          error: 'Cannot delete a user who has an active or disbursement-approved Qard Hasan loan. Suspend the account instead.',
        });
        return;
      }
      console.error('Delete member error:', err);
      res.status(500).json({ error: 'Failed to remove user account.' });
    }
  }
);

apiRouter.patch(
  '/admin/config',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewer = req.authUser!;
      const body = req.body as Partial<FundConfig>;

      const maxLoansPerYear = Number(body.maxLoansPerYear);
      const monthlyContributionAmount = Number(body.monthlyContributionAmount);
      const maxLoanAmount = Number(body.maxLoanAmount);
      const maxInstallmentMonths = Number(body.maxInstallmentMonths);

      if (
        body.maxLoansPerYear !== undefined &&
        (!Number.isInteger(maxLoansPerYear) || maxLoansPerYear < 1 || maxLoansPerYear > 12)
      ) {
        res.status(400).json({ error: 'Loans per year limit must be an integer between 1 and 12.' });
        return;
      }
      if (
        body.monthlyContributionAmount !== undefined &&
        (!Number.isFinite(monthlyContributionAmount) || monthlyContributionAmount <= 0)
      ) {
        res.status(400).json({ error: 'Monthly contribution amount must be greater than zero.' });
        return;
      }
      if (
        body.maxLoanAmount !== undefined &&
        (!Number.isFinite(maxLoanAmount) || maxLoanAmount <= 0)
      ) {
        res.status(400).json({ error: 'Maximum loan amount must be greater than zero.' });
        return;
      }
      if (
        body.maxInstallmentMonths !== undefined &&
        (!Number.isInteger(maxInstallmentMonths) ||
          maxInstallmentMonths < 1 ||
          maxInstallmentMonths > 36)
      ) {
        res
          .status(400)
          .json({ error: 'Maximum installment months must be an integer between 1 and 36.' });
        return;
      }
      if (
        body.currency !== undefined &&
        !['BDT', 'USD', 'MYR', 'GBP'].includes(body.currency)
      ) {
        res.status(400).json({ error: 'Unsupported currency code.' });
        return;
      }
      if (body.maturityDate !== undefined) {
        const parsedDate = Date.parse(`${body.maturityDate}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.maturityDate) || Number.isNaN(parsedDate)) {
          res.status(400).json({ error: 'Maturity date must be a valid YYYY-MM-DD date.' });
          return;
        }
      }

      const nextState = await updateVaultState((draft) => {
        const cfg = draft.fundConfig;
        if (typeof body.fundName === 'string' && body.fundName.trim()) {
          cfg.fundName = body.fundName.trim();
        }
        if (body.currency) {
          cfg.currency = body.currency;
        }
        if (body.monthlyContributionAmount !== undefined) {
          cfg.monthlyContributionAmount = monthlyContributionAmount;
        }
        if (body.maxLoansPerYear !== undefined) {
          cfg.maxLoansPerYear = maxLoansPerYear;
        }
        if (body.maxLoanAmount !== undefined) {
          cfg.maxLoanAmount = maxLoanAmount;
        }
        if (body.maxInstallmentMonths !== undefined) {
          cfg.maxInstallmentMonths = maxInstallmentMonths;
        }
        if (body.maturityDate !== undefined) {
          cfg.maturityDate = body.maturityDate;
        }
        if (typeof body.halalInvestmentThesis === 'string' && body.halalInvestmentThesis.trim()) {
          cfg.halalInvestmentThesis = body.halalInvestmentThesis.trim();
        }
        if (typeof body.autoSyncSheet === 'boolean') {
          cfg.autoSyncSheet = body.autoSyncSheet;
        }
        if (typeof body.googleSheetId === 'string') {
          const trimmedId = body.googleSheetId.trim();
          cfg.googleSheetId = trimmedId || undefined;
          if (!trimmedId) {
            cfg.googleSheetUrl = undefined;
          }
        }
        cfg.updatedAt = new Date().toISOString();
        cfg.updatedBy = viewer.name;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'FUND_POLICY_UPDATED',
          resourceType: 'config',
          resourceId: cfg.id,
          summary: `${viewer.name} updated cooperative policy (max ${cfg.maxLoansPerYear} loans/year, maturity ${cfg.maturityDate})`,
          payload: {
            maxLoansPerYear: cfg.maxLoansPerYear,
            maturityDate: cfg.maturityDate,
            monthlyContributionAmount: cfg.monthlyContributionAmount,
            maxLoanAmount: cfg.maxLoanAmount,
            currency: cfg.currency,
            autoSyncSheet: cfg.autoSyncSheet,
          },
        });

        return draft;
      });

      broadcastRealtimeEvent('config:updated', {
        maxLoansPerYear: nextState.fundConfig.maxLoansPerYear,
      });
      broadcastRealtimeEvent('audit:updated', {
        action: 'FUND_POLICY_UPDATED',
        resourceType: 'config',
        resourceId: nextState.fundConfig.id,
      });
      res.json({ config: nextState.fundConfig });
    } catch (err) {
      console.error('Update config error:', err);
      res.status(500).json({ error: 'Failed to update fund configuration.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 7. Email Notifications & Automated Monthly/Repayment Reminders
// ---------------------------------------------------------------------------

apiRouter.get('/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const isStaff = viewer.role === 'admin' || viewer.role === 'manager';

    const notifications = isStaff
      ? state.emailNotifications
      : state.emailNotifications.filter(
          (n) =>
            n.recipientUserId === viewer.id ||
            n.recipientEmail.toLowerCase() === viewer.email.toLowerCase()
        );

    res.json({ notifications });
  } catch (err) {
    console.error('Notifications load error:', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

apiRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const isStaff = viewer.role === 'admin' || viewer.role === 'manager';
    let found = false;

    await updateVaultState((draft) => {
      const notif = draft.emailNotifications.find((n) => n.id === id);
      if (!notif) return draft;
      if (
        !isStaff &&
        notif.recipientUserId !== viewer.id &&
        notif.recipientEmail.toLowerCase() !== viewer.email.toLowerCase()
      ) {
        throw new Error('FORBIDDEN');
      }
      notif.readByRecipient = true;
      found = true;
      return draft;
    });

    if (!found) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Not authorized to mark this notification read.' });
      return;
    }
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

apiRouter.post(
  '/notifications/reminders',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewer = req.authUser!;
      const billingMonth =
        String(req.body?.billingMonth || '').trim() || new Date().toISOString().slice(0, 7);
      let createdCount = 0;

      const nextState = await updateVaultState((draft) => {
        const activeMembers = draft.users.filter((u) => u.status === 'active');

        // Monthly contribution reminders for active members without approved/pending contribution this month
        activeMembers.forEach((member) => {
          const alreadyPaidOrPending = draft.contributions.some(
            (c) =>
              c.userId === member.id &&
              c.billingMonth === billingMonth &&
              c.status !== 'rejected'
          );
          if (!alreadyPaidOrPending) {
            queueEmailNotification(draft, {
              type: 'monthly_contribution_reminder',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Monthly Contribution Reminder (${billingMonth}) — ${draft.fundConfig.monthlyContributionAmount} ${draft.fundConfig.currency}`,
              body: `Assalamu Alaikum ${member.name}, your monthly cooperative contribution of ${draft.fundConfig.monthlyContributionAmount} ${draft.fundConfig.currency} for ${billingMonth} is due. Please transfer via Bank or MFS and submit your TrxID in the Contributions tab for manager verification.`,
              relatedId: billingMonth,
            });
            createdCount += 1;
          }
        });

        // Loan repayment reminders for active borrowers with next scheduled installment
        draft.loans
          .filter((l) => l.status === 'active')
          .forEach((loan) => {
            const nextScheduled = loan.installments.find((i) => i.status === 'scheduled');
            const borrower = draft.users.find((u) => u.id === loan.borrowerId);
            if (nextScheduled && borrower) {
              queueEmailNotification(draft, {
                type: 'loan_repayment_notice',
                recipientEmail: borrower.email,
                recipientName: borrower.name,
                recipientUserId: borrower.id,
                subject: `Upcoming Loan Repayment Reminder: ${loan.id} Installment #${nextScheduled.installmentNumber}`,
                body: `Assalamu Alaikum ${borrower.name}, installment #${nextScheduled.installmentNumber} (${nextScheduled.amount} ${draft.fundConfig.currency}) for Qard Hasan loan ${loan.id} is scheduled for ${nextScheduled.dueDate}. Verified repayments restore the central fund balance.`,
                relatedId: `${loan.id}#${nextScheduled.installmentNumber}`,
              });
              createdCount += 1;
            }
          });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'REMINDER_BATCH_GENERATED',
          resourceType: 'notification',
          resourceId: billingMonth,
          summary: `${viewer.name} generated ${createdCount} monthly contribution and loan repayment reminders for ${billingMonth}`,
          payload: { billingMonth, createdCount },
        });

        return draft;
      });

      broadcastRealtimeEvent('notification:created', { type: 'monthly_contribution_reminder' });
      broadcastRealtimeEvent('audit:updated', {
        action: 'REMINDER_BATCH_GENERATED',
        resourceType: 'notification',
        resourceId: billingMonth,
      });
      res.json({
        createdCount,
        notifications: nextState.emailNotifications,
      });
    } catch (err) {
      console.error('Reminders error:', err);
      res.status(500).json({ error: 'Failed to generate monthly reminders.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 8. Google Workspace Integration (Google Sheets Blueprint Auto-Sync & Gmail)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/workspace/blueprint',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (_req, res) => {
    try {
      const state = await loadVaultState();
      const tabs = buildGoogleSheetsBlueprint(state);
      res.json({ tabs, config: state.fundConfig });
    } catch (err) {
      console.error('Blueprint error:', err);
      res.status(500).json({ error: 'Failed to generate spreadsheet blueprint.' });
    }
  }
);

apiRouter.post(
  '/workspace/sheets/sync',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleToken = extractGoogleBearerToken(req);
      if (!googleToken) {
        res.status(401).json({
          error: 'Google Workspace OAuth access token required in Authorization Bearer header.',
        });
        return;
      }

      const viewer = req.authUser!;
      const createNew = Boolean(req.body?.createNew);
      const requestedAutoSync =
        typeof req.body?.autoSyncSheet === 'boolean' ? req.body.autoSyncSheet : undefined;

      const state = await loadVaultState();
      const blueprint = buildGoogleSheetsBlueprint(state);
      let spreadsheetId = createNew ? '' : state.fundConfig.googleSheetId || '';
      let spreadsheetUrl = state.fundConfig.googleSheetUrl || '';

      const headers = {
        Authorization: `Bearer ${googleToken}`,
        'Content-Type': 'application/json',
      };

      if (!spreadsheetId) {
        const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            properties: {
              title: `${state.fundConfig.fundName} — Treasury Blueprint`,
            },
            sheets: blueprint.map((b) => ({
              properties: { title: b.sheetName },
            })),
          }),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          res.status(createRes.status).json({
            error: `Google Sheets create failed (${createRes.status}): ${errText.slice(0, 220)}`,
          });
          return;
        }

        const created = (await createRes.json()) as {
          spreadsheetId: string;
          spreadsheetUrl: string;
        };
        spreadsheetId = created.spreadsheetId;
        spreadsheetUrl = created.spreadsheetUrl;
      } else {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties`,
          { headers }
        );

        if (!metaRes.ok) {
          const errText = await metaRes.text();
          res.status(metaRes.status).json({
            error: `Could not access target Google Sheet (${metaRes.status}): ${errText.slice(0, 220)}`,
          });
          return;
        }

        const meta = (await metaRes.json()) as {
          spreadsheetUrl: string;
          sheets?: Array<{ properties?: { title?: string } }>;
        };
        spreadsheetUrl =
          meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        const existingTitles = new Set(
          (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean)
        );
        const missingSheets = blueprint.filter((b) => !existingTitles.has(b.sheetName));
        if (missingSheets.length > 0) {
          const addRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                requests: missingSheets.map((b) => ({
                  addSheet: { properties: { title: b.sheetName } },
                })),
              }),
            }
          );
          if (!addRes.ok) {
            const errText = await addRes.text();
            res.status(addRes.status).json({
              error: `Failed creating tabs in Google Sheet: ${errText.slice(0, 220)}`,
            });
            return;
          }
        }
      }

      // Clear existing tab ranges first, then push fresh multi-tab values
      const clearRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ranges: blueprint.map((b) => `'${b.sheetName}'!A1:Z1000`),
          }),
        }
      );
      if (!clearRes.ok) {
        const errText = await clearRes.text();
        res.status(clearRes.status).json({
          error: `Failed clearing Google Sheet tabs: ${errText.slice(0, 220)}`,
        });
        return;
      }

      const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: blueprint.map((b) => ({
              range: `'${b.sheetName}'!A1`,
              values: b.rows,
            })),
          }),
        }
      );

      if (!writeRes.ok) {
        const errText = await writeRes.text();
        res.status(writeRes.status).json({
          error: `Failed writing blueprint rows to Google Sheet: ${errText.slice(0, 220)}`,
        });
        return;
      }

      const lastSheetSyncAt = new Date().toISOString();
      const nextState = await updateVaultState((draft) => {
        draft.fundConfig.googleSheetId = spreadsheetId;
        draft.fundConfig.googleSheetUrl = spreadsheetUrl;
        draft.fundConfig.lastSheetSyncAt = lastSheetSyncAt;
        if (requestedAutoSync !== undefined) {
          draft.fundConfig.autoSyncSheet = requestedAutoSync;
        }
        draft.fundConfig.updatedAt = lastSheetSyncAt;
        draft.fundConfig.updatedBy = viewer.name;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'GOOGLE_SHEET_SYNCED',
          resourceType: 'workspace_sync',
          resourceId: spreadsheetId,
          summary: `${viewer.name} synchronized ${blueprint.length}-tab treasury blueprint to Google Sheets`,
          payload: {
            spreadsheetId,
            tabs: blueprint.map((b) => b.sheetName),
            lastSheetSyncAt,
          },
        });
        return draft;
      });

      broadcastRealtimeEvent('sheet:synced', { spreadsheetId, lastSheetSyncAt });
      broadcastRealtimeEvent('audit:updated', {
        action: 'GOOGLE_SHEET_SYNCED',
        resourceType: 'workspace_sync',
        resourceId: spreadsheetId,
      });
      res.json({
        spreadsheetId,
        spreadsheetUrl,
        lastSheetSyncAt,
        autoSyncSheet: nextState.fundConfig.autoSyncSheet,
        syncedTabs: blueprint.length,
        config: nextState.fundConfig,
      });
    } catch (err) {
      console.error('Google Sheets sync error:', err);
      res.status(500).json({ error: 'Failed to sync blueprint to Google Sheets.' });
    }
  }
);

apiRouter.post(
  '/workspace/gmail/send',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleToken = extractGoogleBearerToken(req);
      if (!googleToken) {
        res.status(401).json({
          error: 'Google Workspace OAuth access token required in Authorization Bearer header.',
        });
        return;
      }

      const viewer = req.authUser!;
      const notificationIds = Array.isArray(req.body?.notificationIds)
        ? (req.body.notificationIds as string[])
        : null;

      const state = await loadVaultState();
      const targets = state.emailNotifications
        .filter((n) => {
          if (notificationIds && notificationIds.length > 0) {
            return notificationIds.includes(n.id);
          }
          return n.deliveryStatus === 'queued';
        })
        .slice(0, 15);

      if (targets.length === 0) {
        res.json({ sentCount: 0, failedCount: 0, errors: [], notifications: state.emailNotifications });
        return;
      }

      const sentIds: string[] = [];
      const errors: string[] = [];

      for (const item of targets) {
        const rawMessage = [
          `To: ${item.recipientName} <${item.recipientEmail}>`,
          `Subject: ${item.subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          item.body,
          '',
          `— ${state.fundConfig.fundName} Automated Treasury Notification`,
        ].join('\r\n');

        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encodeBase64Url(rawMessage),
          }),
        });

        if (sendRes.ok) {
          sentIds.push(item.id);
        } else {
          const text = await sendRes.text();
          errors.push(`${item.recipientEmail}: HTTP ${sendRes.status} ${text.slice(0, 100)}`);
        }
      }

      const sentAt = new Date().toISOString();
      const nextState = await updateVaultState((draft) => {
        draft.emailNotifications.forEach((n) => {
          if (sentIds.includes(n.id)) {
            n.deliveryChannel = 'gmail_api';
            n.deliveryStatus = 'sent_via_gmail';
            n.sentAt = sentAt;
          }
        });

        if (sentIds.length > 0) {
          appendAuditLog(draft, {
            actor: viewer,
            action: 'GMAIL_NOTIFICATIONS_DISPATCHED',
            resourceType: 'notification',
            resourceId: `${sentIds.length}-emails`,
            summary: `${viewer.name} dispatched ${sentIds.length} notification email(s) via Gmail API`,
            payload: { sentIds, failedCount: errors.length },
          });
        }
        return draft;
      });

      if (sentIds.length > 0) {
        broadcastRealtimeEvent('notification:created', { dispatched: sentIds.length });
        broadcastRealtimeEvent('audit:updated', {
          action: 'GMAIL_NOTIFICATIONS_DISPATCHED',
          resourceType: 'notification',
          resourceId: `${sentIds.length}-emails`,
        });
      }

      res.json({
        sentCount: sentIds.length,
        failedCount: errors.length,
        errors,
        notifications: nextState.emailNotifications,
      });
    } catch (err) {
      console.error('Gmail dispatch error:', err);
      res.status(500).json({ error: 'Failed to dispatch emails via Gmail API.' });
    }
  }
);

apiRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (_req, res) => {
    try {
      const state = await loadVaultState();
      const logs = state.auditLogs.map((entry) => {
        let decryptedPayload: Record<string, unknown> | undefined;
        try {
          decryptedPayload = decryptSensitiveObject<Record<string, unknown>>(entry.encryptedPayload);
        } catch {
          decryptedPayload = undefined;
        }
        if (entry.action === 'LOAN_VOTE_CAST' || entry.action === 'INVESTMENT_VOTE_CAST') {
          return {
            ...entry,
            actorId: 'anon-ballot',
            actorName: 'Anonymized Verified Member',
            actorRole: 'member' as UserRole,
            summary: entry.summary.includes('anonymized')
              ? entry.summary
              : `Anonymized ballot recorded (${entry.resourceId})`,
            decryptedPayload,
          };
        }
        return { ...entry, decryptedPayload };
      });

      // Verify sequential hash chain links
      let chainValid = true;
      for (let i = 0; i < logs.length - 1; i++) {
        if (logs[i].prevHash !== logs[i + 1].entryHash) {
          chainValid = false;
          break;
        }
      }

      res.json({ logs, chainValid });
    } catch (err) {
      console.error('Audit logs error:', err);
      res.status(500).json({ error: 'Failed to load audit logs.' });
    }
  }
);

apiRouter.get(
  '/reports/export',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const type = String(req.query?.type || 'contributions');
      const state = await loadVaultState();
      const viewer = req.authUser!;

      let csv = '';
      let filename = `amanah-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

      if (type === 'contributions') {
        const rows = [
          [
            'ID',
            'Member Code',
            'Member Name',
            'Billing Month',
            'Amount',
            'Channel',
            'Provider',
            'Masked Reference',
            'Status',
            'Submitted At',
            'Reviewed By',
            'Entry Hash',
          ],
          ...state.contributions.map((c) => [
            c.id,
            c.memberCode,
            c.memberName,
            c.billingMonth,
            c.amount,
            c.channel.toUpperCase(),
            c.providerName,
            c.maskedReference,
            c.status,
            c.submittedAt,
            c.reviewerName || '',
            c.entryHash,
          ]),
        ];
        csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
      } else if (type === 'loans') {
        const rows = [
          [
            'Loan ID',
            'Borrower Code',
            'Borrower Name',
            'Principal',
            'Interest Rate',
            'Installment Months',
            'Total Repaid',
            'Remaining Balance',
            'Approvals',
            'Required Quorum',
            'Status',
            'Requested At',
            'Disbursed At',
          ],
          ...state.loans.map((l) => [
            l.id,
            l.borrowerCode,
            l.borrowerName,
            l.amount,
            '0% (Qard Hasan)',
            l.installmentMonths,
            l.totalRepaid,
            l.remainingBalance,
            l.votes.filter((v) => v.decision === 'approve').length,
            l.requiredApprovals,
            l.status,
            l.requestedAt,
            l.disbursedAt || '',
          ]),
        ];
        csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
      } else if (type === 'members') {
        const summaries = buildMemberSummaries(state);
        const rows = [
          [
            'Member Code',
            'Name',
            'Email',
            'Role',
            'Status',
            'Total Contributed',
            'Loans Used This Year',
            'Active Loan Balance',
            'Joined At',
          ],
          ...summaries.map((m) => [
            m.memberCode,
            m.name,
            m.email,
            m.role,
            m.status,
            m.totalContributed,
            m.loansThisYear,
            m.activeLoanBalance,
            m.joinedAt,
          ]),
        ];
        csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
      } else {
        const rows = [
          ['Audit ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Resource', 'Summary', 'Entry Hash'],
          ...state.auditLogs.map((a) => {
            const isVote = a.action === 'LOAN_VOTE_CAST' || a.action === 'INVESTMENT_VOTE_CAST';
            return [
              a.id,
              a.timestamp,
              isVote ? 'Anonymized Verified Member' : a.actorName,
              isVote ? 'member' : a.actorRole,
              a.action,
              a.resourceId,
              isVote && !a.summary.includes('anonymized')
                ? `Anonymized ballot recorded (${a.resourceId})`
                : a.summary,
              a.entryHash,
            ];
          }),
        ];
        csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
        filename = `amanah-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      }

      await updateVaultState((draft) => {
        appendAuditLog(draft, {
          actor: viewer,
          action: 'REPORT_EXPORTED',
          resourceType: 'report',
          resourceId: type,
          summary: `${viewer.name} generated automated CSV compliance report (${type})`,
          payload: { reportType: type, filename },
        });
        return draft;
      });

      broadcastRealtimeEvent('audit:updated', {
        action: 'REPORT_EXPORTED',
        resourceType: 'report',
        resourceId: type,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      console.error('Report export error:', err);
      res.status(500).json({ error: 'Failed to export automated report.' });
    }
  }
);
