import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { type Response, Router } from 'express';
import QRCode from 'qrcode';
import type {
  CommunityCategory,
  CommunityComment,
  CommunityPoll,
  CommunityPost,
  CommunityReactionType,
  Contribution,
  ConversationThreadSummary,
  CoopMeeting,
  DecisionPoll,
  FundConfig,
  HalalProject,
  InstallmentItem,
  LoanGuarantor,
  LoanRequest,
  LoanVote,
  NotificationPreferences,
  PrivateMessage,
  ProfileChangePayload,
  ProfileChangeRequest,
  ProfitDistributionAllocation,
  ProfitDistributionRecord,
  UploadDocumentCategory,
  UserRegistrationDetails,
  UserRole,
} from '../types/coop.ts';
import {
  type AuthenticatedRequest,
  clearAuthCookie,
  DEFAULT_NOTIFICATION_PREFERENCES,
  requireAuth,
  requireRole,
  resolveOptionalAuthUser,
  sanitizeUser,
  setAuthCookie,
  signAuthToken,
  signGoogleRegistrationToken,
  verifyFirebaseGoogleIdToken,
  verifyGoogleRegistrationToken,
} from './auth.ts';
import {
  appendAuditLog,
  applyOverdueChecksToState,
  buildDashboardOverview,
  buildGoogleSheetsBlueprint,
  buildManagerCycleSchedule,
  buildMemberPublicProfile,
  buildMemberSummaries,
  computeRequiredApprovals,
  escapeCsvCell,
  evaluateLoanEligibility,
  extractMentionedUsers,
  hydrateContributionForViewer,
  hydrateDecisionPollForViewer,
  hydrateHalalProjectForViewer,
  hydrateLoanForViewer,
  queueEmailNotification,
  validateAndNormalizeNominees,
} from './coopService.ts';
import {
  computeSha256Hash,
  decryptSensitiveObject,
  encryptSensitiveObject,
  maskReference,
} from './crypto.ts';
import { loadVaultState, type StoredPrivateMessage, type StoredUser, updateVaultState } from './db.ts';
import { verifyPaymentReceiptImage } from './geminiService.ts';
import { createRateLimiter } from './rateLimit.ts';
import {
  getImageKitConfig,
  uploadToImageKit,
  validateAndDecodeUpload,
} from './imagekitStorage.ts';
import {
  broadcastRealtimeEvent,
  registerSseClient,
  sendRealtimeEventToUsers,
} from './realtime.ts';
import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp.ts';

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
  // Use qh- prefix so sequential IDs never collide with old demo seed ids (loan-2026-00x).
  const prefix = `qh-${year}-`;
  const legacyPrefix = `loan-${year}-`;
  const existingIds = new Set(loans.map((l) => l.id));
  let maxNum = loans.reduce((max, l) => {
    let seq = 0;
    if (l.id.startsWith(prefix)) seq = Number(l.id.slice(prefix.length));
    else if (l.id.startsWith(legacyPrefix)) seq = Number(l.id.slice(legacyPrefix.length));
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  let candidate = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  while (existingIds.has(candidate)) {
    maxNum += 1;
    candidate = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  }
  return candidate;
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 40,
  keyPrefix: 'upload',
  message: 'Upload limit temporarily reached. Please wait a moment before uploading again.',
});

const geminiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'gemini',
  message: 'AI receipt verification rate limit reached. Please wait a minute before scanning again.',
});

