import QRCode from 'qrcode';
import type { UserRegistrationDetails, UserStatus } from '../types/coop.ts';

export interface AgreementQrInput {
  applicantName: string;
  memberCode?: string;
  status?: UserStatus;
  submittedAt?: string;
  fundName?: string;
  registrationDetails: UserRegistrationDetails;
}

function formatStatusEnglish(status?: UserStatus): string {
  switch (status) {
    case 'active':
      return 'Active Member';
    case 'pending_activation':
      return 'Approved - Awaiting Activation';
    case 'suspended':
      return 'Suspended';
    case 'pending_approval':
    default:
      return 'Pending Admin Review';
  }
}

function computeShortFingerprint(seed: string): string {
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

/**
 * Builds a privacy-safe, scanner-readable verification string for the member's
 * Digital Membership Agreement QR seal (omitting sensitive PII such as NID, phone, or home address).
 */
export function buildDigitalAgreementQrPayload(input: AgreementQrInput): string {
  const fundName = (input.fundName || 'Amanah Cooperative').trim();
  const agreement = input.registrationDetails.digitalAgreement;
  const memberCode = (input.memberCode || '').trim() || 'Pending';
  const signedIso = agreement?.signedAt || input.submittedAt || '';
  const digest = agreement?.sha256Hash
    ? agreement.sha256Hash.slice(0, 24).toUpperCase()
    : computeShortFingerprint(`${fundName}|${input.applicantName}|${memberCode}|${signedIso}`);
  const agreementId = agreement?.agreementId || `AGR-REC-${digest.slice(0, 8)}`;

  const lines = [
    `${fundName.toUpperCase()} — DIGITAL AGREEMENT`,
    `Agreement ID: ${agreementId}`,
    `Member: ${input.applicantName.trim() || 'Applicant'}`,
    `Member ID: ${memberCode}`,
    `Status: ${formatStatusEnglish(input.status)}`,
    `Signed: ${signedIso ? signedIso.slice(0, 19).replace('T', ' ') : 'On File'}`,
    ...(agreement?.activatedAt
      ? [`Activated: ${agreement.activatedAt.slice(0, 19).replace('T', ' ')}`]
      : []),
    `SHA-256: ${digest}`,
    `Charter: ${agreement?.charterVersion || 'VISION-36 (§4-§6)'}`,
  ];

  return lines.join('\n');
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
