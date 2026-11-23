import { describe, expect, it } from 'vitest';
import type { UserRegistrationDetails } from '../src/types/coop.ts';
import {
  buildDigitalAgreementQrPayload,
  generateAgreementQrDataUrl,
} from '../src/utils/agreementQr.ts';

function sampleRegistration(): UserRegistrationDetails {
  return {
    dateOfBirth: '1994-05-12',
    referenceMemberName: 'Bootstrap Member',
    mobile: '01700000000',
    occupation: 'Engineer',
    companyOrganization: 'Amanah Grid',
    nid: '1234567890123',
    presentAddress: 'Dhaka',
    permanentAddress: 'Dhaka',
    photoUrl: 'https://example.com/photo.jpg',
    signatureUrl: 'https://example.com/sig.png',
    digitalAgreement: {
      agreementId: 'AGR-20261122-AB12CD34',
      charterVersion: 'Constitution Charter (§4–§6 · VISION-36: 2027–2036)',
      signedAt: '2026-11-22T10:00:00.000Z',
      activatedAt: '2026-11-22T11:30:00.000Z',
      declarationText: 'Official declaration',
      sha256Hash: 'ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890',
      storageFormat: 'encrypted_json',
    },
  };
}

describe('Digital Agreement QR generator', () => {
  it('builds a deterministic verification payload without exposing sensitive NID or mobile PII', () => {
    const reg = sampleRegistration();
    const payload = buildDigitalAgreementQrPayload({
      applicantName: 'Tariqul Islam',
      memberCode: 'AMN-0007',
      status: 'active',
      submittedAt: '2026-11-22T10:00:00.000Z',
      fundName: 'Amanah Cooperative',
      registrationDetails: reg,
    });

    expect(payload).toContain('AMANAH COOPERATIVE — DIGITAL AGREEMENT');
    expect(payload).toContain('Agreement ID: AGR-20261122-AB12CD34');
    expect(payload).toContain('Member: Tariqul Islam');
    expect(payload).toContain('Member ID: AMN-0007');
    expect(payload).toContain('Status: Active Member');
    expect(payload).toContain('SHA-256: AB12CD34EF567890AB12CD34');
    expect(payload).not.toContain('1234567890123');
    expect(payload).not.toContain('01700000000');
  });

  it('produces a valid PNG data URL QR code image', async () => {
    const reg = sampleRegistration();
    const payload = buildDigitalAgreementQrPayload({
      applicantName: 'Tariqul Islam',
      memberCode: 'AMN-0007',
      status: 'active',
      registrationDetails: reg,
    });

    const dataUrl = await generateAgreementQrDataUrl(payload, 200);
    expect(dataUrl).toBeTruthy();
    expect(dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('falls back deterministically when digitalAgreement metadata is not attached yet', () => {
    const reg = sampleRegistration();
    delete reg.digitalAgreement;

    const payloadA = buildDigitalAgreementQrPayload({
      applicantName: 'Bootstrap Founder',
      memberCode: 'AMN-0001',
      status: 'active',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: reg,
    });
    const payloadB = buildDigitalAgreementQrPayload({
      applicantName: 'Bootstrap Founder',
      memberCode: 'AMN-0001',
      status: 'active',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: reg,
    });

    expect(payloadA).toBe(payloadB);
    expect(payloadA).toContain('Agreement ID: AGR-REC-');
  });
});