async function assertStepUpTotp(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  const viewer = req.authUser;
  if (!viewer) {
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }
  const state = await loadVaultState();
  const dbUser = state.users.find((u) => u.id === viewer.id);
  if (!dbUser || !dbUser.totpEnabled || !dbUser.encryptedTotpSecret) {
    return true;
  }

  const headerCode = req.headers['x-totp-code'];
  const code = String(
    (Array.isArray(headerCode) ? headerCode[0] : headerCode) || req.body?.totpCode || ''
  ).trim();
  if (!code) {
    res.status(403).json({
      error: 'Two-factor authentication code required for this privileged action.',
      code: 'TOTP_REQUIRED',
    });
    return false;
  }

  try {
    const { secret } = decryptSensitiveObject<{ secret: string }>(dbUser.encryptedTotpSecret);
    if (!verifyTotpCode(secret, code)) {
      res.status(403).json({
        error: 'Invalid or expired two-factor authentication code.',
        code: 'TOTP_REQUIRED',
      });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({
      error: 'Unable to verify two-factor authentication secret.',
      code: 'TOTP_REQUIRED',
    });
    return false;
  }
}

export async function syncOverdueInstallments(): Promise<number> {
  const state = await loadVaultState();
  const preview = applyOverdueChecksToState(structuredClone(state));
  if (!preview.changed) return 0;

  let newlyOverdue: Array<{ loanId: string; borrowerId: string; installmentNumber: number }> = [];
  await updateVaultState((draft) => {
    const res = applyOverdueChecksToState(draft);
    newlyOverdue = res.newlyOverdue;
    return draft;
  });

  if (newlyOverdue.length > 0) {
    broadcastRealtimeEvent('repayment:overdue', { count: newlyOverdue.length });
    broadcastRealtimeEvent('notification:created', { type: 'loan_repayment_notice' });
  }
  return newlyOverdue.length;
}

export const apiRouter = Router();

// Real-time Server-Sent Events stream for live voting and treasury synchronization
apiRouter.get('/events', requireAuth, (req: AuthenticatedRequest, res) => {
  registerSseClient(req.authUser!.id, res);
});

// ---------------------------------------------------------------------------
// 1. Authentication (JWT + HttpOnly Cookie) & Step-Up 2FA (TOTP)
// ---------------------------------------------------------------------------

apiRouter.post('/auth/login', authRateLimiter, async (req, res) => {
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

apiRouter.post('/auth/google', authRateLimiter, async (req, res) => {
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

const UPLOADS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'amanah-data', 'uploads')
  : path.resolve(process.cwd(), 'data', 'uploads');

function contentTypeFromFilename(safeName: string): string {
  const ext = path.extname(safeName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

apiRouter.get('/uploads/:filename', (req, res) => {
  try {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!safeName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid file name.' });
      return;
    }

    const expectedContentType = contentTypeFromFilename(safeName);
    const filePath = path.join(UPLOADS_DIR, safeName);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', expectedContentType);
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(fs.readFileSync(filePath));
      return;
    }

    res.status(404).json({ error: 'Uploaded file not found.' });
  } catch (err) {
    console.error('Upload fetch error:', err);
    res.status(502).json({ error: 'Failed to retrieve file from storage.' });
  }
});

const ALLOWED_UPLOAD_CATEGORIES = new Set<UploadDocumentCategory>([
  'cooperative-constitution',
  'member-kyc-photo',
  'member-signed-agreement',
  'nominee-kyc-photo',
  'contribution-receipt',
  'loan-repayment-slip',
  'community-post-photo',
  'document',
]);

async function handleFileUpload(req: AuthenticatedRequest, res: Response) {
  try {
    const rawData = String(req.body?.fileBase64 || req.body?.imageBase64 || '').trim();
    const rawName = String(req.body?.name || 'member-upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fallbackMimeType = String(req.body?.mimeType || '').trim() || undefined;
    const rawCategory = String(req.body?.category || '').trim() as UploadDocumentCategory;
    const category: UploadDocumentCategory | undefined = ALLOWED_UPLOAD_CATEGORIES.has(rawCategory)
      ? rawCategory
      : undefined;

    const optionalUser = await resolveOptionalAuthUser(req);
    if (category === 'cooperative-constitution' && optionalUser?.role !== 'admin') {
      res.status(403).json({
        error: 'Only administrators can upload the official cooperative constitution PDF.',
      });
      return;
    }

    const explicitSubject = String(req.body?.subject || '').trim();
    const subject =
      explicitSubject ||
      (optionalUser ? `${optionalUser.memberCode}-${optionalUser.name}` : undefined);

    let decoded: ReturnType<typeof validateAndDecodeUpload>;
    try {
      decoded = validateAndDecodeUpload({
        rawData,
        rawName,
        category,
        subject,
        fallbackMimeType,
      });
    } catch (validationErr) {
      res.status(400).json({
        error: validationErr instanceof Error ? validationErr.message : 'Invalid upload payload.',
      });
      return;
    }

    // 1. Primary provider: ImageKit.io Media Storage (supports both PDFs & photos)
    const imagekitConfig = getImageKitConfig();
    if (imagekitConfig) {
      const uploaded = await uploadToImageKit({
        fileName: decoded.filename,
        base64Payload: decoded.base64Payload,
        mimeType: decoded.mimeType,
        category: decoded.category,
        config: imagekitConfig,
      });
      res.json({
        url: uploaded.url,
        provider: uploaded.provider,
        fileId: uploaded.fileId,
        mimeType: decoded.mimeType,
        filename: decoded.filename,
        originalName: rawName,
        category: decoded.category,
        sizeBytes: decoded.buffer.length,
      });
      return;
    }

    // 2. Legacy image-only provider fallback if IMGBB_API_KEY is explicitly configured
    const imgbbApiKey = process.env.IMGBB_API_KEY?.trim();
    if (imgbbApiKey && !decoded.isPdf) {
      try {
        const formBody = new URLSearchParams();
        formBody.set('key', imgbbApiKey);
        formBody.set('image', decoded.base64Payload);
        formBody.set('name', decoded.filename);

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

        if (imgbbRes.ok && imgbbJson.success && imgbbJson.data) {
          res.json({
            url: imgbbJson.data.display_url || imgbbJson.data.url,
            provider: 'imgbb',
            mimeType: decoded.mimeType,
            filename: decoded.filename,
            originalName: rawName,
            category: decoded.category,
            sizeBytes: decoded.buffer.length,
          });
          return;
        }
        console.warn(
          '[Upload] Legacy ImgBB fallback rejected upload, falling back to local vault:',
          imgbbJson.error?.message || imgbbRes.status
        );
      } catch (imgbbErr) {
        console.warn('[Upload] Legacy ImgBB fallback error, falling back to local vault:', imgbbErr);
      }
    }

    // 3. Graceful local vault disk fallback for both PDFs & photos when ImageKit credentials are omitted
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(UPLOADS_DIR, decoded.filename), decoded.buffer);

    res.json({
      url: `/api/uploads/${decoded.filename}`,
      provider: 'local_vault',
      mimeType: decoded.mimeType,
      filename: decoded.filename,
      originalName: rawName,
      category: decoded.category,
      sizeBytes: decoded.buffer.length,
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to process file upload.',
    });
  }
}

apiRouter.post('/upload', uploadRateLimiter, handleFileUpload);
apiRouter.post('/upload/imgbb', uploadRateLimiter, handleFileUpload);

apiRouter.get('/constitution', async (_req, res) => {
  try {
    const state = await loadVaultState();
    const cfg = state.fundConfig;
    res.json({
      constitutionPdfUrl: cfg.constitutionPdfUrl || null,
      constitutionPdfName: cfg.constitutionPdfName || null,
      constitutionUploadedAt: cfg.constitutionUploadedAt || null,
      constitutionUploadedBy: cfg.constitutionUploadedBy || null,
      fundName: cfg.fundName,
    });
  } catch (err) {
    console.error('Constitution fetch error:', err);
    res.status(500).json({ error: 'Failed to load constitution document details.' });
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

apiRouter.post('/auth/register', authRateLimiter, async (req, res) => {
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

    const nomineeValidation = validateAndNormalizeNominees(req.body?.nominees);
    if ('error' in nomineeValidation) {
      res.status(400).json({ error: nomineeValidation.error });
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
      nominees: nomineeValidation.nominees,
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

      // First account on an empty cooperative becomes the bootstrap administrator.
      const isBootstrapAdmin = draft.users.length === 0;

      createdUser = {
        id: `usr-${isBootstrapAdmin ? 'adm' : 'mem'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        passwordHash,
        googleUid: verifiedGoogle?.uid,
        authProvider,
        role: isBootstrapAdmin ? 'admin' : 'member',
        memberCode: nextMemberCode(draft.users),
        status: isBootstrapAdmin ? 'active' : 'pending_approval',
        joinedAt: new Date().toISOString(),
        phoneMasked: maskReference(mobile),
        photoUrl,
        encryptedRegistrationDetails: encryptSensitiveObject(registrationDetails),
      };

      sanitized = sanitizeUser(createdUser);
      draft.users.push(createdUser);

      if (!isBootstrapAdmin) {
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
      }

      appendAuditLog(draft, {
        actor: sanitized,
        action: isBootstrapAdmin ? 'BOOTSTRAP_ADMIN_CREATED' : 'MEMBER_SIGNUP_REQUESTED',
        resourceType: 'auth',
        resourceId: createdUser.id,
        summary: isBootstrapAdmin
          ? `Bootstrap administrator ${name} (${createdUser.memberCode}) created — empty cooperative initialized`
          : `New registration from ${name} (${createdUser.memberCode}) queued for administrator approval`,
        payload: {
          email: createdUser.email,
          memberCode: createdUser.memberCode,
          referenceMemberName,
          authProvider,
          status: createdUser.status,
          role: createdUser.role,
          bootstrap: isBootstrapAdmin,
        },
      });
      return draft;
    });

    broadcastRealtimeEvent('members:updated', { userId: createdUser.id });
    if (createdUser.status === 'pending_approval') {
      broadcastRealtimeEvent('notification:created', { type: 'signup_pending_admin' });
    }
    broadcastRealtimeEvent('audit:updated', {
      action:
        createdUser.role === 'admin' ? 'BOOTSTRAP_ADMIN_CREATED' : 'MEMBER_SIGNUP_REQUESTED',
      resourceType: 'auth',
      resourceId: createdUser.id,
    });

    res.status(201).json({
      pendingApproval: createdUser.status === 'pending_approval',
      bootstrapAdmin: createdUser.role === 'admin' && createdUser.status === 'active',
      user: sanitized,
      message:
        createdUser.role === 'admin'
          ? 'You are the first member of this cooperative. Your account is the bootstrap administrator and is ready to sign in.'
          : verifiedGoogle
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

apiRouter.post('/auth/2fa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const secret = generateTotpSecret(20);
    const otpAuthUri = buildOtpAuthUri({
      secret,
      accountEmail: viewer.email,
      issuer: 'Amanah',
    });
    const qrDataUrl = await QRCode.toDataURL(otpAuthUri, { width: 220, margin: 1 });

    await updateVaultState((draft) => {
      const user = draft.users.find((u) => u.id === viewer.id);
      if (user) {
        user.encryptedTotpSecret = encryptSensitiveObject({ secret });
        user.totpEnabled = false;
      }
      return draft;
    });

    res.json({ secret, otpAuthUri, qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to initialize two-factor authentication.' });
  }
});

apiRouter.post('/auth/2fa/enable', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const code = String(req.body?.code || '').trim();
    if (!code) {
      res.status(400).json({ error: 'Enter the 6-digit authenticator verification code.' });
      return;
    }

    let updatedUser: ReturnType<typeof sanitizeUser> | null = null;
    await updateVaultState((draft) => {
      const user = draft.users.find((u) => u.id === viewer.id);
      if (!user || !user.encryptedTotpSecret) {
        throw new Error('NO_SETUP');
      }
      const { secret } = decryptSensitiveObject<{ secret: string }>(user.encryptedTotpSecret);
      if (!verifyTotpCode(secret, code)) {
        throw new Error('INVALID_CODE');
      }
      user.totpEnabled = true;
      updatedUser = sanitizeUser(user);
      appendAuditLog(draft, {
        actor: updatedUser,
        action: 'TOTP_2FA_ENABLED',
        resourceType: 'auth',
        resourceId: viewer.id,
        summary: `${viewer.name} enabled TOTP two-factor step-up protection`,
        payload: { userId: viewer.id },
      });
      return draft;
    });

    broadcastRealtimeEvent('audit:updated', {
      action: 'TOTP_2FA_ENABLED',
      resourceType: 'auth',
      resourceId: viewer.id,
    });
    res.json({ user: updatedUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_SETUP') {
      res.status(400).json({ error: 'Run 2FA setup first before verifying a code.' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_CODE') {
      res.status(400).json({ error: 'Invalid 6-digit verification code. Check device clock and try again.' });
      return;
    }
    console.error('2FA enable error:', err);
    res.status(500).json({ error: 'Failed to enable two-factor authentication.' });
  }
});

apiRouter.post('/auth/2fa/disable', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const code = String(req.body?.code || '').trim();
    let updatedUser: ReturnType<typeof sanitizeUser> | null = null;

    await updateVaultState((draft) => {
      const user = draft.users.find((u) => u.id === viewer.id);
      if (!user) return draft;
      if (user.totpEnabled && user.encryptedTotpSecret) {
        const { secret } = decryptSensitiveObject<{ secret: string }>(user.encryptedTotpSecret);
        if (!verifyTotpCode(secret, code)) {
          throw new Error('INVALID_CODE');
        }
      }
      user.totpEnabled = false;
      user.encryptedTotpSecret = undefined;
      updatedUser = sanitizeUser(user);
      appendAuditLog(draft, {
        actor: updatedUser,
        action: 'TOTP_2FA_DISABLED',
        resourceType: 'auth',
        resourceId: viewer.id,
        summary: `${viewer.name} disabled TOTP two-factor protection`,
        payload: { userId: viewer.id },
      });
      return draft;
    });

    broadcastRealtimeEvent('audit:updated', {
      action: 'TOTP_2FA_DISABLED',
      resourceType: 'auth',
      resourceId: viewer.id,
    });
    res.json({ user: updatedUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_CODE') {
      res.status(403).json({ error: 'Valid current 6-digit 2FA code required to disable 2FA.' });
      return;
    }
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable two-factor authentication.' });
  }
});

apiRouter.patch('/profile/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const body = (req.body || {}) as Partial<NotificationPreferences>;
    let updatedUser: ReturnType<typeof sanitizeUser> | null = null;

    await updateVaultState((draft) => {
      const target = draft.users.find((u) => u.id === viewer.id);
      if (!target) return draft;
      target.notificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(target.notificationPreferences || {}),
        ...(typeof body.inAppAlerts === 'boolean' ? { inAppAlerts: body.inAppAlerts } : {}),
        ...(typeof body.emailBallots === 'boolean' ? { emailBallots: body.emailBallots } : {}),
        ...(typeof body.emailRepayments === 'boolean'
          ? { emailRepayments: body.emailRepayments }
          : {}),
        ...(typeof body.emailCommunity === 'boolean'
          ? { emailCommunity: body.emailCommunity }
          : {}),
        ...(typeof body.soundEnabled === 'boolean' ? { soundEnabled: body.soundEnabled } : {}),
      };
      updatedUser = sanitizeUser(target);
      return draft;
    });

    if (!updatedUser) {
      res.status(404).json({ error: 'Member profile not found.' });
      return;
    }
    res.json({ user: updatedUser });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Failed to save notification preferences.' });
  }
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

apiRouter.post('/profile/password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    let updatedUser: ReturnType<typeof sanitizeUser> | null = null;
    await updateVaultState((draft) => {
      const target = draft.users.find((u) => u.id === viewer.id);
      if (!target) return draft;

      if (target.passwordHash) {
        if (!currentPassword || !bcrypt.compareSync(currentPassword, target.passwordHash)) {
          throw new Error('INVALID_CURRENT_PASSWORD');
        }
      }

      target.passwordHash = bcrypt.hashSync(newPassword, 10);
      if (target.authProvider === 'google') {
        target.authProvider = 'both';
      }
      updatedUser = sanitizeUser(target);

      appendAuditLog(draft, {
        actor: updatedUser,
        action: 'MEMBER_PASSWORD_CHANGED',
        resourceType: 'auth',
        resourceId: target.id,
        summary: `${target.name} (${target.memberCode}) changed their account password directly`,
        payload: { userId: target.id },
      });

      return draft;
    });

    if (!updatedUser) {
      res.status(404).json({ error: 'Member account not found.' });
      return;
    }

    broadcastRealtimeEvent('audit:updated', {
      action: 'MEMBER_PASSWORD_CHANGED',
      resourceType: 'auth',
      resourceId: viewer.id,
    });
    res.json({ ok: true, user: updatedUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_CURRENT_PASSWORD') {
      res.status(403).json({ error: 'Current password is incorrect.' });
      return;
    }
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

apiRouter.get('/profile/change-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const isReviewer = viewer.role === 'admin' || viewer.role === 'manager';
    const list = (state.profileChangeRequests || []).filter((r) =>
      isReviewer ? true : r.userId === viewer.id
    );
    res.json({ requests: list });
  } catch (err) {
    console.error('Profile change requests load error:', err);
    res.status(500).json({ error: 'Failed to load profile update requests.' });
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

    // Member & Manager profile updates require Admin/Manager approval
    if (viewer.role !== 'admin') {
      let createdReq!: ProfileChangeRequest;
      let currentProfileUser: (ReturnType<typeof sanitizeUser> & {
        registrationDetails?: UserRegistrationDetails;
      }) | null = null;

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
        }

        const requestedChanges: ProfileChangePayload = {
          ...(name && name !== target.name ? { name } : {}),
          ...(email && email !== target.email.toLowerCase() ? { email } : {}),
          mobile,
          presentAddress,
          permanentAddress,
          ...(occupation !== undefined ? { occupation } : {}),
          ...(companyOrganization !== undefined ? { companyOrganization } : {}),
        };

        draft.profileChangeRequests = Array.isArray(draft.profileChangeRequests)
          ? draft.profileChangeRequests
          : [];

        // Replace any older pending request from the same user so queue stays tidy
        draft.profileChangeRequests = draft.profileChangeRequests.filter(
          (r) => !(r.userId === target.id && r.status === 'pending')
        );

        createdReq = {
          id: `profreq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: target.id,
          memberName: target.name,
          memberCode: target.memberCode,
          memberRole: target.role,
          requestedChanges,
          status: 'pending',
          requestedAt: new Date().toISOString(),
        };
        draft.profileChangeRequests.unshift(createdReq);

        const approvers = draft.users.filter(
          (u) =>
            u.status === 'active' &&
            u.id !== target.id &&
            (u.role === 'admin' || (target.role === 'member' && u.role === 'manager'))
        );
        approvers.forEach((staff) => {
          queueEmailNotification(draft, {
            type: 'profile_update_requested',
            recipientEmail: staff.email,
            recipientName: staff.name,
            recipientUserId: staff.id,
            subject: `Profile Update Approval Needed: ${target.name} (${target.memberCode})`,
            body: `${target.name} (${target.memberCode}) requested changes to their profile details (mobile/addresses/role info). Please approve or decline in Member Registry / Manager Desk.`,
            relatedId: createdReq.id,
          });
        });

        let regDetails: UserRegistrationDetails | undefined;
        if (target.encryptedRegistrationDetails) {
          try {
            regDetails = decryptSensitiveObject<UserRegistrationDetails>(
              target.encryptedRegistrationDetails
            );
          } catch {
            regDetails = undefined;
          }
        }
        const sanitized = sanitizeUser(target);
        currentProfileUser = { ...sanitized, registrationDetails: regDetails };

        appendAuditLog(draft, {
          actor: sanitized,
          action: 'MEMBER_PROFILE_CHANGE_REQUESTED',
          resourceType: 'auth',
          resourceId: createdReq.id,
          summary: `${target.name} (${target.memberCode}) submitted profile update request for Admin/Manager approval`,
          payload: { requestId: createdReq.id, fields: Object.keys(requestedChanges) },
        });
        return draft;
      });

      if (!currentProfileUser) {
        res.status(404).json({ error: 'Member profile not found.' });
        return;
      }

      broadcastRealtimeEvent('profile:updated', { requestId: createdReq.id });
      broadcastRealtimeEvent('notification:created', { type: 'profile_update_requested' });
      res.status(202).json({
        pendingApproval: true,
        user: currentProfileUser,
        request: createdReq,
        message: 'Profile change request submitted for Administrator / Manager approval.',
      });
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
    res.json({ pendingApproval: false, user: updatedPublicUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
      res.status(409).json({ error: 'Another member account already uses that email address.' });
      return;
    }
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update member profile.' });
  }
});

apiRouter.patch(
  '/profile/change-requests/:id/review',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      const decision =
        req.body?.decision === 'approved'
          ? 'approved'
          : req.body?.decision === 'rejected'
            ? 'rejected'
            : null;
      const reviewNote = String(req.body?.reviewNote || '').trim();

      if (!decision) {
        res.status(400).json({ error: 'Decision must be "approved" or "rejected".' });
        return;
      }
      if (decision === 'rejected' && !reviewNote) {
        res.status(400).json({ error: 'Provide a note explaining why the profile update was declined.' });
        return;
      }

      let reviewedReq: ProfileChangeRequest | null = null;
      await updateVaultState((draft) => {
        draft.profileChangeRequests = Array.isArray(draft.profileChangeRequests)
          ? draft.profileChangeRequests
          : [];
        const targetReq = draft.profileChangeRequests.find((r) => r.id === id);
        if (!targetReq) return draft;
        if (targetReq.status !== 'pending') {
          throw new Error('ALREADY_REVIEWED');
        }
        if (viewer.role !== 'admin' && targetReq.userId === viewer.id) {
          throw new Error('CANNOT_SELF_APPROVE');
        }

        const member = draft.users.find((u) => u.id === targetReq.userId);
        if (!member) {
          throw new Error('USER_NOT_FOUND');
        }

        const reviewedAt = new Date().toISOString();
        targetReq.status = decision;
        targetReq.reviewedBy = viewer.id;
        targetReq.reviewerName = viewer.name;
        targetReq.reviewedAt = reviewedAt;
        targetReq.reviewNote = reviewNote || undefined;

        if (decision === 'approved') {
          const ch = targetReq.requestedChanges;
          if (ch.email && ch.email !== member.email.toLowerCase()) {
            const duplicate = draft.users.some(
              (u) => u.id !== member.id && u.email.toLowerCase() === ch.email
            );
            if (duplicate) {
              throw new Error('EMAIL_IN_USE');
            }
            member.email = ch.email;
          }
          if (ch.name) {
            member.name = ch.name;
          }
          if (ch.mobile) {
            member.phoneMasked = maskReference(ch.mobile);
          }

          let existingDetails: UserRegistrationDetails = {
            dateOfBirth: '',
            referenceMemberName: 'Amanah Administrator',
            mobile: ch.mobile || '',
            occupation: ch.occupation || '',
            companyOrganization: ch.companyOrganization || '',
            nid: '',
            presentAddress: ch.presentAddress || '',
            permanentAddress: ch.permanentAddress || '',
            photoUrl: member.photoUrl || '',
          };
          if (member.encryptedRegistrationDetails) {
            try {
              existingDetails = decryptSensitiveObject<UserRegistrationDetails>(
                member.encryptedRegistrationDetails
              );
            } catch {
              // ignore
            }
          }

          const nextDetails: UserRegistrationDetails = {
            ...existingDetails,
            mobile: ch.mobile ?? existingDetails.mobile,
            presentAddress: ch.presentAddress ?? existingDetails.presentAddress,
            permanentAddress: ch.permanentAddress ?? existingDetails.permanentAddress,
            occupation: ch.occupation !== undefined ? ch.occupation : existingDetails.occupation,
            companyOrganization:
              ch.companyOrganization !== undefined
                ? ch.companyOrganization
                : existingDetails.companyOrganization,
          };
          member.encryptedRegistrationDetails = encryptSensitiveObject(nextDetails);
        }

        reviewedReq = targetReq;

        queueEmailNotification(draft, {
          type: 'profile_update_reviewed',
          recipientEmail: member.email,
          recipientName: member.name,
          recipientUserId: member.id,
          subject:
            decision === 'approved'
              ? 'Profile Update Approved'
              : 'Profile Update Declined — Please Review Note',
          body:
            decision === 'approved'
              ? `Assalamu Alaikum ${member.name}, your requested profile update has been approved by ${viewer.name}.`
              : `Assalamu Alaikum ${member.name}, your profile update request was declined by ${viewer.name}. Note: ${reviewNote}`,
          relatedId: targetReq.id,
        });

        appendAuditLog(draft, {
          actor: viewer,
          action: decision === 'approved' ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED',
          resourceType: 'auth',
          resourceId: targetReq.id,
          summary: `${viewer.name} ${decision} profile update request for ${member.name} (${member.memberCode})`,
          payload: {
            requestId: targetReq.id,
            targetUserId: member.id,
            decision,
            reviewNote: reviewNote || undefined,
          },
        });
        return draft;
      });

      if (!reviewedReq) {
        res.status(404).json({ error: 'Profile update request not found.' });
        return;
      }

      broadcastRealtimeEvent('profile:updated', { requestId: id, decision });
      broadcastRealtimeEvent('members:updated', { userId: (reviewedReq as ProfileChangeRequest).userId });
      broadcastRealtimeEvent('notification:created', { type: 'profile_update_reviewed' });
      res.json({ request: reviewedReq });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_REVIEWED') {
        res.status(409).json({ error: 'This profile update request has already been reviewed.' });
        return;
      }
      if (err instanceof Error && err.message === 'CANNOT_SELF_APPROVE') {
        res.status(403).json({
          error: 'Another Manager or Administrator must approve your own profile change request.',
        });
        return;
      }
      if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
        res.status(409).json({ error: 'Requested email address is already used by another user.' });
        return;
      }
      console.error('Review profile change request error:', err);
      res.status(500).json({ error: 'Failed to review profile change request.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. Real-time Dashboard Overview & Gemini Slip Verification
// ---------------------------------------------------------------------------

apiRouter.post(
  '/gemini/verify-receipt',
  requireAuth,
  geminiRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const imageBase64 = String(req.body?.imageBase64 || '').trim();
      if (!imageBase64) {
        res.status(400).json({ error: 'Receipt image payload is required.' });
        return;
      }
      const state = await loadVaultState();
      const result = await verifyPaymentReceiptImage({
        imageBase64,
        currency: state.fundConfig.currency,
      });
      res.json({ extraction: result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to analyze payment receipt with Gemini AI.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  }
);

apiRouter.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await syncOverdueInstallments();
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
    if (viewer.role === 'admin') {
      res.status(403).json({
        error:
          'Administrator accounts govern site settings, member roles, and audits only and cannot submit member contributions.',
      });
      return;
    }
    const rawMonths = Array.isArray(req.body?.billingMonths)
      ? (req.body.billingMonths as unknown[]).map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    const singleBillingMonth = String(req.body?.billingMonth || '').trim();
    const billingMonths = Array.from(
      new Set(rawMonths.length > 0 ? rawMonths : singleBillingMonth ? [singleBillingMonth] : [])
    ).sort();

    const amount = Number(req.body?.amount);
    const channel = req.body?.channel === 'mfs' ? 'mfs' : 'bank';
    const providerName = String(req.body?.providerName || '').trim();
    const referenceId = String(req.body?.referenceId || '').trim();
    const senderAccount = String(req.body?.senderAccount || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const receiptPhotoUrl = String(req.body?.receiptPhotoUrl || '').trim();
    const receiptAiSummary = String(req.body?.receiptAiSummary || '').trim();

    if (billingMonths.length === 0 || billingMonths.length > 12) {
      res.status(400).json({ error: 'Select between 1 and 12 billing months.' });
      return;
    }
    if (!billingMonths.every((m) => /^\d{4}-\d{2}$/.test(m))) {
      res.status(400).json({ error: 'All billing months must be in YYYY-MM format.' });
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

    const count = billingMonths.length;
    const perMonthBase = Math.floor((amount / count) * 100) / 100;
    const batchGroupId =
      count > 1 ? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : undefined;
    const submittedAt = new Date().toISOString();
    const createdList: Contribution[] = [];

    await updateVaultState((draft) => {
      const duplicateMonths = billingMonths.filter((m) =>
        draft.contributions.some(
          (c) => c.userId === viewer.id && c.billingMonth === m && c.status !== 'rejected'
        )
      );
      if (duplicateMonths.length > 0) {
        throw new Error(`DUPLICATE_MONTHS:${duplicateMonths.join(', ')}`);
      }

      billingMonths.forEach((month, idx) => {
        const isLast = idx === count - 1;
        const allocAmount = isLast
          ? Math.round((amount - perMonthBase * (count - 1)) * 100) / 100
          : perMonthBase;

        const id = `contrib-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        const encryptedDetails = encryptSensitiveObject({
          referenceId,
          senderAccount,
          notes:
            notes ||
            (count > 1
              ? `Multi-month advance contribution (${month}, batch ${idx + 1}/${count})`
              : `Monthly contribution for ${month}`),
        });

        const item: Contribution = {
          id,
          userId: viewer.id,
          memberName: viewer.name,
          memberCode: viewer.memberCode,
          billingMonth: month,
          amount: allocAmount,
          channel,
          providerName,
          maskedReference: maskReference(referenceId),
          receiptPhotoUrl: receiptPhotoUrl || undefined,
          receiptAiSummary: receiptAiSummary || undefined,
          batchGroupId,
          encryptedDetails,
          status: 'pending',
          submittedAt,
          entryHash: computeSha256Hash({
            id,
            userId: viewer.id,
            billingMonth: month,
            amount: allocAmount,
            channel,
            referenceId,
            batchGroupId,
          }),
        };

        draft.contributions.unshift(item);
        createdList.push(item);
      });

      const reviewers = draft.users.filter(
        (u) => (u.role === 'manager' || u.role === 'admin') && u.status === 'active'
      );
      const monthsLabel = billingMonths.join(', ');
      reviewers.forEach((mgr) => {
        queueEmailNotification(draft, {
          type: 'contribution_placed_manager',
          recipientEmail: mgr.email,
          recipientName: mgr.name,
          recipientUserId: mgr.id,
          subject:
            count > 1
              ? `Advance Contribution Batch (${count} months): ${viewer.name}`
              : `Contribution Placement Request: ${viewer.name} (${monthsLabel})`,
          body: `${viewer.name} (${viewer.memberCode}) submitted ${count > 1 ? `a ${count}-month advance contribution totaling` : 'a monthly contribution of'} ${amount} ${draft.fundConfig.currency} via ${channel.toUpperCase()} (${providerName}, Ref ${maskReference(referenceId)}) for ${monthsLabel}. Please review and approve to credit the central balance.`,
          relatedId: createdList[0].id,
        });
      });

      appendAuditLog(draft, {
        actor: viewer,
        action: 'CONTRIBUTION_SUBMITTED',
        resourceType: 'contribution',
        resourceId: createdList[0].id,
        summary: `${viewer.name} submitted ${channel.toUpperCase()} contribution (${providerName}) for ${monthsLabel} totaling ${amount}`,
        payload: {
          contributionIds: createdList.map((c) => c.id),
          billingMonths,
          amount,
          channel,
          providerName,
          batchGroupId,
        },
      });
      return draft;
    });

    broadcastRealtimeEvent('contribution:submitted', {
      contributionId: createdList[0].id,
      billingMonth: billingMonths[0],
      amount,
      count,
    });
    broadcastRealtimeEvent('notification:created', { type: 'contribution_placed_manager' });
    broadcastRealtimeEvent('audit:updated', {
      action: 'CONTRIBUTION_SUBMITTED',
      resourceType: 'contribution',
      resourceId: createdList[0].id,
    });

    res.status(201).json({
      contribution: hydrateContributionForViewer(createdList[0], viewer),
      contributions: createdList.map((c) => hydrateContributionForViewer(c, viewer)),
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('DUPLICATE_MONTHS:')) {
      const months = err.message.slice('DUPLICATE_MONTHS:'.length);
      res.status(409).json({
        error: `A pending or approved contribution already exists for: ${months}.`,
      });
      return;
    }
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
      if (decision === 'rejected' && !reviewNote) {
        res.status(400).json({
          error:
            'A correction note is required when denying a contribution so the member can fix and resubmit.',
        });
        return;
      }

      const viewer = req.authUser!;
      let updated: Contribution | null = null;

      await updateVaultState((draft) => {
        const idx = draft.contributions.findIndex((c) => c.id === id);
        if (idx === -1) return draft;

        const target = draft.contributions[idx];
        if (viewer.role !== 'admin' && target.userId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
        if (target.status !== 'pending') {
          throw new Error('ALREADY_REVIEWED');
        }

        target.status = decision;
        target.reviewedAt = new Date().toISOString();
        target.reviewedBy = viewer.id;
        target.reviewerName = viewer.name;
        target.reviewNote =
          reviewNote || 'Verified against Bank/MFS settlement statement.';

        updated = target;

        const member = draft.users.find((u) => u.id === target.userId);
        if (member) {
          if (decision === 'approved') {
            queueEmailNotification(draft, {
              type: 'contribution_accepted',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Contribution Accepted: ${target.amount} ${draft.fundConfig.currency} (${target.billingMonth})`,
              body: `Assalamu Alaikum ${member.name}, your monthly contribution of ${target.amount} ${draft.fundConfig.currency} via ${target.providerName} (${target.billingMonth}) has been verified by ${viewer.name} and added to the cooperative central fund balance.`,
              relatedId: target.id,
            });
          } else {
            queueEmailNotification(draft, {
              type: 'contribution_rejected',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Contribution Denied — Action Needed (${target.billingMonth})`,
              body: `Assalamu Alaikum ${member.name}, your contribution submission (${target.amount} ${draft.fundConfig.currency} for ${target.billingMonth}) was denied by ${viewer.name}. Correction Note: "${target.reviewNote}". Please correct your transaction details and resubmit in Monthly Contribution.`,
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
      broadcastRealtimeEvent('notification:created', {
        type: decision === 'approved' ? 'contribution_accepted' : 'contribution_rejected',
      });
      broadcastRealtimeEvent('audit:updated', {
        action: decision === 'approved' ? 'CONTRIBUTION_APPROVED' : 'CONTRIBUTION_REJECTED',
        resourceType: 'contribution',
        resourceId: (updated as Contribution).id,
      });
      res.json({ contribution: hydrateContributionForViewer(updated, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: Managers cannot approve or decline their own contribution. Ask a peer manager or admin.',
        });
        return;
      }
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
    await syncOverdueInstallments();
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
    await syncOverdueInstallments();
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
    if (viewer.role === 'admin') {
      res.status(403).json({
        error:
          'Administrator accounts govern cooperative policy and cannot borrow Qard Hasan.',
      });
      return;
    }
    const rawAmount = Number(req.body?.amount);
    const installmentMonths = Number(req.body?.installmentMonths);
    const purpose = String(req.body?.purpose || '').trim();
    const emergencyContext = String(req.body?.emergencyContext || '').trim();
    const disbursementAccount = String(req.body?.disbursementAccount || '').trim();
    const channel = req.body?.channel === 'mfs' ? 'mfs' : 'bank';
    const provider = String(req.body?.provider || '').trim();
    const requestedGuarantorIds = Array.isArray(req.body?.guarantorIds)
      ? Array.from(new Set((req.body.guarantorIds as unknown[]).map((g) => String(g || '').trim()).filter(Boolean)))
      : [];

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      res.status(400).json({ error: 'Loan amount must be positive.' });
      return;
    }
    const amount = Math.round(rawAmount * 100) / 100;
    if (amount < 100) {
      res.status(400).json({ error: 'Minimum Qard Hasan loan amount is 100.' });
      return;
    }
    // Absolute safety bound (config max is applied later). Accept whole numbers only.
    if (
      !Number.isFinite(installmentMonths) ||
      !Number.isInteger(installmentMonths) ||
      installmentMonths < 1 ||
      installmentMonths > 60
    ) {
      res.status(400).json({ error: 'Installment duration must be a whole number between 1 and 60 months.' });
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

      const effectiveMaxLoan = eligibility.effectiveMaxLoanAmount ?? draft.fundConfig.maxLoanAmount;
      if (amount > draft.fundConfig.maxLoanAmount) {
        throw new Error(`AMOUNT_EXCEEDS_MAX:${draft.fundConfig.maxLoanAmount}`);
      }
      if (
        typeof draft.fundConfig.loanSavingsCapPct === 'number' &&
        draft.fundConfig.loanSavingsCapPct > 0 &&
        amount > effectiveMaxLoan
      ) {
        throw new Error(
          `AMOUNT_EXCEEDS_SAVINGS_CAP:${effectiveMaxLoan}:${draft.fundConfig.loanSavingsCapPct}`
        );
      }
      const effectiveMaxMonths =
        eligibility.effectiveMaxInstallmentMonths ?? draft.fundConfig.maxInstallmentMonths;
      if (installmentMonths > effectiveMaxMonths) {
        throw new Error(`MONTHS_EXCEED_MAX:${effectiveMaxMonths}`);
      }

      const guarantorThreshold = draft.fundConfig.guarantorThresholdAmount ?? 40000;
      const requiredGuarantors = draft.fundConfig.requiredGuarantorsCount ?? 1;
      const otherActiveMembers = draft.users.filter(
        (u) => u.status === 'active' && u.role !== 'admin' && u.id !== viewer.id
      );
      const needsGuarantor =
        amount > guarantorThreshold && requiredGuarantors > 0 && otherActiveMembers.length > 0;

      const resolvedGuarantors: LoanGuarantor[] = [];
      if (needsGuarantor) {
        const neededCount = Math.min(requiredGuarantors, otherActiveMembers.length);
        for (const gid of requestedGuarantorIds) {
          const gUser = otherActiveMembers.find((u) => u.id === gid);
          if (gUser) {
            resolvedGuarantors.push({
              memberId: gUser.id,
              memberName: gUser.name,
              memberCode: gUser.memberCode,
              status: 'pending',
            });
          }
        }
        if (resolvedGuarantors.length < neededCount) {
          throw new Error(`GUARANTORS_REQUIRED:${neededCount}:${guarantorThreshold}`);
        }
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

      // Always route to Manager Desk (pending_manager_review) so managers can
      // see and initiate 2/3 voting. Guarantors (if any) are notified in parallel
      // and remain attached to the loan for transparency — they no longer block
      // the request from appearing in Stage 1 of Manager Desk.
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
        status: 'pending_manager_review',
        guarantors: resolvedGuarantors.length > 0 ? resolvedGuarantors : undefined,
        eligibilitySnapshot: eligibility,
        votes: [],
        requiredApprovals,
        totalEligibleVoters: activeVoters,
        voteResultRevealed: false,
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

      if (needsGuarantor) {
        resolvedGuarantors.forEach((g) => {
          const gUser = draft.users.find((u) => u.id === g.memberId);
          if (gUser) {
            queueEmailNotification(draft, {
              type: 'loan_guarantor_requested',
              recipientEmail: gUser.email,
              recipientName: gUser.name,
              recipientUserId: gUser.id,
              subject: `Guarantor Co-Sign Request: ${viewer.name} (${id})`,
              body: `${viewer.name} (${viewer.memberCode}) requested a high-value Qard Hasan loan of ${amount} ${currency} (${installmentMonths} months) for "${purpose}" and nominated you as cooperative guarantor. Please review and accept/decline in the Qard Hasan tab. The application is already in Manager Desk for vote initiation.`,
              relatedId: id,
            });
          }
        });
      }

      const managersAndAdmins = draft.users.filter(
        (u) => u.status === 'active' && (u.role === 'manager' || u.role === 'admin')
      );
      managersAndAdmins.forEach((staff) => {
        queueEmailNotification(draft, {
          type: 'loan_vote_requested',
          recipientEmail: staff.email,
          recipientName: staff.name,
          recipientUserId: staff.id,
          subject: `New Qard Hasan Application (Initiate Vote Needed): ${viewer.name} (${id})`,
          body: `${viewer.name} (${viewer.memberCode}) submitted a ${amount} ${currency} Qard Hasan loan application (${installmentMonths} months) for "${purpose}".${
            needsGuarantor
              ? ` Guarantor co-signers were also nominated (${resolvedGuarantors.length}).`
              : ''
          } Review application details in Manager Desk → Qard Hasan → Stage 1 to initiate the 2/3 member ballot.`,
          relatedId: id,
        });
      });

      appendAuditLog(draft, {
        actor: viewer,
        action: 'LOAN_REQUEST_CREATED',
        resourceType: 'loan',
        resourceId: id,
        summary: `${viewer.name} submitted a ${amount} Qard Hasan request (${installmentMonths} monthly installments) — queued in Manager Desk for vote initiation`,
        payload: {
          loanId: id,
          amount,
          installmentMonths,
          requiredApprovals,
          totalEligibleVoters: activeVoters,
          guarantorCount: resolvedGuarantors.length,
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
      status: createdLoan.status,
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
      if (err.message.startsWith('AMOUNT_EXCEEDS_SAVINGS_CAP:')) {
        const [, cap, pct] = err.message.split(':');
        res.status(400).json({
          error: `Requested amount exceeds your ${pct}% savings borrowing limit (${cap}).`,
        });
        return;
      }
      if (err.message.startsWith('MONTHS_EXCEED_MAX:')) {
        const maxM = err.message.split(':')[1];
        res.status(400).json({ error: `Installment schedule cannot exceed ${maxM} months.` });
        return;
      }
      if (err.message.startsWith('GUARANTORS_REQUIRED:')) {
        const [, count, threshold] = err.message.split(':');
        res.status(400).json({
          error: `Loans above ${threshold} require at least ${count} active cooperative guarantor(s).`,
        });
        return;
      }
    }
    console.error('Create loan error:', err);
    res.status(500).json({ error: 'Failed to submit loan request.' });
  }
});

/** Borrower may withdraw a pending application so they can re-apply later. */
apiRouter.post('/loans/:id/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    let updatedLoan: LoanRequest | null = null;

    await updateVaultState((draft) => {
      const loan = draft.loans.find((l) => l.id === id);
      if (!loan) throw new Error('LOAN_NOT_FOUND');
      if (loan.borrowerId !== viewer.id) throw new Error('NOT_BORROWER');
      const previousStatus = loan.status;
      if (
        previousStatus !== 'pending_guarantor' &&
        previousStatus !== 'pending_manager_review'
      ) {
        throw new Error('NOT_WITHDRAWABLE');
      }

      loan.status = 'rejected';
      loan.adminDecision = 'rejected';
      loan.adminReviewedAt = new Date().toISOString();
      loan.adminReviewedBy = viewer.name;
      loan.adminReviewNote = 'Withdrawn by borrower before manager vote initiation.';
      updatedLoan = loan;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'LOAN_WITHDRAWN_BY_BORROWER',
        resourceType: 'loan',
        resourceId: loan.id,
        summary: `${viewer.name} withdrew Qard Hasan application ${loan.id} (was ${previousStatus})`,
        payload: { loanId: loan.id, amount: loan.amount, previousStatus },
      });
      return draft;
    });

    if (!updatedLoan) {
      res.status(404).json({ error: 'Loan application not found.' });
      return;
    }

    broadcastRealtimeEvent('loan:updated', {
      loanId: (updatedLoan as LoanRequest).id,
      status: 'rejected',
    });
    broadcastRealtimeEvent('audit:updated', {
      action: 'LOAN_WITHDRAWN_BY_BORROWER',
      resourceType: 'loan',
      resourceId: (updatedLoan as LoanRequest).id,
    });

    res.json({ loan: hydrateLoanForViewer(updatedLoan as LoanRequest, viewer) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'LOAN_NOT_FOUND') {
        res.status(404).json({ error: 'Loan application not found.' });
        return;
      }
      if (err.message === 'NOT_BORROWER') {
        res.status(403).json({ error: 'Only the borrower can withdraw this application.' });
        return;
      }
      if (err.message === 'NOT_WITHDRAWABLE') {
        res.status(400).json({
          error:
            'Only applications still awaiting guarantor response or manager review can be withdrawn.',
        });
        return;
      }
    }
    console.error('Withdraw loan error:', err);
    res.status(500).json({ error: 'Failed to withdraw loan application.' });
  }
});

apiRouter.post('/loans/:id/guarantor-respond', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const decision =
      req.body?.decision === 'accept'
        ? 'accept'
        : req.body?.decision === 'decline'
          ? 'decline'
          : null;
    const note = String(req.body?.note || '').trim();

    if (!decision) {
      res.status(400).json({ error: 'Decision must be "accept" or "decline".' });
      return;
    }

    let updatedLoan: LoanRequest | null = null;
    let movedToVote = false;

    await updateVaultState((draft) => {
      const loan = draft.loans.find((l) => l.id === id);
      if (!loan) return draft;
      if (loan.status !== 'pending_guarantor') {
        throw new Error('NOT_PENDING_GUARANTOR');
      }
      const guarantor = (loan.guarantors || []).find((g) => g.memberId === viewer.id);
      if (!guarantor) {
        throw new Error('NOT_A_GUARANTOR');
      }
      if (guarantor.status !== 'pending') {
        throw new Error('ALREADY_RESPONDED');
      }

      const respondedAt = new Date().toISOString();
      guarantor.status = decision === 'accept' ? 'accepted' : 'declined';
      guarantor.respondedAt = respondedAt;
      guarantor.note = note || undefined;

      const borrower = draft.users.find((u) => u.id === loan.borrowerId);

      if (decision === 'decline') {
        loan.status = 'rejected';
        if (borrower) {
          queueEmailNotification(draft, {
            type: 'loan_rejected_notice',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: `Guarantor Declined Qard Hasan Co-Sign: ${loan.id}`,
            body: `Assalamu Alaikum ${borrower.name}, ${viewer.name} (${viewer.memberCode}) declined the guarantor co-sign request for ${loan.id}.${note ? ` Note: ${note}` : ''}`,
            relatedId: loan.id,
          });
        }
      } else if ((loan.guarantors || []).every((g) => g.status === 'accepted')) {
        loan.status = 'pending_manager_review';
        movedToVote = true;
        const managers = draft.users.filter(
          (u) => u.status === 'active' && (u.role === 'manager' || u.role === 'admin')
        );
        managers.forEach((mgr) => {
          queueEmailNotification(draft, {
            type: 'loan_vote_requested',
            recipientEmail: mgr.email,
            recipientName: mgr.name,
            recipientUserId: mgr.id,
            subject: `Guarantor Accepted — Ready to Initiate Vote: ${loan.borrowerName} (${loan.id})`,
            body: `All guarantors co-signed ${loan.borrowerName}'s ${loan.amount} ${draft.fundConfig.currency} Qard Hasan request (${loan.id}). Open Manager Desk to initiate 2/3 member voting.`,
            relatedId: loan.id,
          });
        });
      }

      updatedLoan = loan;

      appendAuditLog(draft, {
        actor: viewer,
        action: decision === 'accept' ? 'LOAN_GUARANTOR_ACCEPTED' : 'LOAN_GUARANTOR_DECLINED',
        resourceType: 'loan',
        resourceId: loan.id,
        summary: `${viewer.name} ${decision === 'accept' ? 'accepted' : 'declined'} guarantor co-sign for ${loan.borrowerName} (${loan.id})`,
        payload: {
          loanId: loan.id,
          decision,
          resultingStatus: loan.status,
        },
      });
      return draft;
    });

    if (!updatedLoan) {
      res.status(404).json({ error: 'Loan request not found.' });
      return;
    }

    broadcastRealtimeEvent('loan:voted', { loanId: id });
    if (movedToVote) {
      broadcastRealtimeEvent('notification:created', { type: 'loan_vote_requested', loanId: id });
    }
    broadcastRealtimeEvent('audit:updated', {
      action: decision === 'accept' ? 'LOAN_GUARANTOR_ACCEPTED' : 'LOAN_GUARANTOR_DECLINED',
      resourceType: 'loan',
      resourceId: id,
    });

    res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_PENDING_GUARANTOR') {
      res.status(409).json({ error: 'This loan is no longer awaiting guarantor co-signature.' });
      return;
    }
    if (err instanceof Error && err.message === 'NOT_A_GUARANTOR') {
      res.status(403).json({ error: 'You are not listed as a guarantor on this loan request.' });
      return;
    }
    if (err instanceof Error && err.message === 'ALREADY_RESPONDED') {
      res.status(409).json({ error: 'You have already responded as guarantor for this loan.' });
      return;
    }
    console.error('Guarantor response error:', err);
    res.status(500).json({ error: 'Failed to record guarantor response.' });
  }
});

apiRouter.post(
  '/loans/:id/initiate-vote',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      // Voting window in hours (default 48). Manager may set 1–720 (30 days).
      const rawHours = Number(req.body?.durationHours ?? req.body?.voteDurationHours ?? 48);
      const durationHours = Number.isFinite(rawHours)
        ? Math.min(720, Math.max(1, Math.round(rawHours)))
        : 48;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;
        if (viewer.role !== 'admin' && loan.borrowerId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
        if (loan.status !== 'pending_manager_review') {
          throw new Error('NOT_PENDING_MANAGER_REVIEW');
        }

        const { activeVoters, requiredApprovals } = computeRequiredApprovals(draft);
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const deadline = new Date(nowDate.getTime() + durationHours * 60 * 60 * 1000).toISOString();
        loan.status = 'pending_vote';
        loan.voteInitiatedAt = now;
        loan.voteInitiatedBy = viewer.name;
        loan.voteDurationHours = durationHours;
        loan.voteDeadlineAt = deadline;
        loan.voteResultRevealed = false;
        loan.totalEligibleVoters = activeVoters;
        loan.requiredApprovals = requiredApprovals;

        const overview = buildDashboardOverview(draft, viewer);
        const eligibleVoters = draft.users.filter(
          (u) => u.status === 'active' && u.role !== 'admin' && u.id !== loan.borrowerId
        );
        eligibleVoters.forEach((member) => {
          queueEmailNotification(draft, {
            type: 'loan_vote_requested',
            recipientEmail: member.email,
            recipientName: member.name,
            recipientUserId: member.id,
            subject: `Opinion Ballot Open — Qard Hasan Vote: ${loan.borrowerName} (${loan.id})`,
            body: `Manager ${viewer.name} opened voting on ${loan.borrowerName}'s ${loan.amount} ${draft.fundConfig.currency} Qard Hasan application for "${loan.purpose}". Ballot closes at ${deadline}. Cast or change your secret vote in Opinion Ballot until the deadline (Treasury liquidity: ${overview.treasury.availableLiquidity} ${draft.fundConfig.currency}).`,
            relatedId: loan.id,
          });
        });

        updatedLoan = loan;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'LOAN_VOTE_INITIATED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} initiated secret Opinion Ballot on ${loan.borrowerName}'s Qard Hasan request (${loan.id}) — ${durationHours}h window`,
          payload: {
            loanId: loan.id,
            requiredApprovals,
            totalEligibleVoters: activeVoters,
            durationHours,
            voteDeadlineAt: deadline,
          },
        });
        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan request not found.' });
        return;
      }

      broadcastRealtimeEvent('loan:reviewed', { loanId: id, decision: 'vote_initiated' });
      broadcastRealtimeEvent('notification:created', { type: 'loan_vote_requested', loanId: id });
      broadcastRealtimeEvent('audit:updated', {
        action: 'LOAN_VOTE_INITIATED',
        resourceType: 'loan',
        resourceId: id,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: You cannot initiate voting on your own Qard Hasan loan request.',
        });
        return;
      }
      if (err instanceof Error && err.message === 'NOT_PENDING_MANAGER_REVIEW') {
        res.status(409).json({ error: 'This loan is not awaiting Manager review to start voting.' });
        return;
      }
      console.error('Initiate loan vote error:', err);
      res.status(500).json({ error: 'Failed to initiate Qard Hasan voting.' });
    }
  }
);

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
    if (viewer.role === 'admin') {
      res.status(403).json({
        error:
          'Administrator accounts inspect audit ballots only and do not cast member votes.',
      });
      return;
    }

    let updatedLoan: LoanRequest | null = null;

    await updateVaultState((draft) => {
      const voterRecord = draft.users.find((u) => u.id === viewer.id);
      if (!voterRecord || voterRecord.status !== 'active') {
        throw new Error('UNVERIFIED_MEMBER');
      }

      const loan = draft.loans.find((l) => l.id === id);
      if (!loan) return draft;

      if (loan.status !== 'pending_vote' || loan.voteResultRevealed) {
        throw new Error('VOTING_CLOSED');
      }
      if (loan.voteDeadlineAt && new Date(loan.voteDeadlineAt).getTime() < Date.now()) {
        throw new Error('VOTING_DEADLINE_PASSED');
      }
      if (loan.borrowerId === viewer.id) {
        throw new Error('CANNOT_VOTE_OWN');
      }

      const castAt = new Date().toISOString();
      const existingIdx = loan.votes.findIndex((v) => v.voterId === viewer.id);
      const ballot: LoanVote = {
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
      };
      const isChange = existingIdx >= 0;
      if (isChange) {
        loan.votes[existingIdx] = ballot;
      } else {
        loan.votes.push(ballot);
      }
      loan.voteResultRevealed = false;
      updatedLoan = loan;

      appendAuditLog(draft, {
        actor: viewer,
        action: isChange ? 'LOAN_VOTE_CHANGED' : 'LOAN_VOTE_CAST',
        resourceType: 'vote',
        resourceId: loan.id,
        summary: isChange
          ? `An anonymized verified ballot was changed on Qard Hasan request ${loan.id} (${loan.votes.length} total ballots)`
          : `An anonymized verified ballot was cast on Qard Hasan request ${loan.id} (${loan.votes.length} total ballots cast)`,
        payload: {
          loanId: loan.id,
          decision,
          totalVotesCast: loan.votes.length,
          changed: isChange,
        },
      });

      return draft;
    });

    if (!updatedLoan) {
      res.status(404).json({ error: 'Loan request not found.' });
      return;
    }

    broadcastRealtimeEvent('loan:voted', { loanId: id });
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
    if (err instanceof Error && err.message === 'VOTING_DEADLINE_PASSED') {
      res.status(409).json({
        error: 'The voting deadline has passed. Ballots can no longer be cast or changed.',
      });
      return;
    }
    if (err instanceof Error && err.message === 'CANNOT_VOTE_OWN') {
      res.status(403).json({ error: 'You cannot vote on your own Qard Hasan application.' });
      return;
    }
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote.' });
  }
});

/** Manager/Admin may extend the ballot deadline before results are revealed. */
apiRouter.post(
  '/loans/:id/extend-vote-deadline',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      const extraHoursRaw = Number(req.body?.additionalHours ?? req.body?.hours ?? 24);
      const additionalHours = Number.isFinite(extraHoursRaw)
        ? Math.min(720, Math.max(1, Math.round(extraHoursRaw)))
        : 24;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;
        if (loan.status !== 'pending_vote' || loan.voteResultRevealed) {
          throw new Error('VOTING_NOT_OPEN');
        }
        const base = loan.voteDeadlineAt
          ? new Date(loan.voteDeadlineAt)
          : new Date();
        // If deadline already passed, extend from now; otherwise from current deadline.
        const from = base.getTime() < Date.now() ? new Date() : base;
        const nextDeadline = new Date(from.getTime() + additionalHours * 60 * 60 * 1000).toISOString();
        loan.voteDeadlineAt = nextDeadline;
        loan.voteDurationHours = (loan.voteDurationHours || 0) + additionalHours;
        updatedLoan = loan;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'LOAN_VOTE_DEADLINE_EXTENDED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} extended ballot deadline on ${loan.id} by ${additionalHours}h (new deadline ${nextDeadline})`,
          payload: {
            loanId: loan.id,
            additionalHours,
            voteDeadlineAt: nextDeadline,
          },
        });
        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan request not found.' });
        return;
      }

      broadcastRealtimeEvent('loan:reviewed', { loanId: id, decision: 'deadline_extended' });
      broadcastRealtimeEvent('audit:updated', {
        action: 'LOAN_VOTE_DEADLINE_EXTENDED',
        resourceType: 'loan',
        resourceId: id,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'VOTING_NOT_OPEN') {
        res.status(409).json({
          error: 'Ballot is not open; deadline can only be extended before results are revealed.',
        });
        return;
      }
      console.error('Extend vote deadline error:', err);
      res.status(500).json({ error: 'Failed to extend voting deadline.' });
    }
  }
);

