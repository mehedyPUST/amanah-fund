import crypto from 'node:crypto';
import type {
  MemberActivationAdminView,
  PublicUser,
  UsedActivationOtpRecord,
} from '../types/coop.ts';
import { appendAuditLog, queueEmailNotification } from './coopService.ts';
import { decryptSensitiveObject, encryptSensitiveObject } from './crypto.ts';
import type { StoredUser, VaultState } from './db.ts';

const MAX_FAILED_ACTIVATION_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export function normalizeMemberIdInput(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, '').trim();
}

export function isValidSixDigitOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/**
 * Generates the next unique official Amanah Member ID in the format AMANAH-AC-02,
 * scanning existing users (supporting both legacy AC-001 and AMANAH-AC-02 codes).
 */
export function generateNextAmanahMemberId(
  users: StoredUser[],
  options?: { excludeUserId?: string; customCode?: string }
): string {
  const excludeId = options?.excludeUserId;
  const takenCodes = new Set<string>();

  for (const u of users) {
    if (excludeId && u.id === excludeId) continue;
    if (u.memberCode) takenCodes.add(normalizeMemberIdInput(u.memberCode));
    if (u.activationMeta?.memberCode) {
      takenCodes.add(normalizeMemberIdInput(u.activationMeta.memberCode));
    }
  }

  if (options?.customCode && options.customCode.trim()) {
    const normalized = normalizeMemberIdInput(options.customCode);
    if (!/^[A-Z0-9-]{3,32}$/.test(normalized)) {
      throw new Error('INVALID_MEMBER_CODE');
    }
    if (takenCodes.has(normalized)) {
      throw new Error('MEMBER_CODE_IN_USE');
    }
    return normalized;
  }

  let maxNum = 0;
  for (const u of users) {
    if (excludeId && u.id === excludeId && u.status === 'pending_approval') continue;
    const candidates = [u.memberCode, u.activationMeta?.memberCode].filter(Boolean) as string[];
    for (const code of candidates) {
      const match = code.match(/(?:AMANAH-)?AC-(\d+)$/i) || code.match(/(\d+)$/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }
  }

  let nextNum = Math.max(1, maxNum + 1);
  let candidate = `AMANAH-AC-${String(nextNum).padStart(2, '0')}`;
  while (takenCodes.has(candidate)) {
    nextNum += 1;
    candidate = `AMANAH-AC-${String(nextNum).padStart(2, '0')}`;
  }
  return candidate;
}

/**
 * Generates a cryptographically random 6-digit numeric OTP guaranteed never to have been
 * issued or used to activate any other member in the cooperative vault's lifetime.
 */
export function generateUniqueSixDigitOtp(state: VaultState): string {
  const usedSet = new Set<string>();

  for (const rec of state.usedActivationOtps || []) {
    if (rec.otp) usedSet.add(rec.otp.trim());
  }

  for (const user of state.users || []) {
    if (user.encryptedActivationOtp) {
      try {
        const decrypted = decryptSensitiveObject<{ otp?: string }>(user.encryptedActivationOtp);
        if (decrypted?.otp) usedSet.add(String(decrypted.otp).trim());
      } catch {
        // ignore unreadable envelope
      }
    }
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    // Cryptographically uniform 6-digit code in [100000, 999999]
    const code = String(crypto.randomInt(100000, 1000000));
    if (!usedSet.has(code)) {
      return code;
    }
  }

  // Fallback across full 6-digit zero-padded space if high density ever reached
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    if (!usedSet.has(code)) {
      return code;
    }
  }

  throw new Error('OTP_EXHAUSTED');
}

export function decryptAdminActivationView(user: StoredUser): MemberActivationAdminView | undefined {
  if (!user.activationMeta) return undefined;
  let otp = '';
  if (user.encryptedActivationOtp) {
    try {
      const decrypted = decryptSensitiveObject<{ otp?: string }>(user.encryptedActivationOtp);
      otp = decrypted?.otp ? String(decrypted.otp) : '';
    } catch {
      otp = '';
    }
  }

  return {
    memberCode: user.activationMeta.memberCode || user.memberCode,
    otp,
    issuedAt: user.activationMeta.issuedAt,
    issuedByName: user.activationMeta.issuedByName,
    emailSent: Boolean(user.activationMeta.emailSent),
    emailSentAt: user.activationMeta.emailSentAt,
    emailError: user.activationMeta.emailError,
    activatedAt: user.activationMeta.activatedAt,
    agreementAcceptedAt: user.activationMeta.agreementAcceptedAt,
    failedAttempts: user.activationMeta.failedAttempts || 0,
  };
}

