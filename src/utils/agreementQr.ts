import QRCode from 'qrcode';
import type { UserRegistrationDetails, UserStatus } from '../types/coop.ts';

export interface AgreementQrInput {
  applicantName: string;
  memberCode?: string;
  status?: UserStatus;
  submittedAt?: string;
  fundName?: string;
  registrationDetails: UserRegistrationDetails;
  origin?: string;
}

export function computeShortFingerprint(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((h2 << 6) >>> 0) + (h2 >>> 2);
    h2 >>>= 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.toUpperCase();
}

export function computeAgreementFallbackId(input: {
  applicantName: string;
  memberCode?: string;
  submittedAt?: string;
  fundName?: string;
  signedAt?: string;
}): string {
  const fundName = (input.fundName || 'Amanah Cooperative').trim();
  const memberCode = (input.memberCode || '').trim() || 'Pending';
  const signedIso = input.signedAt || input.submittedAt || '';
  const digest = computeShortFingerprint(
    `${fundName}|${input.applicantName}|${memberCode}|${signedIso}`
  );
  return `AGR-REC-${digest.slice(0, 8)}`;
}

/**
 * Resolves the canonical verification token used inside `/verify/<token>` URLs.
 * Prefers the immutable Digital Agreement ID, then assigned Member ID, then deterministic fallback ID.
 */
export function resolveAgreementVerifyToken(input: AgreementQrInput): string {
  const agreementId = input.registrationDetails.digitalAgreement?.agreementId?.trim();
  if (agreementId) {
    return agreementId;
  }

  const memberCode = (input.memberCode || '').trim();
  if (memberCode && memberCode.toUpperCase() !== 'PENDING') {
    return memberCode.toUpperCase();
  }

  return computeAgreementFallbackId({
    applicantName: input.applicantName,
    memberCode: input.memberCode,
    submittedAt: input.submittedAt,
    fundName: input.fundName,
    signedAt: input.registrationDetails.digitalAgreement?.signedAt,
  });
}

function resolveBaseOrigin(explicitOrigin?: string): string {
  const explicit = (explicitOrigin || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  const envUrl =
    typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_APP_URL || '').trim() : '';
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  return '';
}

/**
 * Builds the public verification URL path or absolute link for a Digital Membership Agreement QR code.
 */
export function buildDigitalAgreementVerifyUrl(input: AgreementQrInput): string {
  const token = resolveAgreementVerifyToken(input);
  const path = `/verify/${encodeURIComponent(token)}`;
  const origin = resolveBaseOrigin(input.origin);
  return origin ? `${origin}${path}` : path;
}

/**
 * Builds the QR payload for the member's Digital Membership Agreement seal.
 * Encodes strictly the public verification link without embedding raw PII.
 */
export function buildDigitalAgreementQrPayload(input: AgreementQrInput): string {
  return buildDigitalAgreementVerifyUrl(input);
}

/**
 * Generates a high-contrast PNG data URL QR code for embedding in both
 * the on-screen Digital Agreement paper preview and A4 PDF export.
 */
export async function generateAgreementQrDataUrl(
  payload: string,
  size = 240
): Promise<string | null> {
  if (!payload) return null;
  try {
    return await QRCode.toDataURL(payload, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch {
    return null;
  }
}