apiRouter.post(
  '/loans/:id/reveal-vote',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;
      let passed = false;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;
        if (loan.status !== 'pending_vote') {
          throw new Error('VOTING_NOT_OPEN');
        }

        const now = new Date().toISOString();
        const approveCount = loan.votes.filter((v) => v.decision === 'approve').length;
        const rejectCount = loan.votes.filter((v) => v.decision === 'reject').length;
        passed = approveCount >= loan.requiredApprovals;

        loan.voteResultRevealed = true;
        loan.voteResultRevealedAt = now;
        loan.voteResultRevealedBy = viewer.name;

        if (passed) {
          loan.status = 'approved_pending_disbursement';
          loan.approvedAt = now;
        } else {
          loan.status = 'rejected';
        }

        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: passed ? 'loan_approved_confirmation' : 'loan_rejected_notice',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: passed
              ? `Qard Hasan Vote Passed (${approveCount} Approve / ${rejectCount} Reject): ${loan.id}`
              : `Qard Hasan Vote Closed — Not Approved: ${loan.id}`,
            body: passed
              ? `Assalamu Alaikum ${borrower.name}, Manager ${viewer.name} revealed the Qard Hasan vote result for ${loan.id} (${approveCount} approve vs ${rejectCount} reject). Your request is approved and awaiting Manager disbursement confirmation (fund balance will deduct upon confirmation).`
              : `Assalamu Alaikum ${borrower.name}, Manager ${viewer.name} revealed the vote result for ${loan.id} (${approveCount} approve vs ${rejectCount} reject; ${loan.requiredApprovals} required). The request was not approved.`,
            relatedId: loan.id,
          });
        }

        updatedLoan = loan;

        appendAuditLog(draft, {
          actor: viewer,
          action: passed ? 'LOAN_VOTE_REVEALED_APPROVED' : 'LOAN_VOTE_REVEALED_REJECTED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} stopped voting and revealed results for ${loan.id}: ${approveCount} approve, ${rejectCount} reject -> ${loan.status}`,
          payload: {
            loanId: loan.id,
            approveCount,
            rejectCount,
            requiredApprovals: loan.requiredApprovals,
            resultingStatus: loan.status,
          },
        });
        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan request not found.' });
        return;
      }

      broadcastRealtimeEvent('loan:voted', { loanId: id });
      broadcastRealtimeEvent('loan:reviewed', {
        loanId: id,
        borrowerId: (updatedLoan as LoanRequest).borrowerId,
        decision: passed ? 'approve' : 'reject',
      });
      broadcastRealtimeEvent('notification:created', {
        type: passed ? 'loan_approved_confirmation' : 'loan_rejected_notice',
      });
      broadcastRealtimeEvent('audit:updated', {
        action: passed ? 'LOAN_VOTE_REVEALED_APPROVED' : 'LOAN_VOTE_REVEALED_REJECTED',
        resourceType: 'loan',
        resourceId: id,
      });

      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'VOTING_NOT_OPEN') {
        res.status(409).json({ error: 'Voting is not currently open on this loan.' });
        return;
      }
      console.error('Reveal loan vote error:', err);
      res.status(500).json({ error: 'Failed to reveal loan vote results.' });
    }
  }
);

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

        if (viewer.role !== 'admin' && loan.borrowerId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
        if (loan.status !== 'pending_vote' && loan.status !== 'pending_manager_review') {
          throw new Error('ALREADY_REVIEWED');
        }

        const reviewedAt = new Date().toISOString();
        loan.adminDecision = decision === 'approve' ? 'approved' : 'rejected';
        loan.adminReviewedAt = reviewedAt;
        loan.adminReviewedBy = viewer.name;
        loan.adminReviewNote = reviewNote || undefined;
        loan.voteResultRevealed = true;
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
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: Managers cannot approve or decline their own Qard Hasan loan request.',
        });
        return;
      }
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
      if (!(await assertStepUpTotp(req, res))) return;
      const { id } = req.params;
      const viewer = req.authUser!;
      const transactionNumber = String(req.body?.transactionNumber || '').trim();
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        if (viewer.role !== 'admin' && loan.borrowerId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
        if (loan.status !== 'approved_pending_disbursement') {
          throw new Error('NOT_READY_FOR_DISBURSEMENT');
        }

        const overview = buildDashboardOverview(draft, viewer);
        if (loan.amount > overview.treasury.availableLiquidity) {
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
            transactionNumber: transactionNumber || undefined,
          }),
          ...(transactionNumber ? { transactionNumber } : {}),
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
            body: `Assalamu Alaikum ${borrower.name}, ${viewer.name} completed multi-sig treasury disbursement of ${loan.amount} ${draft.fundConfig.currency} for ${loan.id}.${transactionNumber ? ` Transaction Number: ${transactionNumber}.` : ''} Your ${loan.installmentMonths}-month 0% repayment schedule is now active.`,
            relatedId: loan.id,
          });
        }

        updatedLoan = loan;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'LOAN_DISBURSED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} executed multi-sig Qard Hasan disbursement of ${loan.amount} to ${loan.borrowerName}${transactionNumber ? ` (Tx #${transactionNumber})` : ''}`,
          payload: {
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            amount: loan.amount,
            transactionNumber: transactionNumber || undefined,
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
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: Managers cannot execute disbursement on their own loan.',
        });
        return;
      }
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
      const receiptPhotoUrl = String(req.body?.receiptPhotoUrl || '').trim();

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
        inst.receiptPhotoUrl = receiptPhotoUrl || undefined;
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
      const reviewNote = String(req.body?.reviewNote || '').trim();
      if (!Number.isInteger(num) || num < 1) {
        res.status(400).json({ error: 'Installment number must be a positive integer.' });
        return;
      }
      if (rawDecision !== 'approve' && rawDecision !== 'reject') {
        res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
        return;
      }
      const approve = rawDecision === 'approve';
      if (!approve && !reviewNote) {
        res.status(400).json({
          error:
            'A correction note is required when denying an installment payment so the borrower can fix and resubmit.',
        });
        return;
      }
      const viewer = req.authUser!;
      let updatedLoan: LoanRequest | null = null;

      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;

        if (viewer.role !== 'admin' && loan.borrowerId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
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
          inst.rejectionNote = undefined;
          inst.rejectedBy = undefined;
          inst.rejectedAt = undefined;

          loan.totalRepaid =
            Math.round(loan.installments.reduce((s, i) => s + i.paidAmount, 0) * 100) / 100;
          loan.remainingBalance = Math.max(0, Math.round((loan.amount - loan.totalRepaid) * 100) / 100);

          if (loan.remainingBalance <= 0) {
            loan.status = 'repaid';
            loan.completedAt = new Date().toISOString();
          }
        } else {
          const todayUtc = new Date().toISOString().slice(0, 10);
          inst.status = inst.dueDate < todayUtc ? 'overdue' : 'scheduled';
          inst.submittedAt = undefined;
          inst.repaymentChannel = undefined;
          inst.repaymentProvider = undefined;
          inst.maskedReference = undefined;
          inst.receiptPhotoUrl = undefined;
          inst.encryptedReceipt = undefined;
          inst.rejectionNote = reviewNote;
          inst.rejectedBy = viewer.name;
          inst.rejectedAt = new Date().toISOString();
        }

        updatedLoan = loan;

        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          if (approve) {
            queueEmailNotification(draft, {
              type: 'loan_repayment_notice',
              recipientEmail: borrower.email,
              recipientName: borrower.name,
              recipientUserId: borrower.id,
              subject: `Repayment Verified: ${loan.id} Installment #${num}`,
              body: `Assalamu Alaikum ${borrower.name}, installment #${num} (${inst.amount} ${draft.fundConfig.currency}) for ${loan.id} has been verified by ${viewer.name} and added back to the central fund balance. Remaining balance: ${loan.remainingBalance} ${draft.fundConfig.currency}.`,
              relatedId: `${loan.id}#${num}`,
            });
          } else {
            queueEmailNotification(draft, {
              type: 'loan_repayment_rejected',
              recipientEmail: borrower.email,
              recipientName: borrower.name,
              recipientUserId: borrower.id,
              subject: `Installment #${num} Repayment Denied — Action Needed (${loan.id})`,
              body: `Assalamu Alaikum ${borrower.name}, your repayment submission for installment #${num} (${loan.id}) was denied by ${viewer.name}. Correction Note: "${reviewNote}". Please verify your TrxID/account and resubmit.`,
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
            reviewNote: reviewNote || undefined,
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
      broadcastRealtimeEvent('notification:created', {
        type: approve ? 'loan_repayment_notice' : 'loan_repayment_rejected',
      });
      broadcastRealtimeEvent('audit:updated', {
        action: approve ? 'REPAYMENT_VERIFIED' : 'REPAYMENT_REJECTED',
        resourceType: 'repayment',
        resourceId: `${id}#${num}`,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: Managers cannot verify or reject their own loan repayments.',
        });
        return;
      }
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

apiRouter.post('/loans/:id/reschedule', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const requestedMonths = Number(req.body?.requestedMonths);
    const reason = String(req.body?.reason || '').trim();

    if (!Number.isInteger(requestedMonths) || requestedMonths < 1 || requestedMonths > 36) {
      res.status(400).json({ error: 'Requested remaining months must be between 1 and 36.' });
      return;
    }
    if (!reason || reason.length < 6) {
      res.status(400).json({ error: 'Provide a clear reason (at least 6 characters) for rescheduling.' });
      return;
    }

    let updatedLoan: LoanRequest | null = null;
    await updateVaultState((draft) => {
      const loan = draft.loans.find((l) => l.id === id);
      if (!loan) return draft;
      if (loan.borrowerId !== viewer.id && viewer.role === 'member') {
        throw new Error('FORBIDDEN');
      }
      if (loan.status !== 'active' || loan.remainingBalance <= 0) {
        throw new Error('NOT_ACTIVE');
      }
      if (loan.rescheduleRequest?.status === 'pending') {
        throw new Error('ALREADY_PENDING');
      }

      loan.rescheduleRequest = {
        requestedMonths,
        reason,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      };
      updatedLoan = loan;

      const staff = draft.users.filter(
        (u) => (u.role === 'admin' || u.role === 'manager') && u.status === 'active'
      );
      staff.forEach((mgr) => {
        queueEmailNotification(draft, {
          type: 'loan_repayment_notice',
          recipientEmail: mgr.email,
          recipientName: mgr.name,
          recipientUserId: mgr.id,
          subject: `Loan Reschedule Request: ${loan.id} (${viewer.name})`,
          body: `${viewer.name} requested rescheduling remaining balance (${loan.remainingBalance} ${draft.fundConfig.currency}) of ${loan.id} across ${requestedMonths} remaining installments. Reason: "${reason}".`,
          relatedId: loan.id,
        });
      });

      appendAuditLog(draft, {
        actor: viewer,
        action: 'LOAN_RESCHEDULE_REQUESTED',
        resourceType: 'loan',
        resourceId: loan.id,
        summary: `${viewer.name} requested rescheduling ${loan.id} remaining balance over ${requestedMonths} installments`,
        payload: { loanId: loan.id, requestedMonths, remainingBalance: loan.remainingBalance },
      });
      return draft;
    });

    if (!updatedLoan) {
      res.status(404).json({ error: 'Loan not found.' });
      return;
    }

    broadcastRealtimeEvent('loan:reviewed', { loanId: id, decision: 'reschedule_requested' });
    broadcastRealtimeEvent('notification:created', { type: 'loan_repayment_notice' });
    broadcastRealtimeEvent('audit:updated', {
      action: 'LOAN_RESCHEDULE_REQUESTED',
      resourceType: 'loan',
      resourceId: id,
    });
    res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Only the borrower or staff can request rescheduling.' });
      return;
    }
    if (err instanceof Error && err.message === 'NOT_ACTIVE') {
      res.status(409).json({ error: 'Only active loans with remaining balance can be rescheduled.' });
      return;
    }
    if (err instanceof Error && err.message === 'ALREADY_PENDING') {
      res.status(409).json({ error: 'A reschedule request is already awaiting review.' });
      return;
    }
    console.error('Reschedule request error:', err);
    res.status(500).json({ error: 'Failed to submit loan reschedule request.' });
  }
});

