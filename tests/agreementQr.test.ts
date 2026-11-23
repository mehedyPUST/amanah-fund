import { describe, expect, it } from 'vitest';
import { verifyDigitalAgreementByToken } from '../src/server/coopService.ts';
import { encryptSensitiveObject } from '../src/server/crypto.ts';
import type { VaultState } from '../src/server/db.ts';
import type { UserRegistrationDetails } from '../src/types/coop.ts';
import {
  buildDigitalAgreementQrPayload,
  buildDigitalAgreementVerifyUrl,
  generateAgreementQrDataUrl,
} from '../src/utils/agreementQr.ts';

function sampleRegistration(
  overrides: Partial<UserRegistrationDetails> = {}
): UserRegistrationDetails {
  return {
    nameBn: 'তারিকুল ইসলাম',
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
    ...overrides,
  };
}

function makeTestVaultState(): VaultState {
  const activeReg = sampleRegistration();
  const pendingReviewReg = sampleRegistration({
    digitalAgreement: {
      agreementId: 'AGR-20261123-REVIEW01',
      charterVersion: 'Constitution Charter (§4–§6 · VISION-36: 2027–2036)',
      signedAt: '2026-11-23T08:00:00.000Z',
      declarationText: 'Official declaration',
      sha256Hash: 'cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12',
      storageFormat: 'encrypted_json',
    },
  });
  const pendingActivationReg = sampleRegistration({
    digitalAgreement: {
      agreementId: 'AGR-20261124-ACTV0002',
      charterVersion: 'Constitution Charter (§4–§6 · VISION-36: 2027–2036)',
      signedAt: '2026-11-24T09:00:00.000Z',
      declarationText: 'Official declaration',
      sha256Hash: 'ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34',
      storageFormat: 'encrypted_json',
    },
  });
  const legacyReg = sampleRegistration({
    digitalAgreement: undefined,
  });
  const suspendedReg = sampleRegistration({
    digitalAgreement: {
      agreementId: 'AGR-20261120-SUSP0009',
      charterVersion: 'Constitution Charter (§4–§6 · VISION-36: 2027–2036)',
      signedAt: '2026-11-20T09:00:00.000Z',
      activatedAt: '2026-11-20T12:00:00.000Z',
      declarationText: 'Official declaration',
      sha256Hash: '99997890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34',
      storageFormat: 'encrypted_json',
    },
  });

  return {
    users: [
      {
        id: 'user-active-1',
        name: 'Tariqul Islam',
        email: 'tariqul@example.com',
        passwordHash: 'hashed-secret',
        role: 'member',
        memberCode: 'AMN-0007',
        status: 'active',
        joinedAt: '2026-11-22T10:00:00.000Z',
        encryptedRegistrationDetails: encryptSensitiveObject(activeReg),
        activationMeta: {
          memberCode: 'AMN-0007',
          issuedAt: '2026-11-22T10:45:00.000Z',
          issuedById: 'admin-1',
          issuedByName: 'Admin',
          emailSent: true,
          activatedAt: '2026-11-22T11:30:00.000Z',
        },
      },
      {
        id: 'user-pending-review-2',
        name: 'Hasan Mahmud',
        email: 'hasan@example.com',
        passwordHash: 'hashed-secret',
        role: 'member',
        memberCode: 'PENDING',
        status: 'pending_approval',
        joinedAt: '2026-11-23T08:00:00.000Z',
        encryptedRegistrationDetails: encryptSensitiveObject(pendingReviewReg),
      },
      {
        id: 'user-pending-activation-3',
        name: 'Karim Uddin',
        email: 'karim@example.com',
        passwordHash: 'hashed-secret',
        role: 'member',
        memberCode: 'AC008',
        status: 'pending_activation',
        joinedAt: '2026-11-24T09:00:00.000Z',
        encryptedRegistrationDetails: encryptSensitiveObject(pendingActivationReg),
        activationMeta: {
          memberCode: 'AC008',
          issuedAt: '2026-11-24T12:15:00.000Z',
          issuedById: 'admin-1',
          issuedByName: 'Admin',
          emailSent: true,
        },
      },
      {
        id: 'user-legacy-4',
        name: 'Bootstrap Founder',
        email: 'founder@example.com',
        passwordHash: 'hashed-secret',
        role: 'admin',
        memberCode: 'PENDING',
        status: 'active',
        joinedAt: '2026-01-01T00:00:00.000Z',
        encryptedRegistrationDetails: encryptSensitiveObject(legacyReg),
      },
      {
        id: 'user-suspended-5',
        name: 'Suspended Member',
        email: 'suspended@example.com',
        passwordHash: 'hashed-secret',
        role: 'member',
        memberCode: 'AC009',
        status: 'suspended',
        joinedAt: '2026-11-20T09:00:00.000Z',
        encryptedRegistrationDetails: encryptSensitiveObject(suspendedReg),
        activationMeta: {
          memberCode: 'AC009',
          issuedAt: '2026-11-20T10:00:00.000Z',
          issuedById: 'admin-1',
          issuedByName: 'Admin',
          emailSent: true,
          activatedAt: '2026-11-20T12:00:00.000Z',
        },
      },
    ],
    fundConfig: {
      id: 'default',
      fundName: 'Amanah Shariah Cooperative (VISION-36)',
      currency: 'BDT',
      monthlyContributionAmount: 5000,
      maxLoansPerYear: 2,
      maxLoanAmount: 50000,
      maxInstallmentMonths: 10,
      voteThresholdNumerator: 2,
      voteThresholdDenominator: 3,
      maturityDate: '2036-12-31',
      halalInvestmentThesis: 'Real economy halal ventures',
      updatedAt: '2026-11-22T00:00:00.000Z',
      updatedBy: 'admin-1',
    },
    contributions: [],
    loans: [],
    halalProjects: [],
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
  };
}