export function issueMemberActivationInState(
  state: VaultState,
  params: {
    targetUserId: string;
    admin: PublicUser;
    customMemberCode?: string;
    nowIso?: string;
  }
): {
  user: StoredUser;
  otp: string;
  memberCode: string;
  issuedAt: string;
} {
  const user = state.users.find((u) => u.id === params.targetUserId);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  if (user.status === 'active') {
    throw new Error('USER_ALREADY_ACTIVE');
  }
  if (user.status === 'suspended') {
    throw new Error('USER_SUSPENDED');
  }

  const nowIso = params.nowIso || new Date().toISOString();
  const memberCode = generateNextAmanahMemberId(state.users, {
    excludeUserId: user.id,
    customCode: params.customMemberCode,
  });
  const otp = generateUniqueSixDigitOtp(state);

  user.memberCode = memberCode;
  user.status = 'pending_activation';
  user.encryptedActivationOtp = encryptSensitiveObject({ otp });
  user.activationMeta = {
    memberCode,
    issuedAt: nowIso,
    issuedById: params.admin.id,
    issuedByName: params.admin.name,
    emailSent: false,
    failedAttempts: 0,
  };

  state.usedActivationOtps = Array.isArray(state.usedActivationOtps)
    ? state.usedActivationOtps
    : [];
  const otpRecord: UsedActivationOtpRecord = {
    id: `aotp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    otp,
    userId: user.id,
    memberCode,
    issuedAt: nowIso,
  };
  state.usedActivationOtps.unshift(otpRecord);

  queueEmailNotification(state, {
    type: 'signup_activation_issued',
    recipientEmail: user.email,
    recipientName: user.name,
    recipientUserId: user.id,
    subject: `Membership Approved — Activation Codes Issued (${memberCode})`,
    body: `Assalamu Alaikum ${user.name}, administrator ${params.admin.name} has reviewed and approved your application. Your official Member ID (${memberCode}) and unique 6-digit Activation OTP have been dispatched to ${user.email}. Sign in to complete activation and confirm your final membership agreement.`,
    relatedId: user.id,
  });

  appendAuditLog(state, {
    actor: params.admin,
    action: 'MEMBER_ACTIVATION_CODES_ISSUED',
    resourceType: 'auth',
    resourceId: user.id,
    summary: `${params.admin.name} reviewed & approved ${user.name}, assigned Member ID ${memberCode}, and issued a unique 6-digit Activation OTP`,
    payload: {
      targetUserId: user.id,
      targetName: user.name,
      targetEmail: user.email,
      assignedMemberCode: memberCode,
      issuedAt: nowIso,
    },
  });

  return {
    user,
    otp,
    memberCode,
    issuedAt: nowIso,
  };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export type VerifyActivationResult =
  | {
      ok: true;
      user: StoredUser;
      activatedAt: string;
    }
  | {
      ok: false;
      code:
        | 'USER_NOT_FOUND'
        | 'AGREEMENT_REQUIRED'
        | 'INVALID_INPUT'
        | 'ALREADY_ACTIVATED'
        | 'AWAITING_ADMIN_APPROVAL'
        | 'ACCOUNT_SUSPENDED'
        | 'NO_ACTIVATION_ISSUED'
        | 'TOO_MANY_ATTEMPTS'
        | 'INVALID_ACTIVATION_CODES';
      message: string;
    };

export function verifyMemberActivationInState(
  state: VaultState,
  params: {
    userId: string;
    memberCode: string;
    otp: string;
    agreedToTerms: boolean;
    nowIso?: string;
  }
): VerifyActivationResult {
  if (!params.agreedToTerms) {
    return {
      ok: false,
      code: 'AGREEMENT_REQUIRED',
      message:
        'Please confirm the final Amanah membership agreement checkbox before activating your account.',
    };
  }

  const submittedCode = normalizeMemberIdInput(params.memberCode || '');
  const submittedOtp = normalizeOtpInput(params.otp || '');
  if (!submittedCode || !isValidSixDigitOtp(submittedOtp)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Please enter both your Member ID (e.g. AMANAH-AC-02) and your 6-digit Activation OTP.',
    };
  }

  const user = state.users.find((u) => u.id === params.userId);
  if (!user) {
    return {
      ok: false,
      code: 'USER_NOT_FOUND',
      message: 'Member account not found.',
    };
  }

  if (user.status === 'active') {
    return {
      ok: false,
      code: 'ALREADY_ACTIVATED',
      message: 'This account is already activated. Please sign in normally.',
    };
  }
  if (user.status === 'pending_approval') {
    return {
      ok: false,
      code: 'AWAITING_ADMIN_APPROVAL',
      message: 'Your application is still awaiting administrator review.',
    };
  }
  if (user.status === 'suspended') {
    return {
      ok: false,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account is suspended. Please contact an administrator.',
    };
  }

  if (!user.encryptedActivationOtp || !user.activationMeta) {
    return {
      ok: false,
      code: 'NO_ACTIVATION_ISSUED',
      message: 'Activation credentials have not been issued yet. Contact an Amanah administrator.',
    };
  }

  const nowIso = params.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const attempts = user.activationMeta.failedAttempts || 0;
  const lastFailedMs = user.activationMeta.lastFailedAt
    ? Date.parse(user.activationMeta.lastFailedAt)
    : 0;

  if (attempts >= MAX_FAILED_ACTIVATION_ATTEMPTS && nowMs - lastFailedMs < LOCKOUT_WINDOW_MS) {
    const minsLeft = Math.max(1, Math.ceil((LOCKOUT_WINDOW_MS - (nowMs - lastFailedMs)) / 60000));
    return {
      ok: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: `Too many incorrect activation attempts. Please wait ${minsLeft} minute(s) or verify your codes with an administrator by phone.`,
    };
  }

  let expectedOtp = '';
  try {
    const decrypted = decryptSensitiveObject<{ otp?: string }>(user.encryptedActivationOtp);
    expectedOtp = normalizeOtpInput(String(decrypted?.otp || ''));
  } catch {
    return {
      ok: false,
      code: 'NO_ACTIVATION_ISSUED',
      message: 'Activation code could not be verified. Please contact an administrator to reissue.',
    };
  }

  const expectedCode = normalizeMemberIdInput(user.activationMeta.memberCode || user.memberCode);
  const codeMatches = timingSafeStringEqual(submittedCode, expectedCode);
  const otpMatches = Boolean(expectedOtp) && timingSafeStringEqual(submittedOtp, expectedOtp);

  if (!codeMatches || !otpMatches) {
    user.activationMeta.failedAttempts =
      nowMs - lastFailedMs >= LOCKOUT_WINDOW_MS ? 1 : attempts + 1;
    user.activationMeta.lastFailedAt = nowIso;
    return {
      ok: false,
      code: 'INVALID_ACTIVATION_CODES',
      message:
        'The Member ID or 6-digit Activation OTP does not match. Please double-check your email or ask an Amanah administrator by phone.',
    };
  }

  // Successful verification & final membership agreement acceptance
  user.status = 'active';
  user.memberCode = expectedCode;
  user.activationMeta.activatedAt = nowIso;
  user.activationMeta.agreementAcceptedAt = nowIso;
  user.activationMeta.failedAttempts = 0;
  user.activationMeta.lastFailedAt = undefined;
  // Clear encrypted OTP from user record while keeping it permanently burned in usedActivationOtps
  user.encryptedActivationOtp = undefined;

  state.usedActivationOtps = Array.isArray(state.usedActivationOtps)
    ? state.usedActivationOtps
    : [];
  const ledgerEntry = state.usedActivationOtps.find(
    (rec) => rec.otp === expectedOtp && rec.userId === user.id
  );
  if (ledgerEntry) {
    ledgerEntry.activatedAt = nowIso;
  } else {
    state.usedActivationOtps.unshift({
      id: `aotp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      otp: expectedOtp,
      userId: user.id,
      memberCode: expectedCode,
      issuedAt: user.activationMeta.issuedAt,
      activatedAt: nowIso,
    });
  }

  queueEmailNotification(state, {
    type: 'signup_approved',
    recipientEmail: user.email,
    recipientName: user.name,
    recipientUserId: user.id,
    subject: `Welcome to ${state.fundConfig.fundName} — Membership Activated (${expectedCode})`,
    body: `Assalamu Alaikum ${user.name}, your Member ID (${expectedCode}) and 6-digit Activation OTP have been verified and your final cooperative membership agreement is now active. Welcome to ${state.fundConfig.fundName}!`,
    relatedId: user.id,
  });

  const actorSummary: PublicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    memberCode: expectedCode,
    status: 'active',
    joinedAt: user.joinedAt,
  };

  appendAuditLog(state, {
    actor: actorSummary,
    action: 'MEMBER_ACTIVATION_COMPLETED',
    resourceType: 'auth',
    resourceId: user.id,
    summary: `${user.name} (${expectedCode}) verified Member ID & 6-digit OTP and confirmed final membership agreement to join Amanah`,
    payload: {
      userId: user.id,
      memberCode: expectedCode,
      activatedAt: nowIso,
      agreementAcceptedAt: nowIso,
    },
  });

  return {
    ok: true,
    user,
    activatedAt: nowIso,
  };
}