apiRouter.patch(
  '/loans/:id/reschedule/review',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
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

      let updatedLoan: LoanRequest | null = null;
      await updateVaultState((draft) => {
        const loan = draft.loans.find((l) => l.id === id);
        if (!loan) return draft;
        if (viewer.role !== 'admin' && loan.borrowerId === viewer.id) {
          throw new Error('CANNOT_SELF_REVIEW');
        }
        if (!loan.rescheduleRequest || loan.rescheduleRequest.status !== 'pending') {
          throw new Error('NO_PENDING_RESCHEDULE');
        }

        const reviewedAt = new Date().toISOString();
        loan.rescheduleRequest.status = decision === 'approve' ? 'approved' : 'rejected';
        loan.rescheduleRequest.reviewedBy = viewer.name;
        loan.rescheduleRequest.reviewedAt = reviewedAt;
        loan.rescheduleRequest.reviewNote = reviewNote || undefined;

        if (decision === 'approve') {
          const settledOrPending = loan.installments.filter(
            (i) => i.status === 'paid' || i.status === 'pending_verification'
          );
          const allocatedSoFar = settledOrPending.reduce(
            (sum, i) => sum + (i.status === 'paid' ? i.paidAmount : i.amount),
            0
          );
          const remainingToSchedule = Math.max(
            0,
            Math.round((loan.amount - allocatedSoFar) * 100) / 100
          );
          const newCount = loan.rescheduleRequest.requestedMonths;
          const base = Math.floor((remainingToSchedule / newCount) * 100) / 100;
          const anchor = new Date();

          const newInstallments: InstallmentItem[] = Array.from({ length: newCount }, (_, idx) => {
            const isLast = idx === newCount - 1;
            const amt = isLast
              ? Math.round((remainingToSchedule - base * (newCount - 1)) * 100) / 100
              : base;
            return {
              installmentNumber: settledOrPending.length + idx + 1,
              dueDate: computeInstallmentDueDate(anchor, idx + 1),
              amount: amt,
              paidAmount: 0,
              status: 'scheduled',
            };
          });

          loan.installments = [...settledOrPending, ...newInstallments];
          loan.installmentMonths = loan.installments.length;
          loan.monthlyInstallment = base;
        }

        updatedLoan = loan;

        const borrower = draft.users.find((u) => u.id === loan.borrowerId);
        if (borrower) {
          queueEmailNotification(draft, {
            type: 'loan_repayment_notice',
            recipientEmail: borrower.email,
            recipientName: borrower.name,
            recipientUserId: borrower.id,
            subject: `Loan Reschedule ${decision === 'approve' ? 'Approved' : 'Declined'}: ${loan.id}`,
            body:
              decision === 'approve'
                ? `Assalamu Alaikum ${borrower.name}, ${viewer.name} approved rescheduling ${loan.id} across ${loan.rescheduleRequest.requestedMonths} remaining monthly installments.`
                : `Assalamu Alaikum ${borrower.name}, ${viewer.name} declined the reschedule request for ${loan.id}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
            relatedId: loan.id,
          });
        }

        appendAuditLog(draft, {
          actor: viewer,
          action: decision === 'approve' ? 'LOAN_RESCHEDULE_APPROVED' : 'LOAN_RESCHEDULE_REJECTED',
          resourceType: 'loan',
          resourceId: loan.id,
          summary: `${viewer.name} ${decision === 'approve' ? 'approved' : 'declined'} reschedule request for ${loan.id}`,
          payload: {
            loanId: loan.id,
            decision,
            requestedMonths: loan.rescheduleRequest.requestedMonths,
            reviewNote: reviewNote || undefined,
          },
        });
        return draft;
      });

      if (!updatedLoan) {
        res.status(404).json({ error: 'Loan not found.' });
        return;
      }

      broadcastRealtimeEvent('loan:reviewed', { loanId: id, decision: `reschedule_${decision}` });
      broadcastRealtimeEvent('notification:created', { type: 'loan_repayment_notice' });
      broadcastRealtimeEvent('audit:updated', {
        action: decision === 'approve' ? 'LOAN_RESCHEDULE_APPROVED' : 'LOAN_RESCHEDULE_REJECTED',
        resourceType: 'loan',
        resourceId: id,
      });
      res.json({ loan: hydrateLoanForViewer(updatedLoan, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'CANNOT_SELF_REVIEW') {
        res.status(403).json({
          error: 'Governance rule: Managers cannot approve or decline their own loan reschedule request.',
        });
        return;
      }
      if (err instanceof Error && err.message === 'NO_PENDING_RESCHEDULE') {
        res.status(409).json({ error: 'No pending reschedule request exists on this loan.' });
        return;
      }
      console.error('Review reschedule error:', err);
      res.status(500).json({ error: 'Failed to review loan reschedule request.' });
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
          voteResultRevealed: false,
          proposedBy: viewer.name,
        };

        draft.halalProjects.unshift(project);
        appendAuditLog(draft, {
          actor: viewer,
          action: 'HALAL_PROJECT_PROPOSED',
          resourceType: 'halal_project',
          resourceId: project.id,
          summary: `${viewer.name} proposed investment placement "${title}" (${shariahStructure}) for secret member ballot`,
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
    if (viewer.role === 'admin') {
      res.status(403).json({
        error: 'Administrator accounts inspect audit ballots only and do not cast member votes.',
      });
      return;
    }
    let updatedProject: HalalProject | null = null;

    await updateVaultState((draft) => {
      const project = draft.halalProjects.find((p) => p.id === id);
      if (!project) return draft;

      if (project.votingStatus !== 'open' || project.voteResultRevealed) {
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
      project.voteResultRevealed = false;
      updatedProject = project;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'INVESTMENT_VOTE_CAST',
        resourceType: 'vote',
        resourceId: project.id,
        summary: `An anonymized verified ballot was recorded on Halal project "${project.title}" (${project.votes.length} total ballots)`,
        payload: {
          projectId: project.id,
          decision,
          totalVotesCast: project.votes.length,
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

apiRouter.post(
  '/halal-projects/:id/reveal',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      let updatedProject: HalalProject | null = null;

      await updateVaultState((draft) => {
        const project = draft.halalProjects.find((p) => p.id === id);
        if (!project) return draft;
        if (project.votingStatus !== 'open') {
          throw new Error('PLACEMENT_VOTING_CLOSED');
        }

        const now = new Date().toISOString();
        const yesCount = project.votes.filter((v) => v.decision === 'yes').length;
        const noCount = project.votes.filter((v) => v.decision === 'no').length;
        const passed = yesCount >= project.requiredApprovals;

        project.voteResultRevealed = true;
        project.revealedAt = now;
        project.revealedBy = viewer.name;
        if (passed) {
          project.votingStatus = 'approved';
          project.status = 'vetted';
          project.approvedAt = now;
        } else {
          project.votingStatus = 'rejected';
        }
        updatedProject = project;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'HALAL_PROJECT_VOTE_REVEALED',
          resourceType: 'halal_project',
          resourceId: project.id,
          summary: `${viewer.name} stopped voting and revealed results for "${project.title}": ${yesCount} yes, ${noCount} no -> ${project.votingStatus}`,
          payload: {
            projectId: project.id,
            yesCount,
            noCount,
            votingStatus: project.votingStatus,
          },
        });
        return draft;
      });

      if (!updatedProject) {
        res.status(404).json({ error: 'Halal investment project not found.' });
        return;
      }

      broadcastRealtimeEvent('investment:voted', { projectId: id });
      broadcastRealtimeEvent('audit:updated', {
        action: 'HALAL_PROJECT_VOTE_REVEALED',
        resourceType: 'halal_project',
        resourceId: id,
      });
      res.json({ project: hydrateHalalProjectForViewer(updatedProject, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'PLACEMENT_VOTING_CLOSED') {
        res.status(409).json({ error: 'Voting is already closed on this Halal project.' });
        return;
      }
      console.error('Reveal halal vote error:', err);
      res.status(500).json({ error: 'Failed to reveal Halal project vote results.' });
    }
  }
);

apiRouter.post(
  '/halal-projects/:id/distribute',
  requireAuth,
  requireRole(['admin', 'manager']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      const periodLabel = String(req.body?.periodLabel || '').trim();
      const realizedProfit = Number(req.body?.realizedProfit);
      const coopSharePct = Number(req.body?.coopSharePct ?? 70);

      if (!periodLabel || periodLabel.length < 2) {
        res.status(400).json({ error: 'Provide a distribution period label (e.g. Q1 2029).' });
        return;
      }
      if (!Number.isFinite(realizedProfit) || realizedProfit <= 0) {
        res.status(400).json({ error: 'Realized profit must be greater than zero.' });
        return;
      }
      if (!Number.isFinite(coopSharePct) || coopSharePct <= 0 || coopSharePct > 100) {
        res.status(400).json({ error: 'Cooperative share percentage must be between 1 and 100.' });
        return;
      }

      let updatedProject: HalalProject | null = null;
      await updateVaultState((draft) => {
        const project = draft.halalProjects.find((p) => p.id === id);
        if (!project) return draft;
        if (project.votingStatus !== 'approved' && project.status === 'proposed') {
          throw new Error('PROJECT_NOT_VETTED');
        }

        const activeUsers = draft.users.filter((u) => u.status === 'active');
        const approvedContribs = draft.contributions.filter((c) => c.status === 'approved');
        const userTotals = activeUsers.map((u) => ({
          user: u,
          contributed: approvedContribs
            .filter((c) => c.userId === u.id)
            .reduce((sum, c) => sum + c.amount, 0),
        }));

        const totalCapitalWeight = userTotals.reduce((s, item) => s + item.contributed, 0);
        const distributablePool =
          Math.round(realizedProfit * (coopSharePct / 100) * 100) / 100;

        let allocations: ProfitDistributionAllocation[] = [];
        if (totalCapitalWeight > 0) {
          allocations = userTotals
            .filter((item) => item.contributed > 0)
            .map((item) => {
              const weight = item.contributed / totalCapitalWeight;
              return {
                userId: item.user.id,
                memberName: item.user.name,
                memberCode: item.user.memberCode,
                contributionWeightPct: Math.round(weight * 10000) / 100,
                payoutAmount: Math.round(distributablePool * weight * 100) / 100,
              };
            })
            .sort((a, b) => b.payoutAmount - a.payoutAmount);
        } else if (activeUsers.length > 0) {
          const equalWeight = 1 / activeUsers.length;
          allocations = activeUsers.map((u) => ({
            userId: u.id,
            memberName: u.name,
            memberCode: u.memberCode,
            contributionWeightPct: Math.round(equalWeight * 10000) / 100,
            payoutAmount: Math.round(distributablePool * equalWeight * 100) / 100,
          }));
        }

        // Reconcile rounding remainder on top recipient
        if (allocations.length > 0) {
          const allocatedSum = allocations.reduce((s, a) => s + a.payoutAmount, 0);
          const diff = Math.round((distributablePool - allocatedSum) * 100) / 100;
          allocations[0].payoutAmount = Math.round((allocations[0].payoutAmount + diff) * 100) / 100;
        }

        const record: ProfitDistributionRecord = {
          id: `dist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          periodLabel,
          realizedProfit,
          coopSharePct,
          distributablePool,
          distributedAt: new Date().toISOString(),
          distributedBy: viewer.name,
          allocations,
        };

        project.distributions = Array.isArray(project.distributions) ? project.distributions : [];
        project.distributions.unshift(record);
        project.realizedProfitTotal =
          Math.round(((project.realizedProfitTotal || 0) + distributablePool) * 100) / 100;
        project.status = 'active_post_maturity';
        updatedProject = project;

        allocations.forEach((alloc) => {
          const member = draft.users.find((u) => u.id === alloc.userId);
          if (member) {
            queueEmailNotification(draft, {
              type: 'profit_distribution_notice',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Halal Profit Distribution (${periodLabel}): ${alloc.payoutAmount} ${draft.fundConfig.currency}`,
              body: `Assalamu Alaikum ${member.name}, your cooperative dividend share of ${alloc.payoutAmount} ${draft.fundConfig.currency} (${alloc.contributionWeightPct}% weight) from "${project.title}" (${periodLabel}) has been recorded.`,
              relatedId: project.id,
            });
          }
        });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'HALAL_PROFIT_DISTRIBUTED',
          resourceType: 'halal_project',
          resourceId: project.id,
          summary: `${viewer.name} distributed ${distributablePool} ${draft.fundConfig.currency} (${periodLabel}) from "${project.title}" across ${allocations.length} member(s)`,
          payload: {
            projectId: project.id,
            periodLabel,
            realizedProfit,
            coopSharePct,
            distributablePool,
            recipientsCount: allocations.length,
          },
        });
        return draft;
      });

      if (!updatedProject) {
        res.status(404).json({ error: 'Halal investment project not found.' });
        return;
      }

      broadcastRealtimeEvent('investment:voted', { projectId: id });
      broadcastRealtimeEvent('notification:created', { type: 'profit_distribution_notice' });
      broadcastRealtimeEvent('audit:updated', {
        action: 'HALAL_PROFIT_DISTRIBUTED',
        resourceType: 'halal_project',
        resourceId: id,
      });
      res.json({ project: hydrateHalalProjectForViewer(updatedProject, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'PROJECT_NOT_VETTED') {
        res.status(409).json({
          error: 'Halal investment placement must pass 2/3 member approval before distributing profit.',
        });
        return;
      }
      console.error('Profit distribution error:', err);
      res.status(500).json({ error: 'Failed to distribute Halal project profits.' });
    }
  }
);

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

apiRouter.get('/members/:id/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const memberId = String(req.params.id || '').trim();
    if (!memberId) {
      res.status(400).json({ error: 'Member ID is required.' });
      return;
    }

    const state = await loadVaultState();
    const profile = buildMemberPublicProfile(state, memberId, req.authUser!);
    if (!profile) {
      res.status(404).json({ error: 'Verified member profile not found.' });
      return;
    }

    res.json({ profile });
  } catch (err) {
    console.error('Member public profile error:', err);
    res.status(500).json({ error: 'Failed to load member profile.' });
  }
});

apiRouter.get('/manager-cycle', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const schedule = buildManagerCycleSchedule(state);
    res.json({ schedule });
  } catch (err) {
    console.error('Manager cycle error:', err);
    res.status(500).json({ error: 'Failed to build manager rotation schedule.' });
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
      if (!(await assertStepUpTotp(req, res))) return;
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

        const prevName = user.name;
        const prevEmail = user.email;
        const prevStatus = user.status;
        const prevRole = user.role;
        const changes: Record<string, { from: unknown; to: unknown }> = {};

        if (email && email !== user.email.toLowerCase()) {
          if (draft.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) {
            throw new Error('EMAIL_IN_USE');
          }
          changes.email = { from: prevEmail, to: email };
          user.email = email;
        }
        if (name && name !== prevName) {
          changes.name = { from: prevName, to: name };
          user.name = name;
        }
        if (newPassword && newPassword.length >= 6) {
          user.passwordHash = bcrypt.hashSync(newPassword, 10);
          changes.password = { from: '[redacted]', to: '[updated]' };
        }

        if (role && ['admin', 'manager', 'member'].includes(role) && role !== prevRole) {
          changes.role = { from: prevRole, to: role };
          user.role = role;
        }
        if (
          status &&
          ['pending_approval', 'active', 'suspended'].includes(status) &&
          status !== prevStatus
        ) {
          changes.status = { from: prevStatus, to: status };
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
          if (mobile !== undefined && mobile !== details.mobile) {
            changes.mobile = {
              from: maskReference(details.mobile || ''),
              to: maskReference(mobile),
            };
            details.mobile = mobile;
            user.phoneMasked = mobile ? maskReference(mobile) : undefined;
          }
          if (occupation !== undefined && occupation !== details.occupation) {
            changes.occupation = { from: details.occupation, to: occupation };
            details.occupation = occupation;
          }
          if (
            companyOrganization !== undefined &&
            companyOrganization !== details.companyOrganization
          ) {
            changes.companyOrganization = {
              from: details.companyOrganization,
              to: companyOrganization,
            };
            details.companyOrganization = companyOrganization;
          }
          if (presentAddress !== undefined && presentAddress !== details.presentAddress) {
            changes.presentAddress = { from: '[updated]', to: presentAddress };
            details.presentAddress = presentAddress;
          }
          if (permanentAddress !== undefined && permanentAddress !== details.permanentAddress) {
            changes.permanentAddress = { from: '[updated]', to: permanentAddress };
            details.permanentAddress = permanentAddress;
          }
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
            targetMemberCode: user.memberCode,
            targetName: user.name,
            previousRole: prevRole,
            role: user.role,
            previousStatus: prevStatus,
            status: user.status,
            ...(Object.keys(changes).length > 0 ? { changes } : {}),
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
      if (!(await assertStepUpTotp(req, res))) return;
      const id = String(req.params.id || '');
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
      if (!(await assertStepUpTotp(req, res))) return;
      const viewer = req.authUser!;
      const body = req.body as Partial<FundConfig>;

      const maxLoansPerYear = Number(body.maxLoansPerYear);
      const monthlyContributionAmount = Number(body.monthlyContributionAmount);
      const maxLoanAmount = Number(body.maxLoanAmount);
      const maxInstallmentMonths = Number(body.maxInstallmentMonths);
      const guarantorThresholdAmount = Number(body.guarantorThresholdAmount);
      const requiredGuarantorsCount = Number(body.requiredGuarantorsCount);
      const managerCycleMonths = Number(body.managerCycleMonths);

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
        body.guarantorThresholdAmount !== undefined &&
        (!Number.isFinite(guarantorThresholdAmount) || guarantorThresholdAmount < 0)
      ) {
        res.status(400).json({ error: 'Guarantor threshold amount cannot be negative.' });
        return;
      }
      if (
        body.requiredGuarantorsCount !== undefined &&
        (!Number.isInteger(requiredGuarantorsCount) ||
          requiredGuarantorsCount < 0 ||
          requiredGuarantorsCount > 5)
      ) {
        res.status(400).json({ error: 'Required guarantors count must be between 0 and 5.' });
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
      if (
        body.managerCycleMonths !== undefined &&
        (!Number.isInteger(managerCycleMonths) ||
          managerCycleMonths < 1 ||
          managerCycleMonths > 36)
      ) {
        res
          .status(400)
          .json({ error: 'Manager cycle duration must be an integer between 1 and 36 months.' });
        return;
      }
      if (body.managerCycleStartDate !== undefined) {
        const parsedStart = Date.parse(`${body.managerCycleStartDate}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(body.managerCycleStartDate) ||
          Number.isNaN(parsedStart)
        ) {
          res
            .status(400)
            .json({ error: 'Manager cycle start date must be a valid YYYY-MM-DD date.' });
          return;
        }
      }

      const nextState = await updateVaultState((draft) => {
        const cfg = draft.fundConfig;
        const changes: Record<string, { from: unknown; to: unknown }> = {};

        if (typeof body.fundName === 'string' && body.fundName.trim()) {
          const nextName = body.fundName.trim();
          if (nextName !== cfg.fundName) {
            changes.fundName = { from: cfg.fundName, to: nextName };
            cfg.fundName = nextName;
          }
        }
        if (body.currency && body.currency !== cfg.currency) {
          changes.currency = { from: cfg.currency, to: body.currency };
          cfg.currency = body.currency;
        }
        if (
          body.monthlyContributionAmount !== undefined &&
          monthlyContributionAmount !== cfg.monthlyContributionAmount
        ) {
          changes.monthlyContributionAmount = {
            from: cfg.monthlyContributionAmount,
            to: monthlyContributionAmount,
          };
          cfg.monthlyContributionAmount = monthlyContributionAmount;
        }
        if (body.maxLoansPerYear !== undefined && maxLoansPerYear !== cfg.maxLoansPerYear) {
          changes.maxLoansPerYear = { from: cfg.maxLoansPerYear, to: maxLoansPerYear };
          cfg.maxLoansPerYear = maxLoansPerYear;
        }
        if (body.maxLoanAmount !== undefined && maxLoanAmount !== cfg.maxLoanAmount) {
          changes.maxLoanAmount = { from: cfg.maxLoanAmount, to: maxLoanAmount };
          cfg.maxLoanAmount = maxLoanAmount;
        }
        if (
          body.maxInstallmentMonths !== undefined &&
          maxInstallmentMonths !== cfg.maxInstallmentMonths
        ) {
          changes.maxInstallmentMonths = {
            from: cfg.maxInstallmentMonths,
            to: maxInstallmentMonths,
          };
          cfg.maxInstallmentMonths = maxInstallmentMonths;
        }
        if (
          body.guarantorThresholdAmount !== undefined &&
          guarantorThresholdAmount !== cfg.guarantorThresholdAmount
        ) {
          changes.guarantorThresholdAmount = {
            from: cfg.guarantorThresholdAmount ?? 40000,
            to: guarantorThresholdAmount,
          };
          cfg.guarantorThresholdAmount = guarantorThresholdAmount;
        }
        if (
          body.requiredGuarantorsCount !== undefined &&
          requiredGuarantorsCount !== cfg.requiredGuarantorsCount
        ) {
          changes.requiredGuarantorsCount = {
            from: cfg.requiredGuarantorsCount ?? 1,
            to: requiredGuarantorsCount,
          };
          cfg.requiredGuarantorsCount = requiredGuarantorsCount;
        }
        if (body.maturityDate !== undefined && body.maturityDate !== cfg.maturityDate) {
          changes.maturityDate = { from: cfg.maturityDate, to: body.maturityDate };
          cfg.maturityDate = body.maturityDate;
        }
        if (
          body.managerCycleMonths !== undefined &&
          managerCycleMonths !== cfg.managerCycleMonths
        ) {
          changes.managerCycleMonths = {
            from: cfg.managerCycleMonths ?? 3,
            to: managerCycleMonths,
          };
          cfg.managerCycleMonths = managerCycleMonths;
        }
        if (
          body.managerCycleStartDate !== undefined &&
          body.managerCycleStartDate !== cfg.managerCycleStartDate
        ) {
          changes.managerCycleStartDate = {
            from: cfg.managerCycleStartDate ?? '2026-01-01',
            to: body.managerCycleStartDate,
          };
          cfg.managerCycleStartDate = body.managerCycleStartDate;
        }
        if (typeof body.halalInvestmentThesis === 'string' && body.halalInvestmentThesis.trim()) {
          const nextThesis = body.halalInvestmentThesis.trim();
          if (nextThesis !== cfg.halalInvestmentThesis) {
            changes.halalInvestmentThesis = {
              from: cfg.halalInvestmentThesis,
              to: nextThesis,
            };
            cfg.halalInvestmentThesis = nextThesis;
          }
        }
        if (typeof body.autoSyncSheet === 'boolean' && body.autoSyncSheet !== cfg.autoSyncSheet) {
          changes.autoSyncSheet = { from: Boolean(cfg.autoSyncSheet), to: body.autoSyncSheet };
          cfg.autoSyncSheet = body.autoSyncSheet;
        }
        if (
          body.maxMembersCap !== undefined &&
          Number.isInteger(Number(body.maxMembersCap)) &&
          Number(body.maxMembersCap) >= 1 &&
          Number(body.maxMembersCap) <= 500
        ) {
          const nextVal = Number(body.maxMembersCap);
          if (nextVal !== cfg.maxMembersCap) {
            changes.maxMembersCap = { from: cfg.maxMembersCap ?? 20, to: nextVal };
            cfg.maxMembersCap = nextVal;
          }
        }
        if (
          body.loanSavingsCapPct !== undefined &&
          Number.isFinite(Number(body.loanSavingsCapPct)) &&
          Number(body.loanSavingsCapPct) >= 0 &&
          Number(body.loanSavingsCapPct) <= 100
        ) {
          const nextVal = Number(body.loanSavingsCapPct);
          if (nextVal !== cfg.loanSavingsCapPct) {
            changes.loanSavingsCapPct = { from: cfg.loanSavingsCapPct ?? 75, to: nextVal };
            cfg.loanSavingsCapPct = nextVal;
          }
        }
        if (
          body.monthlyDueDay !== undefined &&
          Number.isInteger(Number(body.monthlyDueDay)) &&
          Number(body.monthlyDueDay) >= 1 &&
          Number(body.monthlyDueDay) <= 28
        ) {
          const nextVal = Number(body.monthlyDueDay);
          if (nextVal !== cfg.monthlyDueDay) {
            changes.monthlyDueDay = { from: cfg.monthlyDueDay ?? 10, to: nextVal };
            cfg.monthlyDueDay = nextVal;
          }
        }
        if (
          body.lateFeeAmount !== undefined &&
          Number.isFinite(Number(body.lateFeeAmount)) &&
          Number(body.lateFeeAmount) >= 0
        ) {
          const nextVal = Number(body.lateFeeAmount);
          if (nextVal !== cfg.lateFeeAmount) {
            changes.lateFeeAmount = { from: cfg.lateFeeAmount ?? 50, to: nextVal };
            cfg.lateFeeAmount = nextVal;
          }
        }
        if (
          body.registrationFeeAmount !== undefined &&
          Number.isFinite(Number(body.registrationFeeAmount)) &&
          Number(body.registrationFeeAmount) >= 0
        ) {
          const nextVal = Number(body.registrationFeeAmount);
          if (nextVal !== cfg.registrationFeeAmount) {
            changes.registrationFeeAmount = { from: cfg.registrationFeeAmount ?? 200, to: nextVal };
            cfg.registrationFeeAmount = nextVal;
          }
        }
        if (typeof body.membershipIntakeDeadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.membershipIntakeDeadline)) {
          if (body.membershipIntakeDeadline !== cfg.membershipIntakeDeadline) {
            changes.membershipIntakeDeadline = {
              from: cfg.membershipIntakeDeadline ?? '2027-07-31',
              to: body.membershipIntakeDeadline,
            };
            cfg.membershipIntakeDeadline = body.membershipIntakeDeadline;
          }
        }
        if (typeof body.googleSheetId === 'string') {
          const trimmedId = body.googleSheetId.trim();
          if ((trimmedId || undefined) !== cfg.googleSheetId) {
            changes.googleSheetId = { from: cfg.googleSheetId || null, to: trimmedId || null };
          }
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
          summary: `${viewer.name} updated cooperative policy (max ${cfg.maxLoansPerYear} loans/year, maturity ${cfg.maturityDate}, manager cycle ${cfg.managerCycleMonths ?? 3}m)`,
          payload: {
            maxLoansPerYear: cfg.maxLoansPerYear,
            maturityDate: cfg.maturityDate,
            managerCycleMonths: cfg.managerCycleMonths ?? 3,
            managerCycleStartDate: cfg.managerCycleStartDate ?? '2026-01-01',
            monthlyContributionAmount: cfg.monthlyContributionAmount,
            maxLoanAmount: cfg.maxLoanAmount,
            guarantorThresholdAmount: cfg.guarantorThresholdAmount,
            requiredGuarantorsCount: cfg.requiredGuarantorsCount,
            currency: cfg.currency,
            autoSyncSheet: cfg.autoSyncSheet,
            ...(Object.keys(changes).length > 0 ? { changes } : {}),
          },
        });

        return draft;
      });

      broadcastRealtimeEvent('config:updated', {
        maxLoansPerYear: nextState.fundConfig.maxLoansPerYear,
        maturityDate: nextState.fundConfig.maturityDate,
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

apiRouter.post(
  '/admin/constitution',
  requireAuth,
  requireRole(['admin']),
  uploadRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await assertStepUpTotp(req, res))) return;
      const viewer = req.authUser!;
      const rawData = String(req.body?.fileBase64 || req.body?.pdfBase64 || '').trim();
      const rawTitle = String(
        req.body?.title || req.body?.name || 'cooperative-constitution'
      ).trim();

      const currentState = await loadVaultState();
      let decoded: ReturnType<typeof validateAndDecodeUpload>;
      try {
        decoded = validateAndDecodeUpload({
          rawData,
          rawName: rawTitle,
          category: 'cooperative-constitution',
          subject:
            rawTitle !== 'cooperative-constitution'
              ? rawTitle
              : currentState.fundConfig.fundName,
          fallbackMimeType: 'application/pdf',
        });
      } catch (validationErr) {
        res.status(400).json({
          error:
            validationErr instanceof Error
              ? validationErr.message
              : 'Invalid Constitution PDF payload.',
        });
        return;
      }

      if (!decoded.isPdf) {
        res.status(400).json({
          error: 'Official Cooperative Constitution must be uploaded as a valid PDF document.',
        });
        return;
      }

      let storedUrl = '';
      let provider: 'imagekit' | 'local_vault' = 'local_vault';
      const imagekitConfig = getImageKitConfig();
      if (imagekitConfig) {
        const uploaded = await uploadToImageKit({
          fileName: decoded.filename,
          base64Payload: decoded.base64Payload,
          mimeType: decoded.mimeType,
          category: 'cooperative-constitution',
          config: imagekitConfig,
        });
        storedUrl = uploaded.url;
        provider = uploaded.provider;
      } else {
        if (!fs.existsSync(UPLOADS_DIR)) {
          fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        fs.writeFileSync(path.join(UPLOADS_DIR, decoded.filename), decoded.buffer);
        storedUrl = `/api/uploads/${decoded.filename}`;
      }

      const uploadedAt = new Date().toISOString();
      const nextState = await updateVaultState((draft) => {
        const cfg = draft.fundConfig;
        const previousName = cfg.constitutionPdfName || null;
        cfg.constitutionPdfUrl = storedUrl;
        cfg.constitutionPdfName = decoded.filename;
        cfg.constitutionUploadedAt = uploadedAt;
        cfg.constitutionUploadedBy = viewer.name;
        cfg.updatedAt = uploadedAt;
        cfg.updatedBy = viewer.name;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'CONSTITUTION_PDF_UPDATED',
          resourceType: 'config',
          resourceId: cfg.id,
          summary: `${viewer.name} uploaded cooperative Constitution PDF (${decoded.filename})`,
          payload: {
            constitutionPdfName: decoded.filename,
            constitutionPdfUrl: storedUrl,
            provider,
            sizeBytes: decoded.buffer.length,
            previousConstitutionPdfName: previousName,
          },
        });
        return draft;
      });

      broadcastRealtimeEvent('config:updated', {
        constitutionPdfUrl: storedUrl,
        constitutionPdfName: decoded.filename,
      });
      broadcastRealtimeEvent('audit:updated', {
        action: 'CONSTITUTION_PDF_UPDATED',
        resourceType: 'config',
        resourceId: nextState.fundConfig.id,
      });

      res.json({
        config: nextState.fundConfig,
        constitutionPdfUrl: storedUrl,
        constitutionPdfName: decoded.filename,
        provider,
      });
    } catch (err) {
      console.error('Constitution upload error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to upload Constitution PDF.',
      });
    }
  }
);

apiRouter.delete(
  '/admin/constitution',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await assertStepUpTotp(req, res))) return;
      const viewer = req.authUser!;
      const now = new Date().toISOString();

      const nextState = await updateVaultState((draft) => {
        const cfg = draft.fundConfig;
        const previousName = cfg.constitutionPdfName || null;
        cfg.constitutionPdfUrl = undefined;
        cfg.constitutionPdfName = undefined;
        cfg.constitutionUploadedAt = undefined;
        cfg.constitutionUploadedBy = undefined;
        cfg.updatedAt = now;
        cfg.updatedBy = viewer.name;

        appendAuditLog(draft, {
          actor: viewer,
          action: 'CONSTITUTION_PDF_REMOVED',
          resourceType: 'config',
          resourceId: cfg.id,
          summary: `${viewer.name} removed the cooperative Constitution PDF (${previousName || 'unlisted'})`,
          payload: { previousConstitutionPdfName: previousName },
        });
        return draft;
      });

      broadcastRealtimeEvent('config:updated', {
        constitutionPdfUrl: null,
        constitutionPdfName: null,
      });
      broadcastRealtimeEvent('audit:updated', {
        action: 'CONSTITUTION_PDF_REMOVED',
        resourceType: 'config',
        resourceId: nextState.fundConfig.id,
      });

      res.json({ config: nextState.fundConfig });
    } catch (err) {
      console.error('Constitution delete error:', err);
      res.status(500).json({ error: 'Failed to remove Constitution PDF.' });
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
      const rawLogs = state.auditLogs;
      const brokenLinks: string[] = [];

      const logs = rawLogs.map((entry, idx) => {
        let decryptedPayload: Record<string, unknown> | undefined;
        try {
          decryptedPayload = decryptSensitiveObject<Record<string, unknown>>(entry.encryptedPayload);
        } catch {
          decryptedPayload = undefined;
        }

        const expectedHash = decryptedPayload
          ? computeSha256Hash({
              id: entry.id,
              timestamp: entry.timestamp,
              actorId: entry.actorId,
              action: entry.action,
              resourceId: entry.resourceId,
              prevHash: entry.prevHash,
              payload: decryptedPayload,
            })
          : null;

        const hashVerified = Boolean(expectedHash && expectedHash === entry.entryHash);
        const chainLinkVerified =
          idx < rawLogs.length - 1
            ? entry.prevHash === rawLogs[idx + 1].entryHash
            : entry.prevHash === '0000000000000000000000000000000000000000000000000000000000000000' ||
              Boolean(entry.prevHash);

        if (!hashVerified || !chainLinkVerified) {
          brokenLinks.push(entry.id);
        }

        if (
          entry.action === 'LOAN_VOTE_CAST' ||
          entry.action === 'INVESTMENT_VOTE_CAST' ||
          entry.action === 'DECISION_POLL_VOTE_CAST'
        ) {
          return {
            ...entry,
            actorId: 'anon-ballot',
            actorName: 'Anonymized Verified Member',
            actorRole: 'member' as UserRole,
            summary: entry.summary.includes('anonymized')
              ? entry.summary
              : `Anonymized ballot recorded (${entry.resourceId})`,
            decryptedPayload,
            hashVerified,
            chainLinkVerified,
          };
        }
        return {
          ...entry,
          decryptedPayload,
          hashVerified,
          chainLinkVerified,
        };
      });

      const chainValid = brokenLinks.length === 0;
      const verifiedEntries = logs.filter((l) => l.hashVerified && l.chainLinkVerified).length;

      res.json({
        logs,
        chainValid,
        integrity: {
          totalEntries: logs.length,
          verifiedEntries,
          brokenLinks,
        },
      });
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
            'Transaction Number',
            'Masked Reference',
            'Status',
            'Submitted At',
            'Reviewed By',
            'Entry Hash',
          ],
          ...state.contributions.map((c) => {
            const hydrated = hydrateContributionForViewer(c, viewer);
            return [
              c.id,
              c.memberCode,
              c.memberName,
              c.billingMonth,
              c.amount,
              c.channel.toUpperCase(),
              c.providerName,
              hydrated.decryptedDetails?.referenceId || c.maskedReference,
              c.maskedReference,
              c.status,
              c.submittedAt,
              c.reviewerName || '',
              c.entryHash,
            ];
          }),
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
            'Disbursement Transaction Number',
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
            l.disbursementSignature?.transactionNumber || '',
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
        const scope = String(req.query?.scope || 'all');
        const adminOnlyActions = new Set([
          'FUND_CONFIG_INITIALIZED',
          'FUND_POLICY_UPDATED',
          'MEMBER_SIGNUP_APPROVED',
          'MEMBER_SIGNUP_REJECTED',
          'MEMBER_CREATED_BY_ADMIN',
          'MEMBER_SUSPENDED',
          'MEMBER_REACTIVATED',
          'MEMBER_REMOVED_BY_ADMIN',
          'MEMBER_RBAC_UPDATED',
          'CONTRIBUTION_APPROVED',
          'CONTRIBUTION_REJECTED',
          'LOAN_ADMIN_APPROVED',
          'LOAN_ADMIN_REJECTED',
          'LOAN_DISBURSED',
          'LOAN_RESCHEDULE_APPROVED',
          'LOAN_RESCHEDULE_REJECTED',
          'REPAYMENT_VERIFIED',
          'REPAYMENT_REJECTED',
          'HALAL_PROJECT_PROPOSED',
          'HALAL_PROJECT_CREATED',
          'HALAL_PROFIT_DISTRIBUTED',
          'COMMUNITY_POST_DELETED_BY_ADMIN',
          'COMMUNITY_COMMENT_DELETED_BY_ADMIN',
          'COMMUNITY_POST_PIN',
          'COMMUNITY_POST_UNPIN',
          'COMMUNITY_POST_LOCK',
          'COMMUNITY_POST_UNLOCK',
          'COMMUNITY_POST_HIDE',
          'COMMUNITY_POST_RESTORE',
          'COMMUNITY_MEMBER_MUTED',
          'COMMUNITY_MEMBER_UNMUTED',
          'GOOGLE_SHEET_SYNCED',
          'GMAIL_NOTIFICATIONS_DISPATCHED',
          'REMINDER_BATCH_GENERATED',
          'REPORT_EXPORTED',
        ]);
        const targetLogs =
          scope === 'admin'
            ? state.auditLogs.filter(
                (a) =>
                  a.actorRole === 'admin' ||
                  a.actorRole === 'manager' ||
                  adminOnlyActions.has(a.action)
              )
            : state.auditLogs;
        const rows = [
          [
            'Audit ID',
            'Timestamp',
            'Actor',
            'Role',
            'Action',
            'Resource Type',
            'Resource ID',
            'Summary',
            'Previous Hash',
            'Entry SHA-256 Hash',
          ],
          ...targetLogs.map((a) => {
            const isVote =
              a.action === 'LOAN_VOTE_CAST' ||
              a.action === 'INVESTMENT_VOTE_CAST' ||
              a.action === 'DECISION_POLL_VOTE_CAST';
            return [
              a.id,
              a.timestamp,
              isVote ? 'Anonymized Verified Member' : a.actorName,
              isVote ? 'member' : a.actorRole,
              a.action,
              a.resourceType,
              a.resourceId,
              isVote && !a.summary.includes('anonymized')
                ? `Anonymized ballot recorded (${a.resourceId})`
                : a.summary,
              a.prevHash,
              a.entryHash,
            ];
          }),
        ];
        csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
        filename =
          scope === 'admin'
            ? `amanah-system-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
            : `amanah-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
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