describe('Digital Agreement QR link generator & verification lookup', () => {
  it('builds strictly a single verification URL without multi-line text or sensitive PII', () => {
    const reg = sampleRegistration();
    const payload = buildDigitalAgreementQrPayload({
      applicantName: 'Tariqul Islam',
      memberCode: 'AMN-0007',
      status: 'active',
      submittedAt: '2026-11-22T10:00:00.000Z',
      fundName: 'Amanah Cooperative',
      registrationDetails: reg,
      origin: 'https://amanah.example.org/',
    });

    expect(payload).toBe('https://amanah.example.org/verify/AGR-20261122-AB12CD34');
    expect(payload).not.toContain('\n');
    expect(payload).not.toContain('1234567890123');
    expect(payload).not.toContain('01700000000');
  });

  it('produces a valid PNG data URL QR code image for the verification URL', async () => {
    const reg = sampleRegistration();
    const payload = buildDigitalAgreementQrPayload({
      applicantName: 'Tariqul Islam',
      memberCode: 'AMN-0007',
      status: 'active',
      registrationDetails: reg,
      origin: 'https://amanah.example.org',
    });

    const dataUrl = await generateAgreementQrDataUrl(payload, 200);
    expect(dataUrl).toBeTruthy();
    expect(dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('falls back deterministically when digitalAgreement metadata is not attached yet', () => {
    const reg = sampleRegistration();
    delete reg.digitalAgreement;

    // With assigned memberCode -> prefers memberCode
    const withCode = buildDigitalAgreementVerifyUrl({
      applicantName: 'Bootstrap Founder',
      memberCode: 'AC001',
      status: 'active',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: reg,
      origin: 'https://amanah.example.org',
    });
    expect(withCode).toBe('https://amanah.example.org/verify/AC001');

    // Without assigned memberCode (PENDING) -> deterministic AGR-REC-... link
    const urlA = buildDigitalAgreementQrPayload({
      applicantName: 'Bootstrap Founder',
      memberCode: 'PENDING',
      status: 'active',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: reg,
    });
    const urlB = buildDigitalAgreementQrPayload({
      applicantName: 'Bootstrap Founder',
      memberCode: 'PENDING',
      status: 'active',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: reg,
    });

    expect(urlA).toBe(urlB);
    expect(urlA).toMatch(/^\/verify\/AGR-REC-[A-F0-9]{8}$/);
  });

  it('verifies an active member by Agreement ID or Member ID and omits all PII', () => {
    const state = makeTestVaultState();

    const byAgreementId = verifyDigitalAgreementByToken(state, 'agr-20261122-ab12cd34');
    const byMemberCode = verifyDigitalAgreementByToken(state, 'AMN-0007');

    expect(byAgreementId).toEqual({
      found: true,
      projectHeading: 'Amanah Shariah Cooperative (VISION-36)',
      name: 'Tariqul Islam',
      nameBn: 'তারিকুল ইসলাম',
      memberCode: 'AMN-0007',
      agreementId: 'AGR-20261122-AB12CD34',
      joiningDate: '2026-11-22T10:00:00.000Z',
      approvalDate: '2026-11-22T10:45:00.000Z',
      activationDate: '2026-11-22T11:30:00.000Z',
      verified: true,
      active: true,
      status: 'active',
    });
    expect(byMemberCode).toEqual(byAgreementId);

    const serialized = JSON.stringify(byAgreementId);
    expect(serialized).not.toContain('tariqul@example.com');
    expect(serialized).not.toContain('1234567890123');
    expect(serialized).not.toContain('01700000000');
    expect(serialized).not.toContain('Dhaka');
    expect(serialized).not.toContain('hashed-secret');
  });

  it('reports pending approval, pending activation, suspended, and legacy fallback statuses accurately', () => {
    const state = makeTestVaultState();

    const pendingReview = verifyDigitalAgreementByToken(state, 'AGR-20261123-REVIEW01');
    expect(pendingReview).toMatchObject({
      name: 'Hasan Mahmud',
      memberCode: 'Pending',
      joiningDate: '2026-11-23T08:00:00.000Z',
      approvalDate: null,
      activationDate: null,
      verified: false,
      active: false,
      status: 'pending_approval',
    });

    const pendingActivation = verifyDigitalAgreementByToken(state, 'AC008');
    expect(pendingActivation).toMatchObject({
      name: 'Karim Uddin',
      memberCode: 'AC008',
      joiningDate: '2026-11-24T09:00:00.000Z',
      approvalDate: '2026-11-24T12:15:00.000Z',
      activationDate: null,
      verified: false,
      active: false,
      status: 'pending_activation',
    });

    const suspended = verifyDigitalAgreementByToken(state, 'AC009');
    expect(suspended).toMatchObject({
      name: 'Suspended Member',
      memberCode: 'AC009',
      activationDate: '2026-11-20T12:00:00.000Z',
      verified: true,
      active: false,
      status: 'suspended',
    });

    // Legacy user without digitalAgreement or memberCode resolves via deterministic fallback URL
    const legacyReg = sampleRegistration({ digitalAgreement: undefined });
    const legacyPath = buildDigitalAgreementQrPayload({
      applicantName: 'Bootstrap Founder',
      memberCode: 'PENDING',
      submittedAt: '2026-01-01T00:00:00.000Z',
      registrationDetails: legacyReg,
    });
    const legacyToken = legacyPath.replace('/verify/', '');
    const legacyVerified = verifyDigitalAgreementByToken(state, legacyToken);
    expect(legacyVerified).toMatchObject({
      name: 'Bootstrap Founder',
      activationDate: '2026-01-01T00:00:00.000Z',
      verified: true,
      active: true,
    });

    expect(verifyDigitalAgreementByToken(state, 'PENDING')).toBeNull();
    expect(verifyDigitalAgreementByToken(state, 'DOES-NOT-EXIST')).toBeNull();
    expect(verifyDigitalAgreementByToken(state, 'X'.repeat(130))).toBeNull();
  });
});