// ---------------------------------------------------------------------------
// 9. Community Forum (Posts, Reactions, Comments & Admin Moderation)
// ---------------------------------------------------------------------------

const COMMUNITY_CATEGORIES: CommunityCategory[] = [
  'General',
  'Qard Hasan',
  'Halal Ventures',
  'Announcements',
  'Help & Support',
];

const COMMUNITY_REACTIONS: CommunityReactionType[] = ['like', 'support', 'celebrate', 'helpful'];

function hydrateCommunityPost(post: CommunityPost, users: StoredUser[]): CommunityPost {
  const author = users.find((u) => u.id === post.authorId);
  return {
    ...post,
    authorPhotoUrl: author?.photoUrl || post.authorPhotoUrl,
    authorMuted: Boolean(author?.communityMuted),
    reactions: Array.isArray(post.reactions) ? post.reactions : [],
    comments: Array.isArray(post.comments)
      ? post.comments.map((c) => {
          const commentAuthor = users.find((u) => u.id === c.authorId);
          return {
            ...c,
            authorPhotoUrl: commentAuthor?.photoUrl || c.authorPhotoUrl,
          };
        })
      : [],
  };
}

apiRouter.get('/community/posts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const isAdmin = viewer.role === 'admin';

    const visiblePosts = (state.communityPosts || [])
      .filter((post) => isAdmin || post.status === 'active')
      .map((post) => hydrateCommunityPost(post, state.users))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    res.json({ posts: visiblePosts });
  } catch (err) {
    console.error('Community posts load error:', err);
    res.status(500).json({ error: 'Failed to load community posts.' });
  }
});

apiRouter.post('/community/posts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const viewer = req.authUser!;
    if (viewer.communityMuted) {
      res.status(403).json({
        error: 'Your community posting privileges are currently muted by an administrator.',
      });
      return;
    }

    const rawCategory = String(req.body?.category || 'General') as CommunityCategory;
    const category: CommunityCategory = COMMUNITY_CATEGORIES.includes(rawCategory)
      ? rawCategory
      : 'General';
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const imageUrl = String(req.body?.imageUrl || '').trim();
    const rawPoll = req.body?.poll as
      | { question?: string; allowMultiple?: boolean; options?: unknown[] }
      | undefined;

    if (!title || title.length < 3 || title.length > 140) {
      res.status(400).json({ error: 'Post title must be between 3 and 140 characters.' });
      return;
    }
    if (!content || content.length < 3 || content.length > 4000) {
      res.status(400).json({ error: 'Post content must be between 3 and 4000 characters.' });
      return;
    }

    let builtPoll: CommunityPoll | undefined;
    if (rawPoll && rawPoll.question && Array.isArray(rawPoll.options)) {
      const cleanQuestion = String(rawPoll.question || '').trim();
      const cleanOpts = rawPoll.options
        .map((o) => String(o || '').trim())
        .filter((o) => o.length > 0)
        .slice(0, 6);
      if (cleanQuestion.length < 3 || cleanOpts.length < 2) {
        res.status(400).json({
          error: 'Community poll requires a question and at least 2 non-empty options.',
        });
        return;
      }
      builtPoll = {
        question: cleanQuestion,
        allowMultiple: Boolean(rawPoll.allowMultiple),
        options: cleanOpts.map((text, idx) => ({
          id: `opt-${Date.now()}-${idx}`,
          text,
          voterIds: [],
        })),
      };
    }

    const now = new Date().toISOString();
    const newPost: CommunityPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorId: viewer.id,
      authorName: viewer.name,
      authorCode: viewer.memberCode,
      authorRole: viewer.role,
      authorPhotoUrl: viewer.photoUrl,
      authorMuted: false,
      category,
      title,
      content,
      imageUrl: imageUrl || undefined,
      poll: builtPoll,
      reactions: [],
      comments: [],
      isPinned: false,
      commentsLocked: false,
      status: 'active',
      createdAt: now,
    };

    let mentionCount = 0;
    await updateVaultState((draft) => {
      const mentioned = extractMentionedUsers(`${title} ${content}`, draft.users, viewer.id);
      const mentionedIds = new Set(mentioned.map((m) => m.id));
      if (mentioned.length > 0) {
        newPost.mentions = mentioned.map((m) => m.memberCode);
        mentionCount = mentioned.length;
        mentioned.forEach((m) => {
          queueEmailNotification(draft, {
            type: 'community_mention',
            recipientEmail: m.email,
            recipientName: m.name,
            recipientUserId: m.id,
            subject: `${viewer.name} mentioned you in "${title}"`,
            body: `${viewer.name} (${viewer.memberCode}) mentioned you in the Community Hub post "${title}". View and reply in the Community tab.`,
            relatedId: newPost.id,
          });
        });
      }

      // Notify active members of new community posts
      draft.users
        .filter((u) => u.status === 'active' && u.id !== viewer.id && !mentionedIds.has(u.id))
        .forEach((member) => {
          queueEmailNotification(draft, {
            type: 'community_post_created',
            recipientEmail: member.email,
            recipientName: member.name,
            recipientUserId: member.id,
            subject: `New Community Post [${category}]: ${title}`,
            body: `${viewer.name} (${viewer.memberCode}) shared a new post in ${category}: "${title}". Open Community to read and join the discussion.`,
            relatedId: newPost.id,
          });
        });

      draft.communityPosts.unshift(newPost);
      appendAuditLog(draft, {
        actor: viewer,
        action: 'COMMUNITY_POST_CREATED',
        resourceType: 'community',
        resourceId: newPost.id,
        summary: `${viewer.name} published community post "${title}" in ${category}`,
        payload: { postId: newPost.id, category, title, hasPoll: Boolean(builtPoll) },
      });
      return draft;
    });

    broadcastRealtimeEvent('community:updated', { postId: newPost.id, type: 'post_created' });
    broadcastRealtimeEvent('notification:created', {
      type: mentionCount > 0 ? 'community_mention' : 'community_post_created',
    });
    broadcastRealtimeEvent('audit:updated', {
      action: 'COMMUNITY_POST_CREATED',
      resourceType: 'community',
      resourceId: newPost.id,
    });

    res.status(201).json({ post: newPost });
  } catch (err) {
    console.error('Create community post error:', err);
    res.status(500).json({ error: 'Failed to create community post.' });
  }
});

apiRouter.post('/community/posts/:id/poll-vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const optionIds = Array.isArray(req.body?.optionIds)
      ? Array.from(new Set((req.body.optionIds as unknown[]).map((o) => String(o || '').trim()).filter(Boolean)))
      : req.body?.optionId
        ? [String(req.body.optionId).trim()]
        : [];

    if (optionIds.length === 0) {
      res.status(400).json({ error: 'Select at least one poll option.' });
      return;
    }

    let updatedPost: CommunityPost | null = null;
    const nextState = await updateVaultState((draft) => {
      const post = draft.communityPosts.find((p) => p.id === id);
      if (!post || !post.poll || (post.status === 'hidden' && viewer.role !== 'admin')) {
        return draft;
      }

      const validOptionIds = new Set(post.poll.options.map((o) => o.id));
      const selected = optionIds.filter((oid) => validOptionIds.has(oid));
      if (selected.length === 0) {
        throw new Error('INVALID_POLL_OPTION');
      }

      const chosen = post.poll.allowMultiple ? selected : [selected[0]];

      // Remove existing votes by viewer first when single-choice or toggling
      if (!post.poll.allowMultiple) {
        const alreadyVotedSame = post.poll.options.some(
          (o) => o.id === chosen[0] && o.voterIds.includes(viewer.id)
        );
        post.poll.options.forEach((o) => {
          o.voterIds = o.voterIds.filter((uid) => uid !== viewer.id);
        });
        if (!alreadyVotedSame) {
          const targetOpt = post.poll.options.find((o) => o.id === chosen[0]);
          if (targetOpt) targetOpt.voterIds.push(viewer.id);
        }
      } else {
        post.poll.options.forEach((o) => {
          if (chosen.includes(o.id)) {
            if (o.voterIds.includes(viewer.id)) {
              o.voterIds = o.voterIds.filter((uid) => uid !== viewer.id);
            } else {
              o.voterIds.push(viewer.id);
            }
          }
        });
      }

      updatedPost = post;
      return draft;
    });

    if (!updatedPost) {
      res.status(404).json({ error: 'Community poll not found.' });
      return;
    }

    broadcastRealtimeEvent('community:updated', { postId: id, type: 'poll_vote' });
    res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_POLL_OPTION') {
      res.status(400).json({ error: 'Invalid poll option selected.' });
      return;
    }
    console.error('Poll vote error:', err);
    res.status(500).json({ error: 'Failed to cast poll vote.' });
  }
});

apiRouter.patch('/community/posts/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const title = req.body?.title !== undefined ? String(req.body.title).trim() : undefined;
    const content = req.body?.content !== undefined ? String(req.body.content).trim() : undefined;
    const rawCategory = req.body?.category as CommunityCategory | undefined;
    const imageUrl =
      req.body?.imageUrl !== undefined ? String(req.body.imageUrl || '').trim() : undefined;

    if (title !== undefined && (title.length < 3 || title.length > 140)) {
      res.status(400).json({ error: 'Post title must be between 3 and 140 characters.' });
      return;
    }
    if (content !== undefined && (content.length < 3 || content.length > 4000)) {
      res.status(400).json({ error: 'Post content must be between 3 and 4000 characters.' });
      return;
    }

    let updatedPost: CommunityPost | null = null;
    const nextState = await updateVaultState((draft) => {
      const target = draft.communityPosts.find((p) => p.id === id);
      if (!target) return draft;
      if (target.authorId !== viewer.id) {
        throw new Error('FORBIDDEN_POST_EDIT');
      }

      if (title !== undefined) target.title = title;
      if (content !== undefined) target.content = content;
      if (rawCategory && COMMUNITY_CATEGORIES.includes(rawCategory)) {
        target.category = rawCategory;
      }
      if (imageUrl !== undefined) {
        target.imageUrl = imageUrl || undefined;
      }
      target.updatedAt = new Date().toISOString();
      updatedPost = target;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'COMMUNITY_POST_EDITED',
        resourceType: 'community',
        resourceId: target.id,
        summary: `${viewer.name} edited their community post "${target.title}"`,
        payload: { postId: target.id, title: target.title },
      });
      return draft;
    });

    if (!updatedPost) {
      res.status(404).json({ error: 'Community post not found.' });
      return;
    }

    broadcastRealtimeEvent('community:updated', { postId: id, type: 'post_edited' });
    broadcastRealtimeEvent('audit:updated', {
      action: 'COMMUNITY_POST_EDITED',
      resourceType: 'community',
      resourceId: id,
    });

    res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_POST_EDIT') {
      res.status(403).json({ error: 'You can only edit your own posts.' });
      return;
    }
    console.error('Edit community post error:', err);
    res.status(500).json({ error: 'Failed to update community post.' });
  }
});

apiRouter.delete('/community/posts/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const reason = String(req.body?.reason || req.query?.reason || '').trim();
    let deletedPost: CommunityPost | null = null;
    let isAdminAction = false;

    await updateVaultState((draft) => {
      const idx = draft.communityPosts.findIndex((p) => p.id === id);
      if (idx === -1) return draft;

      const target = draft.communityPosts[idx];
      const isAuthor = target.authorId === viewer.id;
      const isAdmin = viewer.role === 'admin';
      if (!isAuthor && !isAdmin) {
        throw new Error('FORBIDDEN_POST_DELETE');
      }

      isAdminAction = !isAuthor && isAdmin;
      deletedPost = target;
      draft.communityPosts.splice(idx, 1);

      if (isAdminAction) {
        const author = draft.users.find((u) => u.id === target.authorId);
        if (author) {
          queueEmailNotification(draft, {
            type: 'community_moderation',
            recipientEmail: author.email,
            recipientName: author.name,
            recipientUserId: author.id,
            subject: `Community Post Removed by Administrator`,
            body: `Assalamu Alaikum ${author.name}, your community post "${target.title}" was removed by administrator ${viewer.name}.${reason ? ` Reason: ${reason}` : ''}`,
            relatedId: target.id,
          });
        }
      }

      appendAuditLog(draft, {
        actor: viewer,
        action: isAdminAction ? 'COMMUNITY_POST_DELETED_BY_ADMIN' : 'COMMUNITY_POST_DELETED',
        resourceType: 'community',
        resourceId: target.id,
        summary: isAdminAction
          ? `${viewer.name} (Admin) removed post "${target.title}" by ${target.authorName}${reason ? ` (${reason})` : ''}`
          : `${viewer.name} deleted their community post "${target.title}"`,
        payload: {
          postId: target.id,
          authorId: target.authorId,
          title: target.title,
          reason: reason || undefined,
        },
      });
      return draft;
    });

    if (!deletedPost) {
      res.status(404).json({ error: 'Community post not found.' });
      return;
    }

    broadcastRealtimeEvent('community:updated', { postId: id, type: 'post_deleted' });
    if (isAdminAction) {
      broadcastRealtimeEvent('notification:created', { type: 'community_moderation' });
    }
    broadcastRealtimeEvent('audit:updated', {
      action: isAdminAction ? 'COMMUNITY_POST_DELETED_BY_ADMIN' : 'COMMUNITY_POST_DELETED',
      resourceType: 'community',
      resourceId: id,
    });

    res.json({ ok: true, id });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_POST_DELETE') {
      res.status(403).json({ error: 'Only the post author or an administrator can delete this post.' });
      return;
    }
    console.error('Delete community post error:', err);
    res.status(500).json({ error: 'Failed to delete community post.' });
  }
});

apiRouter.post('/community/posts/:id/react', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    const rawType = String(req.body?.type || '') as CommunityReactionType;
    if (!COMMUNITY_REACTIONS.includes(rawType)) {
      res.status(400).json({ error: 'Invalid reaction type.' });
      return;
    }

    let updatedPost: CommunityPost | null = null;
    const nextState = await updateVaultState((draft) => {
      const post = draft.communityPosts.find((p) => p.id === id);
      if (!post || (post.status === 'hidden' && viewer.role !== 'admin')) {
        return draft;
      }

      post.reactions = Array.isArray(post.reactions) ? post.reactions : [];
      const existingIdx = post.reactions.findIndex((r) => r.userId === viewer.id);
      if (existingIdx !== -1) {
        if (post.reactions[existingIdx].type === rawType) {
          post.reactions.splice(existingIdx, 1);
        } else {
          post.reactions[existingIdx] = {
            userId: viewer.id,
            userName: viewer.name,
            type: rawType,
            createdAt: new Date().toISOString(),
          };
        }
      } else {
        post.reactions.push({
          userId: viewer.id,
          userName: viewer.name,
          type: rawType,
          createdAt: new Date().toISOString(),
        });
      }
      updatedPost = post;
      return draft;
    });

    if (!updatedPost) {
      res.status(404).json({ error: 'Community post not found.' });
      return;
    }

    broadcastRealtimeEvent('community:updated', { postId: id, type: 'reaction' });
    res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
  } catch (err) {
    console.error('React to post error:', err);
    res.status(500).json({ error: 'Failed to update reaction.' });
  }
});

apiRouter.post(
  '/community/posts/:id/comments',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      if (viewer.communityMuted) {
        res.status(403).json({
          error: 'Your community commenting privileges are currently muted by an administrator.',
        });
        return;
      }

      const content = String(req.body?.content || '').trim();
      if (!content || content.length > 2000) {
        res.status(400).json({ error: 'Comment must be between 1 and 2000 characters.' });
        return;
      }

      let updatedPost: CommunityPost | null = null;
      let mentionCount = 0;
      const nextState = await updateVaultState((draft) => {
        const post = draft.communityPosts.find((p) => p.id === id);
        if (!post || (post.status === 'hidden' && viewer.role !== 'admin')) {
          return draft;
        }
        if (post.commentsLocked && viewer.role !== 'admin') {
          throw new Error('COMMENTS_LOCKED');
        }

        const mentioned = extractMentionedUsers(content, draft.users, viewer.id);
        mentionCount = mentioned.length;

        const comment: CommunityComment = {
          id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          postId: post.id,
          authorId: viewer.id,
          authorName: viewer.name,
          authorCode: viewer.memberCode,
          authorRole: viewer.role,
          authorPhotoUrl: viewer.photoUrl,
          content,
          mentions: mentioned.length > 0 ? mentioned.map((m) => m.memberCode) : undefined,
          createdAt: new Date().toISOString(),
        };

        post.comments = Array.isArray(post.comments) ? post.comments : [];
        post.comments.push(comment);
        updatedPost = post;

        mentioned.forEach((m) => {
          queueEmailNotification(draft, {
            type: 'community_mention',
            recipientEmail: m.email,
            recipientName: m.name,
            recipientUserId: m.id,
            subject: `${viewer.name} mentioned you in a reply on "${post.title}"`,
            body: `${viewer.name} (${viewer.memberCode}) mentioned you in a comment on "${post.title}": "${content.slice(0, 140)}".`,
            relatedId: post.id,
          });
        });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'COMMUNITY_COMMENT_CREATED',
          resourceType: 'community',
          resourceId: comment.id,
          summary: `${viewer.name} commented on "${post.title}"`,
          payload: { postId: post.id, commentId: comment.id },
        });
        return draft;
      });

      if (!updatedPost) {
        res.status(404).json({ error: 'Community post not found.' });
        return;
      }

      broadcastRealtimeEvent('community:updated', { postId: id, type: 'comment_created' });
      if (mentionCount > 0) {
        broadcastRealtimeEvent('notification:created', { type: 'community_mention' });
      }
      broadcastRealtimeEvent('audit:updated', {
        action: 'COMMUNITY_COMMENT_CREATED',
        resourceType: 'community',
        resourceId: id,
      });

      res.status(201).json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
    } catch (err) {
      if (err instanceof Error && err.message === 'COMMENTS_LOCKED') {
        res.status(403).json({ error: 'Comments on this discussion have been locked by an administrator.' });
        return;
      }
      console.error('Create comment error:', err);
      res.status(500).json({ error: 'Failed to post comment.' });
    }
  }
);

apiRouter.patch(
  '/community/posts/:postId/comments/:commentId',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId, commentId } = req.params;
      const viewer = req.authUser!;
      const content = String(req.body?.content || '').trim();
      if (!content || content.length > 2000) {
        res.status(400).json({ error: 'Comment must be between 1 and 2000 characters.' });
        return;
      }

      let updatedPost: CommunityPost | null = null;
      let commentFound = false;
      const nextState = await updateVaultState((draft) => {
        const post = draft.communityPosts.find((p) => p.id === postId);
        if (!post) return draft;
        const comment = (post.comments || []).find((c) => c.id === commentId);
        if (!comment) return draft;
        commentFound = true;
        if (comment.authorId !== viewer.id) {
          throw new Error('FORBIDDEN_COMMENT_EDIT');
        }
        comment.content = content;
        comment.updatedAt = new Date().toISOString();
        updatedPost = post;
        return draft;
      });

      if (!updatedPost || !commentFound) {
        res.status(404).json({ error: 'Comment not found.' });
        return;
      }

      broadcastRealtimeEvent('community:updated', { postId, type: 'comment_edited' });
      res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN_COMMENT_EDIT') {
        res.status(403).json({ error: 'You can only edit your own comments.' });
        return;
      }
      console.error('Edit comment error:', err);
      res.status(500).json({ error: 'Failed to edit comment.' });
    }
  }
);

apiRouter.delete(
  '/community/posts/:postId/comments/:commentId',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const postId = String(req.params.postId || '');
      const commentId = String(req.params.commentId || '');
      const viewer = req.authUser!;
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      let updatedPost: CommunityPost | null = null;
      let commentFound = false;
      let isAdminAction = false;

      const nextState = await updateVaultState((draft) => {
        const post = draft.communityPosts.find((p) => p.id === postId);
        if (!post) return draft;
        const idx = (post.comments || []).findIndex((c) => c.id === commentId);
        if (idx === -1) return draft;
        commentFound = true;

        const targetComment = post.comments[idx];
        const isAuthor = targetComment.authorId === viewer.id;
        const isAdmin = viewer.role === 'admin';
        if (!isAuthor && !isAdmin) {
          throw new Error('FORBIDDEN_COMMENT_DELETE');
        }

        isAdminAction = !isAuthor && isAdmin;
        post.comments.splice(idx, 1);
        updatedPost = post;

        if (isAdminAction) {
          const author = draft.users.find((u) => u.id === targetComment.authorId);
          if (author) {
            queueEmailNotification(draft, {
              type: 'community_moderation',
              recipientEmail: author.email,
              recipientName: author.name,
              recipientUserId: author.id,
              subject: `Community Comment Removed by Administrator`,
              body: `Assalamu Alaikum ${author.name}, your comment on "${post.title}" was removed by administrator ${viewer.name}.${reason ? ` Reason: ${reason}` : ''}`,
              relatedId: post.id,
            });
          }
        }

        appendAuditLog(draft, {
          actor: viewer,
          action: isAdminAction
            ? 'COMMUNITY_COMMENT_DELETED_BY_ADMIN'
            : 'COMMUNITY_COMMENT_DELETED',
          resourceType: 'community',
          resourceId: commentId,
          summary: isAdminAction
            ? `${viewer.name} (Admin) deleted a comment by ${targetComment.authorName} on "${post.title}"`
            : `${viewer.name} deleted their comment on "${post.title}"`,
          payload: {
            postId: post.id,
            commentId,
            commentAuthorId: targetComment.authorId,
            reason: reason || undefined,
          },
        });
        return draft;
      });

      if (!updatedPost || !commentFound) {
        res.status(404).json({ error: 'Comment not found.' });
        return;
      }

      broadcastRealtimeEvent('community:updated', { postId, type: 'comment_deleted' });
      if (isAdminAction) {
        broadcastRealtimeEvent('notification:created', { type: 'community_moderation' });
      }
      broadcastRealtimeEvent('audit:updated', {
        action: isAdminAction
          ? 'COMMUNITY_COMMENT_DELETED_BY_ADMIN'
          : 'COMMUNITY_COMMENT_DELETED',
        resourceType: 'community',
        resourceId: commentId,
      });

      res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN_COMMENT_DELETE') {
        res
          .status(403)
          .json({ error: 'Only the comment author or an administrator can delete this comment.' });
        return;
      }
      console.error('Delete comment error:', err);
      res.status(500).json({ error: 'Failed to delete comment.' });
    }
  }
);

apiRouter.patch(
  '/community/posts/:id/moderate',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      const action = String(req.body?.action || '').trim();
      const reason = String(req.body?.reason || '').trim();

      if (!['pin', 'unpin', 'lock', 'unlock', 'hide', 'restore'].includes(action)) {
        res.status(400).json({ error: 'Invalid moderation action.' });
        return;
      }

      let updatedPost: CommunityPost | null = null;
      const nextState = await updateVaultState((draft) => {
        const post = draft.communityPosts.find((p) => p.id === id);
        if (!post) return draft;

        if (action === 'pin') post.isPinned = true;
        if (action === 'unpin') post.isPinned = false;
        if (action === 'lock') post.commentsLocked = true;
        if (action === 'unlock') post.commentsLocked = false;
        if (action === 'hide') {
          post.status = 'hidden';
          post.moderationReason = reason || 'Hidden by administrator during moderation review.';
          post.moderatedByName = viewer.name;
          post.moderatedAt = new Date().toISOString();

          const author = draft.users.find((u) => u.id === post.authorId);
          if (author && author.id !== viewer.id) {
            queueEmailNotification(draft, {
              type: 'community_moderation',
              recipientEmail: author.email,
              recipientName: author.name,
              recipientUserId: author.id,
              subject: `Community Post Hidden for Review`,
              body: `Assalamu Alaikum ${author.name}, your community post "${post.title}" was hidden from public member view by administrator ${viewer.name}. Note: ${post.moderationReason}`,
              relatedId: post.id,
            });
          }
        }
        if (action === 'restore') {
          post.status = 'active';
          post.moderationReason = undefined;
          post.moderatedByName = undefined;
          post.moderatedAt = undefined;
        }

        updatedPost = post;
        appendAuditLog(draft, {
          actor: viewer,
          action: `COMMUNITY_POST_${action.toUpperCase()}`,
          resourceType: 'community',
          resourceId: post.id,
          summary: `${viewer.name} applied moderation "${action}" on "${post.title}"`,
          payload: { postId: post.id, action, reason: reason || undefined },
        });
        return draft;
      });

      if (!updatedPost) {
        res.status(404).json({ error: 'Community post not found.' });
        return;
      }

      broadcastRealtimeEvent('community:updated', { postId: id, type: `moderated_${action}` });
      if (action === 'hide') {
        broadcastRealtimeEvent('notification:created', { type: 'community_moderation' });
      }
      broadcastRealtimeEvent('audit:updated', {
        action: `COMMUNITY_POST_${action.toUpperCase()}`,
        resourceType: 'community',
        resourceId: id,
      });

      res.json({ post: hydrateCommunityPost(updatedPost, nextState.users) });
    } catch (err) {
      console.error('Moderate post error:', err);
      res.status(500).json({ error: 'Failed to moderate community post.' });
    }
  }
);

apiRouter.patch(
  '/community/members/:userId/mute',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const viewer = req.authUser!;
      const muted = Boolean(req.body?.muted);
      const reason = String(req.body?.reason || '').trim();

      if (userId === viewer.id) {
        res.status(400).json({ error: 'Administrators cannot mute their own account.' });
        return;
      }

      let found = false;
      let targetName = '';
      await updateVaultState((draft) => {
        const target = draft.users.find((u) => u.id === userId);
        if (!target) return draft;
        if (target.role === 'admin') {
          throw new Error('CANNOT_MUTE_ADMIN');
        }
        found = true;
        targetName = target.name;
        target.communityMuted = muted;

        queueEmailNotification(draft, {
          type: 'community_moderation',
          recipientEmail: target.email,
          recipientName: target.name,
          recipientUserId: target.id,
          subject: muted
            ? 'Community Posting Privileges Muted'
            : 'Community Posting Privileges Restored',
          body: muted
            ? `Assalamu Alaikum ${target.name}, administrator ${viewer.name} has temporarily muted your ability to create community posts or comments.${reason ? ` Note: ${reason}` : ''}`
            : `Assalamu Alaikum ${target.name}, administrator ${viewer.name} has restored your community posting and commenting privileges.`,
          relatedId: target.id,
        });

        appendAuditLog(draft, {
          actor: viewer,
          action: muted ? 'COMMUNITY_MEMBER_MUTED' : 'COMMUNITY_MEMBER_UNMUTED',
          resourceType: 'community',
          resourceId: target.id,
          summary: muted
            ? `${viewer.name} muted ${target.name} (${target.memberCode}) in Community${reason ? `: ${reason}` : ''}`
            : `${viewer.name} unmuted ${target.name} (${target.memberCode}) in Community`,
          payload: { targetUserId: target.id, muted, reason: reason || undefined },
        });
        return draft;
      });

      if (!found) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }

      broadcastRealtimeEvent('community:updated', { type: 'member_mute_changed', userId });
      broadcastRealtimeEvent('members:updated', { userId });
      broadcastRealtimeEvent('notification:created', { type: 'community_moderation' });
      broadcastRealtimeEvent('audit:updated', {
        action: muted ? 'COMMUNITY_MEMBER_MUTED' : 'COMMUNITY_MEMBER_UNMUTED',
        resourceType: 'community',
        resourceId: userId,
      });

      res.json({ ok: true, userId, targetName, muted });
    } catch (err) {
      if (err instanceof Error && err.message === 'CANNOT_MUTE_ADMIN') {
        res.status(400).json({ error: 'Administrator accounts cannot be muted.' });
        return;
      }
      console.error('Community mute member error:', err);
      res.status(500).json({ error: 'Failed to update member community privileges.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 10. Private Encrypted Messaging Among Registered Active Users
// ---------------------------------------------------------------------------

function makeConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join('--');
}

function decryptPrivateMessage(msg: StoredPrivateMessage): PrivateMessage {
  let body = '[Encrypted message could not be decrypted]';
  try {
    const decrypted = decryptSensitiveObject<{ body?: string }>(msg.encryptedBody);
    if (typeof decrypted?.body === 'string') {
      body = decrypted.body;
    }
  } catch {
    // keep fallback string
  }

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderCode: msg.senderCode,
    senderRole: msg.senderRole,
    senderPhotoUrl: msg.senderPhotoUrl,
    recipientId: msg.recipientId,
    recipientName: msg.recipientName,
    recipientCode: msg.recipientCode,
    recipientRole: msg.recipientRole,
    recipientPhotoUrl: msg.recipientPhotoUrl,
    body,
    createdAt: msg.createdAt,
    readAt: msg.readAt,
  };
}

apiRouter.get('/messages/threads', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;

    const directory = state.users
      .filter((u) => u.status === 'active' && u.id !== viewer.id)
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        memberCode: u.memberCode,
        photoUrl: u.photoUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const myMessages = (state.privateMessages || []).filter(
      (m) => m.senderId === viewer.id || m.recipientId === viewer.id
    );

    const threadMap = new Map<string, ConversationThreadSummary>();
    let totalUnread = 0;

    for (const stored of myMessages) {
      const isViewerSender = stored.senderId === viewer.id;
      const peerId = isViewerSender ? stored.recipientId : stored.senderId;
      const peerUser = state.users.find((u) => u.id === peerId);
      const peerName = peerUser?.name || (isViewerSender ? stored.recipientName : stored.senderName);
      const peerCode = peerUser?.memberCode || (isViewerSender ? stored.recipientCode : stored.senderCode);
      const peerRole = peerUser?.role || (isViewerSender ? stored.recipientRole : stored.senderRole);
      const peerPhotoUrl =
        peerUser?.photoUrl || (isViewerSender ? stored.recipientPhotoUrl : stored.senderPhotoUrl);

      const decrypted = decryptPrivateMessage(stored);
      const unreadIncrement = !isViewerSender && !stored.readAt ? 1 : 0;
      totalUnread += unreadIncrement;

      const existing = threadMap.get(peerId);
      if (!existing) {
        threadMap.set(peerId, {
          peerId,
          peerName,
          peerCode,
          peerRole,
          peerPhotoUrl,
          lastMessageBody: decrypted.body,
          lastMessageAt: decrypted.createdAt,
          lastMessageSenderId: decrypted.senderId,
          unreadCount: unreadIncrement,
        });
      } else {
        existing.unreadCount += unreadIncrement;
        if (new Date(decrypted.createdAt).getTime() >= new Date(existing.lastMessageAt).getTime()) {
          existing.lastMessageBody = decrypted.body;
          existing.lastMessageAt = decrypted.createdAt;
          existing.lastMessageSenderId = decrypted.senderId;
        }
      }
    }

    const threads = Array.from(threadMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    res.json({ threads, totalUnread, directory });
  } catch (err) {
    console.error('Private message threads error:', err);
    res.status(500).json({ error: 'Failed to load private message threads.' });
  }
});

apiRouter.get('/messages/with/:peerId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const peerId = String(req.params.peerId || '');
    const viewer = req.authUser!;
    if (!peerId || peerId === viewer.id) {
      res.status(400).json({ error: 'Invalid conversation peer.' });
      return;
    }

    let peerSummary: {
      id: string;
      name: string;
      memberCode: string;
      role: UserRole;
      photoUrl?: string;
    } | null = null;
    let markedRead = false;
    let conversationMessages: PrivateMessage[] = [];
    const conversationId = makeConversationId(viewer.id, peerId);

    const nextState = await updateVaultState((draft) => {
      const peer = draft.users.find((u) => u.id === peerId);
      if (!peer) return draft;
      peerSummary = {
        id: peer.id,
        name: peer.name,
        memberCode: peer.memberCode,
        role: peer.role,
        photoUrl: peer.photoUrl,
      };

      const readAt = new Date().toISOString();
      draft.privateMessages = Array.isArray(draft.privateMessages) ? draft.privateMessages : [];
      draft.privateMessages.forEach((m) => {
        if (
          m.conversationId === conversationId &&
          m.senderId === peerId &&
          m.recipientId === viewer.id &&
          !m.readAt
        ) {
          m.readAt = readAt;
          markedRead = true;
        }
      });
      return draft;
    });

    if (!peerSummary) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }

    conversationMessages = (nextState.privateMessages || [])
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(decryptPrivateMessage);

    if (markedRead) {
      sendRealtimeEventToUsers([viewer.id, peerId], 'dm:read', {
        conversationId,
        readerId: viewer.id,
        peerId,
      });
    }

    res.json({ peer: peerSummary, messages: conversationMessages });
  } catch (err) {
    console.error('Load conversation error:', err);
    res.status(500).json({ error: 'Failed to load private conversation.' });
  }
});

apiRouter.post('/messages/with/:peerId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const peerId = String(req.params.peerId || '');
    const viewer = req.authUser!;
    const body = String(req.body?.body || '').trim();

    if (!peerId || peerId === viewer.id) {
      res.status(400).json({ error: 'Select another active cooperative member to message.' });
      return;
    }
    if (!body || body.length > 3000) {
      res.status(400).json({ error: 'Message must be between 1 and 3000 characters.' });
      return;
    }

    let createdStored: StoredPrivateMessage | null = null;
    await updateVaultState((draft) => {
      const peer = draft.users.find((u) => u.id === peerId && u.status === 'active');
      if (!peer) {
        throw new Error('PEER_NOT_FOUND');
      }

      const conversationId = makeConversationId(viewer.id, peer.id);
      createdStored = {
        id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        conversationId,
        senderId: viewer.id,
        senderName: viewer.name,
        senderCode: viewer.memberCode,
        senderRole: viewer.role,
        senderPhotoUrl: viewer.photoUrl,
        recipientId: peer.id,
        recipientName: peer.name,
        recipientCode: peer.memberCode,
        recipientRole: peer.role,
        recipientPhotoUrl: peer.photoUrl,
        encryptedBody: encryptSensitiveObject({ body }),
        createdAt: new Date().toISOString(),
      };

      draft.privateMessages = Array.isArray(draft.privateMessages) ? draft.privateMessages : [];
      draft.privateMessages.push(createdStored);
      return draft;
    });

    if (!createdStored) {
      res.status(404).json({ error: 'Recipient not found.' });
      return;
    }

    const hydrated = decryptPrivateMessage(createdStored);
    sendRealtimeEventToUsers([viewer.id, peerId], 'dm:received', {
      conversationId: hydrated.conversationId,
      messageId: hydrated.id,
      senderId: viewer.id,
      recipientId: peerId,
    });

    res.status(201).json({ message: hydrated });
  } catch (err) {
    if (err instanceof Error && err.message === 'PEER_NOT_FOUND') {
      res.status(404).json({ error: 'Recipient member is inactive or not found.' });
      return;
    }
    console.error('Send private message error:', err);
    res.status(500).json({ error: 'Failed to send private message.' });
  }
});

apiRouter.delete('/messages/:messageId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { messageId } = req.params;
    const viewer = req.authUser!;
    let removedMsg: StoredPrivateMessage | null = null;

    await updateVaultState((draft) => {
      const list = Array.isArray(draft.privateMessages) ? draft.privateMessages : [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return draft;
      if (list[idx].senderId !== viewer.id) {
        throw new Error('FORBIDDEN_DM_DELETE');
      }
      removedMsg = list[idx];
      list.splice(idx, 1);
      draft.privateMessages = list;
      return draft;
    });

    if (!removedMsg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    const target = removedMsg as StoredPrivateMessage;
    sendRealtimeEventToUsers([target.senderId, target.recipientId], 'dm:deleted', {
      conversationId: target.conversationId,
      messageId: target.id,
    });

    res.json({ ok: true, messageId });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_DM_DELETE') {
      res.status(403).json({ error: 'You can only delete private messages you sent.' });
      return;
    }
    console.error('Delete private message error:', err);
    res.status(500).json({ error: 'Failed to delete private message.' });
  }
});

// ---------------------------------------------------------------------------
// 11. Decision Opinion Polls & Cooperative Meetings (Manager / Admin Governance)
// ---------------------------------------------------------------------------

apiRouter.get('/polls', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const viewer = req.authUser!;
    const polls = (state.decisionPolls || []).map((p) => hydrateDecisionPollForViewer(p, viewer));
    res.json({ polls });
  } catch (err) {
    console.error('Load decision polls error:', err);
    res.status(500).json({ error: 'Failed to load decision polls.' });
  }
});

apiRouter.post(
  '/polls',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewer = req.authUser!;
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const rawCat = String(req.body?.category || 'general');
      const category = (
        ['policy', 'project', 'qard_hasan', 'general'].includes(rawCat) ? rawCat : 'general'
      ) as DecisionPoll['category'];
      const rawOptions = Array.isArray(req.body?.options)
        ? (req.body.options as unknown[]).map((o) => String(o || '').trim()).filter(Boolean)
        : ['Approve', 'Decline'];
      const closesAt = req.body?.closesAt ? String(req.body.closesAt).trim() : undefined;

      if (!title || title.length < 3) {
        res.status(400).json({ error: 'Poll title must be at least 3 characters.' });
        return;
      }
      if (rawOptions.length < 2 || rawOptions.length > 6) {
        res.status(400).json({ error: 'Provide between 2 and 6 voting options.' });
        return;
      }

      const now = new Date().toISOString();
      const poll: DecisionPoll = {
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description: description || 'Member decision poll opened for cooperative consensus.',
        category,
        options: rawOptions.map((label, idx) => ({
          id: `opt-${idx + 1}`,
          label,
        })),
        status: 'open',
        voteResultRevealed: false,
        createdById: viewer.id,
        createdByName: viewer.name,
        createdAt: now,
        closesAt: closesAt || undefined,
        votes: [],
      };

      await updateVaultState((draft) => {
        draft.decisionPolls = Array.isArray(draft.decisionPolls) ? draft.decisionPolls : [];
        draft.decisionPolls.unshift(poll);

        draft.users
          .filter((u) => u.status === 'active' && u.role !== 'admin')
          .forEach((member) => {
            queueEmailNotification(draft, {
              type: 'decision_vote_requested',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Opinion Ballot Open: ${title}`,
              body: `Manager ${viewer.name} initiated a cooperative decision vote: "${title}". Cast your secret ballot in the Opinion Ballot tab. Results remain hidden until revealed by the Manager.`,
              relatedId: poll.id,
            });
          });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'DECISION_POLL_CREATED',
          resourceType: 'vote',
          resourceId: poll.id,
          summary: `${viewer.name} initiated cooperative decision poll "${title}" with ${poll.options.length} options`,
          payload: { pollId: poll.id, category, options: rawOptions },
        });
        return draft;
      });

      broadcastRealtimeEvent('poll:updated', { pollId: poll.id });
      broadcastRealtimeEvent('notification:created', { type: 'decision_vote_requested' });
      broadcastRealtimeEvent('audit:updated', {
        action: 'DECISION_POLL_CREATED',
        resourceType: 'vote',
        resourceId: poll.id,
      });

      res.status(201).json({ poll: hydrateDecisionPollForViewer(poll, viewer) });
    } catch (err) {
      console.error('Create poll error:', err);
      res.status(500).json({ error: 'Failed to create decision poll.' });
    }
  }
);

apiRouter.post('/polls/:id/vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const viewer = req.authUser!;
    if (viewer.role === 'admin') {
      res.status(403).json({
        error: 'Administrator accounts inspect audit ballots only and do not cast member votes.',
      });
      return;
    }

    const optionId = String(req.body?.optionId || '').trim();
    const comment = String(req.body?.comment || '').trim();
    if (!optionId) {
      res.status(400).json({ error: 'Select a valid voting option.' });
      return;
    }

    let updatedPoll: DecisionPoll | null = null;
    await updateVaultState((draft) => {
      draft.decisionPolls = Array.isArray(draft.decisionPolls) ? draft.decisionPolls : [];
      const poll = draft.decisionPolls.find((p) => p.id === id);
      if (!poll) return draft;
      if (poll.status !== 'open' || poll.voteResultRevealed) {
        throw new Error('POLL_CLOSED');
      }
      if (!poll.options.some((o) => o.id === optionId)) {
        throw new Error('INVALID_OPTION');
      }
      if (poll.votes.some((v) => v.voterId === viewer.id)) {
        throw new Error('ALREADY_VOTED');
      }

      const castAt = new Date().toISOString();
      poll.votes.push({
        voterId: viewer.id,
        voterName: viewer.name,
        voterRole: viewer.role,
        optionId,
        comment: comment || undefined,
        castAt,
        signatureHash: computeSha256Hash({
          pollId: poll.id,
          voterId: viewer.id,
          optionId,
          castAt,
        }),
      });
      updatedPoll = poll;

      appendAuditLog(draft, {
        actor: viewer,
        action: 'DECISION_POLL_VOTE_CAST',
        resourceType: 'vote',
        resourceId: poll.id,
        summary: `An anonymized verified ballot was cast on decision poll "${poll.title}" (${poll.votes.length} total ballots)`,
        payload: { pollId: poll.id, optionId, totalVotesCast: poll.votes.length },
      });
      return draft;
    });

    if (!updatedPoll) {
      res.status(404).json({ error: 'Decision poll not found.' });
      return;
    }

    broadcastRealtimeEvent('poll:updated', { pollId: id });
    broadcastRealtimeEvent('audit:updated', {
      action: 'DECISION_POLL_VOTE_CAST',
      resourceType: 'vote',
      resourceId: id,
    });
    res.json({ poll: hydrateDecisionPollForViewer(updatedPoll, viewer) });
  } catch (err) {
    if (err instanceof Error && err.message === 'POLL_CLOSED') {
      res.status(409).json({ error: 'Voting has closed for this decision poll.' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_OPTION') {
      res.status(400).json({ error: 'Selected option does not exist in this poll.' });
      return;
    }
    if (err instanceof Error && err.message === 'ALREADY_VOTED') {
      res.status(409).json({ error: 'You have already cast your secret ballot on this poll.' });
      return;
    }
    console.error('Cast decision vote error:', err);
    res.status(500).json({ error: 'Failed to cast vote.' });
  }
});

apiRouter.post(
  '/polls/:id/reveal',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const viewer = req.authUser!;
      let updatedPoll: DecisionPoll | null = null;

      await updateVaultState((draft) => {
        draft.decisionPolls = Array.isArray(draft.decisionPolls) ? draft.decisionPolls : [];
        const poll = draft.decisionPolls.find((p) => p.id === id);
        if (!poll) return draft;
        if (poll.voteResultRevealed) {
          throw new Error('ALREADY_REVEALED');
        }

        const now = new Date().toISOString();
        poll.status = 'closed';
        poll.voteResultRevealed = true;
        poll.revealedAt = now;
        poll.revealedByName = viewer.name;
        updatedPoll = poll;

        const summaryLines = poll.options
          .map((o) => `${o.label}: ${poll.votes.filter((v) => v.optionId === o.id).length}`)
          .join(' · ');

        draft.users
          .filter((u) => u.status === 'active' && u.role !== 'admin')
          .forEach((member) => {
            queueEmailNotification(draft, {
              type: 'decision_vote_requested',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Poll Results Revealed: ${poll.title}`,
              body: `Manager ${viewer.name} closed voting and revealed the outcome of "${poll.title}": ${summaryLines}. Open Opinion Ballot to inspect results.`,
              relatedId: poll.id,
            });
          });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'DECISION_POLL_REVEALED',
          resourceType: 'vote',
          resourceId: poll.id,
          summary: `${viewer.name} closed and revealed decision poll "${poll.title}" (${poll.votes.length} ballots)`,
          payload: { pollId: poll.id, totalVotesCast: poll.votes.length },
        });
        return draft;
      });

      if (!updatedPoll) {
        res.status(404).json({ error: 'Decision poll not found.' });
        return;
      }

      broadcastRealtimeEvent('poll:updated', { pollId: id });
      broadcastRealtimeEvent('notification:created', { type: 'decision_vote_requested' });
      res.json({ poll: hydrateDecisionPollForViewer(updatedPoll, viewer) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_REVEALED') {
        res.status(409).json({ error: 'Results have already been revealed for this poll.' });
        return;
      }
      console.error('Reveal poll error:', err);
      res.status(500).json({ error: 'Failed to reveal poll results.' });
    }
  }
);

apiRouter.get('/meetings', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const state = await loadVaultState();
    const meetings = [...(state.meetings || [])].sort((a, b) =>
      b.scheduledFor.localeCompare(a.scheduledFor)
    );
    res.json({ meetings });
  } catch (err) {
    console.error('Load meetings error:', err);
    res.status(500).json({ error: 'Failed to load scheduled meetings.' });
  }
});

apiRouter.post(
  '/meetings',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewer = req.authUser!;
      const title = String(req.body?.title || '').trim();
      const agenda = String(req.body?.agenda || '').trim();
      const scheduledFor = String(req.body?.scheduledFor || '').trim();
      const locationOrLink = String(req.body?.locationOrLink || '').trim();

      if (!title || !scheduledFor || !locationOrLink) {
        res.status(400).json({
          error: 'Meeting title, scheduled date/time, and location or meeting link are required.',
        });
        return;
      }

      const meeting: CoopMeeting = {
        id: `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        agenda: agenda || 'Regular cooperative treasury & member review session.',
        scheduledFor,
        locationOrLink,
        status: 'scheduled',
        createdById: viewer.id,
        createdByName: viewer.name,
        createdAt: new Date().toISOString(),
      };

      await updateVaultState((draft) => {
        draft.meetings = Array.isArray(draft.meetings) ? draft.meetings : [];
        draft.meetings.unshift(meeting);

        draft.users
          .filter((u) => u.status === 'active')
          .forEach((member) => {
            queueEmailNotification(draft, {
              type: 'meeting_scheduled',
              recipientEmail: member.email,
              recipientName: member.name,
              recipientUserId: member.id,
              subject: `Cooperative Meeting Notice: ${title}`,
              body: `Assalamu Alaikum ${member.name}, ${viewer.name} scheduled a cooperative meeting "${title}" for ${scheduledFor} (${locationOrLink}). Agenda: ${meeting.agenda}`,
              relatedId: meeting.id,
            });
          });

        appendAuditLog(draft, {
          actor: viewer,
          action: 'MEETING_SCHEDULED',
          resourceType: 'notification',
          resourceId: meeting.id,
          summary: `${viewer.name} scheduled cooperative meeting "${title}" for ${scheduledFor}`,
          payload: { meetingId: meeting.id, title, scheduledFor, locationOrLink },
        });
        return draft;
      });

      broadcastRealtimeEvent('meeting:updated', { meetingId: meeting.id });
      broadcastRealtimeEvent('notification:created', { type: 'meeting_scheduled' });
      res.status(201).json({ meeting });
    } catch (err) {
      console.error('Schedule meeting error:', err);
      res.status(500).json({ error: 'Failed to schedule cooperative meeting.' });
    }
  }
);

apiRouter.patch(
  '/meetings/:id/status',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const status = req.body?.status;
      if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
        res.status(400).json({ error: 'Invalid meeting status.' });
        return;
      }

      let updated: CoopMeeting | null = null;
      await updateVaultState((draft) => {
        draft.meetings = Array.isArray(draft.meetings) ? draft.meetings : [];
        const target = draft.meetings.find((m) => m.id === id);
        if (!target) return draft;
        target.status = status;
        updated = target;
        return draft;
      });

      if (!updated) {
        res.status(404).json({ error: 'Meeting not found.' });
        return;
      }

      broadcastRealtimeEvent('meeting:updated', { meetingId: id, status });
      res.json({ meeting: updated });
    } catch (err) {
      console.error('Update meeting status error:', err);
      res.status(500).json({ error: 'Failed to update meeting status.' });
    }
  }
);


