import { describe, expect, it } from 'vitest';
import {
  appendAuditLog,
  applyOverdueChecksToState,
  buildDashboardOverview,
  buildManagerCycleSchedule,
  buildMemberPublicProfile,
  computeRequiredApprovals,
  evaluateLoanEligibility,
  extractMentionedUsers,
  hydrateLoanForViewer,
  validateAndNormalizeNominees,
} from '../src/server/coopService.ts';
import {
  computeSha256Hash,
  decryptSensitiveObject,
  encryptSensitiveObject,
} from '../src/server/crypto.ts';
import type { VaultState } from '../src/server/db.ts';
import { sanitizeUser } from '../src/server/auth.ts';
import {
  isValidFourDigitPin,
  registerDeviceOnUser,
  revokeDeviceOnUser,
  verifyRegisteredDevicePinLogin,
} from '../src/server/deviceAuthService.ts';
import {
  buildImageKitAuthHeader,
  buildImageKitTargetFolder,
  buildSemanticFileName,
  getImageKitConfig,
  uploadToImageKit,
  validateAndDecodeUpload,
} from '../src/server/imagekitStorage.ts';
import {
  buildOtpAuthUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/server/totp.ts';
import {
  buildEmailTemplatePreview,
  buildTransactionSummaryEmailPayload,
  formatSmtpErrorMessage,
  isFatalSmtpError,
  isSmtpAuthError,
  isSmtpConfigured,
  normalizeSmtpPass,
  resetSmtpAuthCooldown,
  sendRegistrationApprovedEmail,
  sendRegistrationPendingAdminEmail,
} from '../src/server/emailService.ts';
import {
  computeEmailQueueStats,
  computeRetryBackoffMs,
  enqueueEmailFailureInState,
  markQueueItemRetryFailedInState,
  markQueueItemSuccessInState,
  sanitizeQueueItemForMonitor,
  scheduleManualRetryInState,
} from '../src/server/emailQueueService.ts';
import {
  buildMonthlyFundSummaryData,
  generateMonthlyFundSummaryPdfBuffer,
  getPreviousMonthKey,
  isMonthlyPdfScheduleDue,
} from '../src/server/pdfSummaryService.ts';
import {
  extractPostUrlList,
  isSpamCheckBlockingPost,
  normalizeAndValidatePostLinks,
  parseTextWithLinks,
} from '../src/utils/communityLinks.ts';
import {
  analyzeCommunityPostSpamHeuristic,
  callGroqJson,
  extractJsonObjectFromText,
  extractUrlsFromPost,
  getGroqModel,
  shouldBlockCommunityPost,
  DEFAULT_GROQ_MODEL,
} from '../src/server/groqService.ts';
import {
  EMAIL_TEMPLATE_KEYS,
  mergeEmailTemplateCollections,
  resolveEmailTemplate,
  sanitizeEmailHeaderColor,
} from '../src/utils/emailTemplates.ts';
import { BANK_PROVIDERS } from '../src/utils/format.ts';
import { createDefaultFaqs, sortFaqItems } from '../src/utils/faqDefaults.ts';
import type { LoanRequest, PublicUser } from '../src/types/coop.ts';

function makeBaseState(): VaultState {
  const nowYear = new Date().getUTCFullYear();
  return {
    users: [
      {
        id: 'u-1',
        name: 'Amina Rahman',
        email: 'amina@amanahcoop.org',
        passwordHash: 'hash1',
        role: 'admin',
        memberCode: 'AC-001',
        status: 'active',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'u-2',
        name: 'Bilal Hasan',
        email: 'bilal@amanahcoop.org',
        passwordHash: 'hash2',
        role: 'member',
        memberCode: 'AC-002',
        status: 'active',
        joinedAt: '2026-01-05T00:00:00.000Z',
      },
      {
        id: 'u-3',
        name: 'Fatima Zahra',
        email: 'fatima@amanahcoop.org',
        passwordHash: 'hash3',
        role: 'member',
        memberCode: 'AC-003',
        status: 'active',
        joinedAt: '2026-01-10T00:00:00.000Z',
      },
      {
        id: 'u-pending',
        name: 'Pending User',
        email: 'pending@amanahcoop.org',
        passwordHash: 'hash4',
        role: 'member',
        memberCode: 'AC-004',
        status: 'pending_approval',
        joinedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    fundConfig: {
      id: 'default-config',
      fundName: 'Amanah',
      currency: 'BDT',
      monthlyContributionAmount: 5000,
      maxLoansPerYear: 3,
      maxLoanAmount: 75000,
      maxInstallmentMonths: 12,
      guarantorThresholdAmount: 40000,
      requiredGuarantorsCount: 1,
      voteThresholdNumerator: 2,
      voteThresholdDenominator: 3,
      maturityDate: `${nowYear + 2}-12-31`,
      halalInvestmentThesis: 'Halal asset-backed ventures post maturity.',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'Amina Rahman',
    },
    contributions: [
      {
        id: 'c-1',
        userId: 'u-1',
        memberName: 'Amina Rahman',
        memberCode: 'AC-001',
        billingMonth: `${nowYear}-01`,
        amount: 10000,
        channel: 'bank',
        providerName: 'Islami Bank',
        maskedReference: '••••1234',
        encryptedDetails: encryptSensitiveObject({ referenceId: 'TRX1234', senderAccount: '00112233' }),
        status: 'approved',
        submittedAt: '2026-01-15T10:00:00.000Z',
        entryHash: 'hash-c1',
      },
      {
        id: 'c-2',
        userId: 'u-2',
        memberName: 'Bilal Hasan',
        memberCode: 'AC-002',
        billingMonth: `${nowYear}-01`,
        amount: 5000,
        channel: 'mfs',
        providerName: 'bKash',
        maskedReference: '••••5678',
        encryptedDetails: encryptSensitiveObject({ referenceId: 'BK5678', senderAccount: '01700005678' }),
        status: 'approved',
        submittedAt: '2026-01-16T10:00:00.000Z',
        entryHash: 'hash-c2',
      },
    ],
    loans: [],
    halalProjects: [
      {
        id: 'proj-1',
        title: 'Solar Irrigation',
        sector: 'Clean Energy',
        shariahStructure: 'Musharakah',
        targetAllocation: 50000,
        projectedAnnualReturn: '12%',
        riskTier: 'Balanced',
        shariahScholarNote: 'Asset-backed lease.',
        proposedBy: 'Amina Rahman',
        createdAt: '2026-01-20T00:00:00.000Z',
        status: 'active_post_maturity',
        votingStatus: 'approved',
        votes: [],
        requiredApprovals: 2,
        totalEligibleVoters: 3,
        distributions: [
          {
            id: 'dist-1',
            periodLabel: 'FY26 Q1',
            realizedProfit: 3000,
            coopSharePct: 100,
            distributablePool: 3000,
            distributedAt: '2026-03-01T00:00:00.000Z',
            distributedBy: 'Amina Rahman',
            allocations: [
              {
                userId: 'u-1',
                memberName: 'Amina Rahman',
                memberCode: 'AC-001',
                contributionWeightPct: 66.67,
                payoutAmount: 2000,
              },
              {
                userId: 'u-2',
                memberName: 'Bilal Hasan',
                memberCode: 'AC-002',
                contributionWeightPct: 33.33,
                payoutAmount: 1000,
              },
            ],
          },
        ],
      },
    ],
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
    privateMessages: [],
    decisionPolls: [],
    meetings: [],
    profileChangeRequests: [],
  };
}

describe('AES-256-GCM cryptography & SHA-256 integrity', () => {
  it('encrypts and decrypts sensitive objects accurately', () => {
    const secretPayload = { referenceId: 'IBBL-998877', senderAccount: '01711223344', notes: 'Advance' };
    const envelope = encryptSensitiveObject(secretPayload);
    expect(envelope.keyVersion).toBe('aes-256-gcm-v1');
    expect(envelope.ciphertext).not.toContain('IBBL-998877');
    const decrypted = decryptSensitiveObject<typeof secretPayload>(envelope);
    expect(decrypted).toEqual(secretPayload);
  });

  it('produces deterministic SHA-256 hashes for identical structures', () => {
    const h1 = computeSha256Hash({ id: 'loan-1', amount: 15000 });
    const h2 = computeSha256Hash({ id: 'loan-1', amount: 15000 });
    const h3 = computeSha256Hash({ id: 'loan-1', amount: 15001 });
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

describe('TOTP Two-Factor Authentication helpers', () => {
  it('generates valid Base32 secrets, otpauth URIs, and verifies 6-digit codes', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const uri = buildOtpAuthUri({ secret, accountEmail: 'admin@amanahcoop.org' });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(secret);

    const nowMs = 1_760_000_000_000;
    const code = generateTotpCode(secret, nowMs);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, nowMs)).toBe(true);
    expect(verifyTotpCode(secret, code, nowMs + 30_000)).toBe(true);
    expect(verifyTotpCode(secret, '000000', nowMs + 600_000)).toBe(false);
  });
});

describe('Cooperative accounting, 2/3 quorum & vote anonymization', () => {
  it('computes 2/3 supermajority quorum strictly from active members', () => {
    const state = makeBaseState();
    const { activeVoters, requiredApprovals } = computeRequiredApprovals(state);
    expect(activeVoters).toBe(3); // excludes pending_approval u-pending
    expect(requiredApprovals).toBe(2); // ceil(3 * 2 / 3) = 2
  });

  it('computes Central Fund Balance and Personal Cooperative Equity accurately', () => {
    const state = makeBaseState();
    const loan: LoanRequest = {
      id: 'loan-1',
      borrowerId: 'u-2',
      borrowerName: 'Bilal Hasan',
      borrowerCode: 'AC-002',
      amount: 6000,
      installmentMonths: 3,
      monthlyInstallment: 2000,
      purpose: 'Medical expense',
      encryptedSensitiveNotes: encryptSensitiveObject({
        emergencyContext: 'Clinic bill',
        disbursementAccount: '01700005678',
        channel: 'mfs',
        provider: 'bKash',
      }),
      status: 'active',
      eligibilitySnapshot: evaluateLoanEligibility(state, 'u-2'),
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 3,
      installments: [
        { installmentNumber: 1, dueDate: '2026-02-15', amount: 2000, paidAmount: 2000, status: 'paid' },
        { installmentNumber: 2, dueDate: '2026-03-15', amount: 2000, paidAmount: 0, status: 'scheduled' },
        { installmentNumber: 3, dueDate: '2026-04-15', amount: 2000, paidAmount: 0, status: 'scheduled' },
      ],
      totalRepaid: 2000,
      remainingBalance: 4000,
      requestedAt: '2026-01-20T00:00:00.000Z',
      entryHash: 'hash-l1',
    };
    state.loans.push(loan);

    const viewerBilal: PublicUser = {
      id: 'u-2',
      name: 'Bilal Hasan',
      email: 'bilal@amanahcoop.org',
      role: 'member',
      memberCode: 'AC-002',
      status: 'active',
      joinedAt: '2026-01-05T00:00:00.000Z',
    };

    const overview = buildDashboardOverview(state, viewerBilal);
    // + 15000 approved contributions - 6000 approved loan + 2000 repaid = 11000
    expect(overview.treasury.centralBalance).toBe(11000);
    // Bilal contributed 5000, owes 4000 remaining, earned 1000 Halal profit => 2000 equity
    expect(overview.personal.totalProfitDistributed).toBe(1000);
    expect(overview.personal.cooperativeEquity).toBe(2000);
  });

  it('anonymizes other voters while keeping self ballot identifiable', () => {
    const state = makeBaseState();
    const loan: LoanRequest = {
      id: 'loan-anon',
      borrowerId: 'u-3',
      borrowerName: 'Fatima Zahra',
      borrowerCode: 'AC-003',
      amount: 3000,
      installmentMonths: 3,
      monthlyInstallment: 1000,
      purpose: 'Tuition',
      encryptedSensitiveNotes: encryptSensitiveObject({
        emergencyContext: 'Semester fee',
        disbursementAccount: '01800001111',
        channel: 'mfs',
        provider: 'Nagad',
      }),
      status: 'pending_vote',
      eligibilitySnapshot: evaluateLoanEligibility(state, 'u-3'),
      votes: [
        {
          voterId: 'u-1',
          voterName: 'Amina Rahman',
          voterRole: 'admin',
          decision: 'approve',
          castAt: '2026-02-01T00:00:00.000Z',
          signatureHash: 'sig-aaaa1111bbbb2222',
        },
        {
          voterId: 'u-2',
          voterName: 'Bilal Hasan',
          voterRole: 'member',
          decision: 'approve',
          castAt: '2026-02-01T01:00:00.000Z',
          signatureHash: 'sig-cccc3333dddd4444',
        },
      ],
      requiredApprovals: 2,
      totalEligibleVoters: 3,
      installments: [],
      totalRepaid: 0,
      remainingBalance: 3000,
      requestedAt: '2026-02-01T00:00:00.000Z',
      entryHash: 'hash-la',
    };

    const viewerAdmin: PublicUser = {
      id: 'u-1',
      name: 'Amina Rahman',
      email: 'amina@amanahcoop.org',
      role: 'admin',
      memberCode: 'AC-001',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00.000Z',
    };
    const viewerBilal: PublicUser = {
      id: 'u-2',
      name: 'Bilal Hasan',
      email: 'bilal@amanahcoop.org',
      role: 'member',
      memberCode: 'AC-002',
      status: 'active',
      joinedAt: '2026-01-05T00:00:00.000Z',
    };
    const viewerFatima: PublicUser = {
      id: 'u-3',
      name: 'Fatima Zahra',
      email: 'fatima@amanahcoop.org',
      role: 'member',
      memberCode: 'AC-003',
      status: 'active',
      joinedAt: '2026-01-10T00:00:00.000Z',
    };

    // Unrevealed ongoing vote: Admin gets full adminVoteLedger + tallies
    const hydratedAdmin = hydrateLoanForViewer(loan, viewerAdmin);
    expect(hydratedAdmin.adminVoteLedger).toHaveLength(2);
    expect(hydratedAdmin.approveCount).toBe(2);
    expect(hydratedAdmin.totalVotesCast).toBe(2);

    // Unrevealed ongoing vote: Regular member only sees own ballot + totalVotesCast, NOT live tallies or others' votes
    const hydratedMember = hydrateLoanForViewer(loan, viewerBilal);
    expect(hydratedMember.adminVoteLedger).toBeUndefined();
    expect(hydratedMember.approveCount).toBeUndefined();
    expect(hydratedMember.rejectCount).toBeUndefined();
    expect(hydratedMember.totalVotesCast).toBe(2);
    expect(hydratedMember.votes).toHaveLength(1);
    expect(hydratedMember.votes[0].isSelf).toBe(true);
    expect(hydratedMember.votes[0].voterId).toBe('u-2');

    const hydratedNonVoter = hydrateLoanForViewer(loan, viewerFatima);
    expect(hydratedNonVoter.votes).toHaveLength(0);
    expect(hydratedNonVoter.approveCount).toBeUndefined();
  });

  it('excludes un-disbursed loans from fund balance and excludes Admin from contribution/loan rules', () => {
    const state = makeBaseState();
    state.loans.push({
      id: 'loan-pending-disb',
      borrowerId: 'u-2',
      borrowerName: 'Bilal Hasan',
      borrowerCode: 'AC-002',
      amount: 4000,
      installmentMonths: 2,
      monthlyInstallment: 2000,
      purpose: 'Pending disbursement test',
      encryptedSensitiveNotes: encryptSensitiveObject({
        emergencyContext: 'Test',
        disbursementAccount: '01700005678',
        channel: 'mfs',
        provider: 'bKash',
      }),
      status: 'approved_pending_disbursement',
      eligibilitySnapshot: evaluateLoanEligibility(state, 'u-2'),
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 2,
      installments: [],
      totalRepaid: 0,
      remainingBalance: 4000,
      requestedAt: '2026-02-01T00:00:00.000Z',
      entryHash: 'hash-lpd',
    });

    const viewerBilal: PublicUser = {
      id: 'u-2',
      name: 'Bilal Hasan',
      email: 'bilal@amanahcoop.org',
      role: 'member',
      memberCode: 'AC-002',
      status: 'active',
      joinedAt: '2026-01-05T00:00:00.000Z',
    };
    const overview = buildDashboardOverview(state, viewerBilal);
    // Un-disbursed approved_pending_disbursement loan must NOT deduct from centralBalance
    expect(overview.treasury.centralBalance).toBe(15000);
    expect(overview.treasury.currentBalance).toBe(15000);
    // Admin u-1 is excluded from contributingMembersCount (only u-2 and u-3 contribute)
    expect(overview.treasury.contributingMembersCount).toBe(2);
    expect(overview.treasury.thisMonthClearanceTotalMembers).toBe(2);
    expect(overview.treasury.thisMonthContributionTarget).toBe(10000);
    // Admin is ineligible to borrow Qard Hasan
    const adminElig = evaluateLoanEligibility(state, 'u-1');
    expect(adminElig.eligible).toBe(false);
  });
});

describe('Overdue detection scheduler & loan eligibility blocking', () => {
  it('marks past-due scheduled installments overdue once and blocks new loans', () => {
    const state = makeBaseState();
    const pastDate = '2025-01-10';
    state.loans.push({
      id: 'loan-past',
      borrowerId: 'u-3',
      borrowerName: 'Fatima Zahra',
      borrowerCode: 'AC-003',
      amount: 4000,
      installmentMonths: 2,
      monthlyInstallment: 2000,
      purpose: 'Equipment',
      encryptedSensitiveNotes: encryptSensitiveObject({
        emergencyContext: 'Repair',
        disbursementAccount: '01900001234',
        channel: 'bank',
        provider: 'DBBL',
      }),
      status: 'active',
      eligibilitySnapshot: evaluateLoanEligibility(state, 'u-3'),
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 3,
      installments: [
        { installmentNumber: 1, dueDate: pastDate, amount: 2000, paidAmount: 0, status: 'scheduled' },
        { installmentNumber: 2, dueDate: '2099-01-10', amount: 2000, paidAmount: 0, status: 'scheduled' },
      ],
      totalRepaid: 0,
      remainingBalance: 4000,
      requestedAt: '2024-12-01T00:00:00.000Z',
      entryHash: 'hash-lp',
    });

    const firstRun = applyOverdueChecksToState(state, new Date('2026-05-01T12:00:00.000Z'));
    expect(firstRun.changed).toBe(true);
    expect(firstRun.newlyOverdue).toHaveLength(1);
    expect(state.loans[0].installments[0].status).toBe('overdue');
    expect(state.emailNotifications).toHaveLength(1);

    // Second pass should not duplicate notifications
    const secondRun = applyOverdueChecksToState(state, new Date('2026-05-02T12:00:00.000Z'));
    expect(secondRun.changed).toBe(false);
    expect(state.emailNotifications).toHaveLength(1);

    const elig = evaluateLoanEligibility(state, 'u-3');
    expect(elig.noOverdueInstallments).toBe(false);
    expect(elig.overdueCount).toBe(1);
    expect(elig.eligible).toBe(false);
  });
});

describe('Community @mention extraction', () => {
  it('matches active users by @name and @memberCode while excluding author and pending users', () => {
    const state = makeBaseState();
    const mentioned = extractMentionedUsers(
      'Salam @Bilal Hasan and @AC-003, please check @Pending User',
      state.users,
      'u-1'
    );
    expect(mentioned.map((m) => m.id)).toEqual(['u-2', 'u-3']);
  });
});

describe('System Audit Logs immutability & hash chaining', () => {
  it('appends timestamped, AES-256-GCM encrypted, SHA-256 hash-chained administrative actions', () => {
    const state = makeBaseState();
    const adminUser: PublicUser = {
      id: 'u-1',
      name: 'Amina Rahman',
      email: 'amina@amanahcoop.org',
      role: 'admin',
      memberCode: 'AC-001',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00.000Z',
    };

    appendAuditLog(state, {
      actor: adminUser,
      action: 'MEMBER_SIGNUP_APPROVED',
      resourceType: 'auth',
      resourceId: 'u-pending',
      summary: 'Amina Rahman approved Pending User (AC-004)',
      payload: {
        targetUserId: 'u-pending',
        changes: { status: { from: 'pending_approval', to: 'active' } },
      },
    });

    appendAuditLog(state, {
      actor: adminUser,
      action: 'FUND_POLICY_UPDATED',
      resourceType: 'config',
      resourceId: 'default-config',
      summary: 'Amina Rahman updated cooperative policy',
      payload: {
        changes: { maxLoansPerYear: { from: 3, to: 4 } },
      },
    });

    expect(state.auditLogs).toHaveLength(2);
    const [latest, older] = state.auditLogs;
    expect(latest.prevHash).toBe(older.entryHash);
    expect(latest.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const decryptedLatest = decryptSensitiveObject<Record<string, unknown>>(latest.encryptedPayload);
    const recomputedHash = computeSha256Hash({
      id: latest.id,
      timestamp: latest.timestamp,
      actorId: latest.actorId,
      action: latest.action,
      resourceId: latest.resourceId,
      prevHash: latest.prevHash,
      payload: decryptedLatest,
    });
    expect(recomputedHash).toBe(latest.entryHash);
  });
});

describe('Member public profile builder', () => {
  it('returns community posts, about info, and fund summary while protecting sensitive KYC fields and pending accounts', () => {
    const state = makeBaseState();
    const bilal = state.users.find((u) => u.id === 'u-2')!;
    bilal.encryptedRegistrationDetails = encryptSensitiveObject({
      mobile: '+8801700005678',
      occupation: 'Software Engineer',
      companyOrganization: 'Amanah Tech',
      presentAddress: 'Dhaka, Bangladesh',
      referenceMemberName: 'Amina Rahman',
      nid: '1999123456789',
      dateOfBirth: '1999-01-01',
      permanentAddress: 'Secret Village Address',
      photoUrl: '',
    });

    state.loans.push({
      id: 'loan-profile-1',
      borrowerId: 'u-2',
      borrowerName: 'Bilal Hasan',
      borrowerCode: 'AC-002',
      amount: 6000,
      installmentMonths: 3,
      monthlyInstallment: 2000,
      purpose: 'Medical support',
      encryptedSensitiveNotes: encryptSensitiveObject({
        emergencyContext: 'Clinic bill',
        disbursementAccount: '01700005678',
        channel: 'mfs',
        provider: 'bKash',
      }),
      status: 'active',
      eligibilitySnapshot: evaluateLoanEligibility(state, 'u-2'),
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 3,
      installments: [
        { installmentNumber: 1, dueDate: '2026-02-15', amount: 2000, paidAmount: 2000, status: 'paid' },
        { installmentNumber: 2, dueDate: '2026-03-15', amount: 2000, paidAmount: 0, status: 'scheduled' },
        { installmentNumber: 3, dueDate: '2026-04-15', amount: 2000, paidAmount: 0, status: 'scheduled' },
      ],
      totalRepaid: 2000,
      remainingBalance: 4000,
      requestedAt: '2026-01-20T00:00:00.000Z',
      entryHash: 'hash-lp1',
    });

    state.communityPosts.push(
      {
        id: 'post-vis',
        authorId: 'u-2',
        authorName: 'Bilal Hasan',
        authorCode: 'AC-002',
        authorRole: 'member',
        category: 'General',
        title: 'Monthly Treasury Update',
        content: 'Glad to contribute this month!',
        reactions: [
          {
            userId: 'u-1',
            userName: 'Amina Rahman',
            type: 'like',
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        comments: [],
        isPinned: false,
        commentsLocked: false,
        status: 'active',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'post-hidden',
        authorId: 'u-2',
        authorName: 'Bilal Hasan',
        authorCode: 'AC-002',
        authorRole: 'member',
        category: 'General',
        title: 'Hidden Post',
        content: 'Moderated post',
        reactions: [],
        comments: [],
        isPinned: false,
        commentsLocked: false,
        status: 'hidden',
        createdAt: '2026-02-02T00:00:00.000Z',
      },
      {
        id: 'post-other',
        authorId: 'u-1',
        authorName: 'Amina Rahman',
        authorCode: 'AC-001',
        authorRole: 'admin',
        category: 'Announcements',
        title: 'Other Member Post',
        content: 'Hello everyone',
        reactions: [],
        comments: [
          {
            id: 'cm-1',
            postId: 'post-other',
            authorId: 'u-2',
            authorName: 'Bilal Hasan',
            authorCode: 'AC-002',
            authorRole: 'member',
            content: 'Thank you!',
            createdAt: '2026-02-03T00:00:00.000Z',
          },
        ],
        isPinned: true,
        commentsLocked: false,
        status: 'active',
        createdAt: '2026-02-02T00:00:00.000Z',
      }
    );

    const viewerFatima: PublicUser = {
      id: 'u-3',
      name: 'Fatima Zahra',
      email: 'fatima@amanahcoop.org',
      role: 'member',
      memberCode: 'AC-003',
      status: 'active',
      joinedAt: '2026-01-10T00:00:00.000Z',
    };

    const profile = buildMemberPublicProfile(state, 'u-2', viewerFatima);
    expect(profile).not.toBeNull();
    expect(profile?.isSelf).toBe(false);
    expect(profile?.about.occupation).toBe('Software Engineer');
    expect(profile?.about.companyOrganization).toBe('Amanah Tech');
    expect(profile?.about.postsCount).toBe(1);
    expect(profile?.about.commentsCount).toBe(1);
    expect(profile?.about.reactionsReceivedCount).toBe(1);

    // Ensure private KYC & transaction IDs are never exposed
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('1999123456789');
    expect(serialized).not.toContain('Secret Village Address');
    expect(serialized).not.toContain('BK5678');

    // Fund summary assertions
    expect(profile?.fundSummary.totalContributed).toBe(5000);
    expect(profile?.fundSummary.totalProfitDistributed).toBe(1000);
    expect(profile?.fundSummary.activeLoanBalance).toBe(4000);
    expect(profile?.fundSummary.cooperativeEquity).toBe(2000);
    expect(profile?.fundSummary.recentContributions).toHaveLength(1);
    expect(profile?.communityPosts.map((p) => p.id)).toEqual(['post-vis']);

    // Pending account is hidden from regular members
    expect(buildMemberPublicProfile(state, 'u-pending', viewerFatima)).toBeNull();
  });
});

describe('Manager rotation cycle timeline schedule', () => {
  it('generates historical, current, and future rotation slots with accurate tenure dates', () => {
    const state = makeBaseState();
    state.fundConfig.managerCycleMonths = 3;
    state.fundConfig.managerCycleStartDate = '2026-01-01';
    state.users.push({
      id: 'u-4',
      name: 'Tariq Mahmud',
      email: 'tariq@amanahcoop.org',
      passwordHash: 'hash5',
      role: 'manager',
      memberCode: 'AC-005',
      status: 'active',
      joinedAt: '2026-01-15T00:00:00.000Z',
    });

    // Reference date 2026-11-15 falls inside Cycle #4 (2026-10-01 to 2026-12-31)
    const schedule = buildManagerCycleSchedule(state, new Date('2026-11-15T12:00:00.000Z'));

    expect(schedule.cycleMonths).toBe(3);
    expect(schedule.eligibleMembersCount).toBe(3); // excludes admin (u-1) & pending (u-pending)
    expect(schedule.currentCycleNumber).toBe(4);
    expect(schedule.currentSlot).toMatchObject({
      cycleNumber: 4,
      memberId: 'u-2', // round-robin index 3 % 3 = 0 => first eligible member u-2
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'current',
    });
    expect(schedule.nextSlot).toMatchObject({
      cycleNumber: 5,
      memberId: 'u-3',
      startDate: '2027-01-01',
      endDate: '2027-03-31',
      status: 'upcoming',
    });

    const completed = schedule.slots.filter((s) => s.status === 'completed');
    const current = schedule.slots.filter((s) => s.status === 'current');
    const upcoming = schedule.slots.filter((s) => s.status === 'upcoming');

    expect(completed.map((s) => s.cycleNumber)).toEqual([1, 2, 3]);
    expect(completed[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      memberId: 'u-2',
    });
    expect(current).toHaveLength(1);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Nominee registration validation', () => {
  it('allows a single female nominee without photo and defaults share to 100%', () => {
    const res = validateAndNormalizeNominees([
      {
        name: 'Fatema Begum',
        dateOfBirth: '1975-04-12',
        gender: 'female',
        occupation: 'Homemaker',
        relation: 'Mother',
        nidOrBirthReg: '19751234567890123',
        address: 'House 12, Dhanmondi, Dhaka',
      },
    ]);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.nominees).toHaveLength(1);
      expect(res.nominees[0].sharePercentage).toBe(100);
      expect(res.nominees[0].photoUrl).toBeUndefined();
      expect(res.nominees[0].mobile).toBeUndefined();
    }
  });

  it('requires a photo when nominee gender is male or other', () => {
    const missingPhoto = validateAndNormalizeNominees([
      {
        name: 'Karim Uddin',
        dateOfBirth: '1990-06-20',
        gender: 'male',
        occupation: 'Engineer',
        relation: 'Brother',
        nidOrBirthReg: '19901234567890123',
        mobile: '01711223344',
        address: 'Banani, Dhaka',
      },
    ]);

    expect(missingPhoto.ok).toBe(false);

    const withPhoto = validateAndNormalizeNominees([
      {
        name: 'Karim Uddin',
        dateOfBirth: '1990-06-20',
        gender: 'male',
        occupation: 'Engineer',
        relation: 'Brother',
        nidOrBirthReg: '19901234567890123',
        mobile: '01711223344',
        address: 'Banani, Dhaka',
        photoUrl: 'https://i.ibb.co/example/karim.jpg',
      },
    ]);

    expect(withPhoto.ok).toBe(true);
    if (withPhoto.ok) {
      expect(withPhoto.nominees[0].mobile).toBe('01711223344');
      expect(withPhoto.nominees[0].photoUrl).toBe('https://i.ibb.co/example/karim.jpg');
    }
  });

  it('requires share percentages summing to 100% when multiple nominees are provided', () => {
    const badTotal = validateAndNormalizeNominees([
      {
        name: 'Nusrat Jahan',
        dateOfBirth: '1994-03-10',
        gender: 'female',
        occupation: 'Doctor',
        relation: 'Spouse',
        sharePercentage: 60,
        nidOrBirthReg: '19941122334455',
        address: 'Uttara, Dhaka',
      },
      {
        name: 'Tariq Hasan',
        dateOfBirth: '2018-09-01',
        gender: 'male',
        occupation: 'Student',
        relation: 'Son',
        sharePercentage: 30,
        nidOrBirthReg: 'BR-201899887766',
        address: 'Uttara, Dhaka',
        photoUrl: 'https://i.ibb.co/example/tariq.jpg',
      },
    ]);

    expect(badTotal.ok).toBe(false);

    const validTotal = validateAndNormalizeNominees([
      {
        name: 'Nusrat Jahan',
        dateOfBirth: '1994-03-10',
        gender: 'female',
        occupation: 'Doctor',
        relation: 'Spouse',
        sharePercentage: 60,
        nidOrBirthReg: '19941122334455',
        address: 'Uttara, Dhaka',
      },
      {
        name: 'Tariq Hasan',
        dateOfBirth: '2018-09-01',
        gender: 'male',
        occupation: 'Student',
        relation: 'Son',
        sharePercentage: 40,
        nidOrBirthReg: 'BR-201899887766',
        address: 'Uttara, Dhaka',
        photoUrl: 'https://i.ibb.co/example/tariq.jpg',
      },
    ]);

    expect(validTotal.ok).toBe(true);
    if (validTotal.ok) {
      expect(validTotal.nominees.map((n) => n.sharePercentage)).toEqual([60, 40]);
    }
  });
});

describe('ImageKit.io media storage, semantic naming & PDF/photo validation', () => {
  it('detects ImageKit.io config, formats Basic auth headers, and routes semantic subfolders', async () => {
    const cfg = getImageKitConfig({
      NODE_ENV: 'test',
      IMAGEKIT_PRIVATE_KEY: 'private_test_key_123',
      IMAGEKIT_PUBLIC_KEY: 'public_test_key_123',
      IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/amanah/',
      IMAGEKIT_FOLDER: 'coop-docs/',
    });
    expect(cfg).toEqual({
      privateKey: 'private_test_key_123',
      publicKey: 'public_test_key_123',
      urlEndpoint: 'https://ik.imagekit.io/amanah',
      folder: '/coop-docs',
    });

    expect(buildImageKitTargetFolder('/coop-docs', 'cooperative-constitution')).toBe(
      '/coop-docs/governance'
    );
    expect(buildImageKitTargetFolder('/coop-docs', 'member-signed-agreement')).toBe(
      '/coop-docs/kyc'
    );
    expect(buildImageKitTargetFolder('/coop-docs', 'contribution-receipt')).toBe(
      '/coop-docs/receipts'
    );
    expect(buildImageKitTargetFolder('/coop-docs', 'community-post-photo')).toBe(
      '/coop-docs/community'
    );

    expect(buildImageKitAuthHeader('private_test_key_123')).toBe(
      `Basic ${Buffer.from('private_test_key_123:', 'utf8').toString('base64')}`
    );

    const calls: Array<{
      url: string;
      auth: string | null;
      fileName: string | null;
      folder: string | null;
      useUniqueFileName: string | null;
    }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const form = init?.body as FormData;
      const headers = init?.headers as Record<string, string>;
      calls.push({
        url: String(input),
        auth: headers.Authorization || null,
        fileName: String(form.get('fileName') || ''),
        folder: String(form.get('folder') || ''),
        useUniqueFileName: String(form.get('useUniqueFileName') || ''),
      });
      return new Response(
        JSON.stringify({
          fileId: 'ik_file_1',
          filePath: '/coop-docs/kyc/member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
          url: 'https://ik.imagekit.io/amanah/coop-docs/kyc/member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await uploadToImageKit({
      fileName: 'member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
      base64Payload: Buffer.from('%PDF-1.4\n%%EOF', 'utf8').toString('base64'),
      mimeType: 'application/pdf',
      category: 'member-signed-agreement',
      config: cfg!,
      fetchImpl: mockFetch,
    });

    expect(res).toEqual({
      fileId: 'ik_file_1',
      filePath: '/coop-docs/kyc/member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
      url: 'https://ik.imagekit.io/amanah/coop-docs/kyc/member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
      provider: 'imagekit',
      contentType: 'application/pdf',
    });
    expect(calls[0]).toEqual({
      url: 'https://upload.imagekit.io/api/v1/files/upload',
      auth: buildImageKitAuthHeader('private_test_key_123'),
      fileName: 'member-signed-agreement-bilal-hasan-2026-11-16-abc123.pdf',
      folder: '/coop-docs/kyc',
      useUniqueFileName: 'false',
    });
  });

  it('generates clean semantic filenames for documents and photos and validates genuine PDF/image headers', () => {
    expect(
      buildSemanticFileName({
        category: 'cooperative-constitution',
        subject: 'Cooperative Charter 2027-2036',
        ext: 'pdf',
        isPdf: true,
        dateStr: '2026-11-16',
        uniqueSuffix: 'a1b2c3',
      })
    ).toBe('cooperative-constitution-cooperative-charter-2027-2036-2026-11-16-a1b2c3.pdf');

    const validPdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf8').toString(
      'base64'
    );
    const decodedPdf = validateAndDecodeUpload({
      rawData: `data:application/pdf;base64,${validPdfBase64}`,
      rawName: 'IMG_00492.pdf',
      category: 'member-signed-agreement',
      subject: 'Bilal Hasan',
    });
    expect(decodedPdf.isPdf).toBe(true);
    expect(decodedPdf.mimeType).toBe('application/pdf');
    expect(decodedPdf.ext).toBe('pdf');
    expect(decodedPdf.category).toBe('member-signed-agreement');
    expect(decodedPdf.filename).toMatch(
      /^member-signed-agreement-bilal-hasan-\d{4}-\d{2}-\d{2}-[a-f0-9]+\.pdf$/
    );

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const decodedPng = validateAndDecodeUpload({
      rawData: `data:image/png;base64,${pngBytes.toString('base64')}`,
      rawName: 'DSC_8812.png',
      category: 'contribution-receipt',
      subject: 'AC-002-2026-11',
    });
    expect(decodedPng.isPdf).toBe(false);
    expect(decodedPng.mimeType).toBe('image/png');
    expect(decodedPng.ext).toBe('png');
    expect(decodedPng.category).toBe('contribution-receipt');
    expect(decodedPng.filename).toMatch(
      /^contribution-receipt-ac-002-2026-11-\d{4}-\d{2}-\d{2}-[a-f0-9]+\.png$/
    );

    const spoofedPdf = Buffer.from('NOT_A_REAL_PDF_FILE', 'utf8').toString('base64');
    expect(() =>
      validateAndDecodeUpload({
        rawData: `data:application/pdf;base64,${spoofedPdf}`,
        rawName: 'fake',
      })
    ).toThrow(/Invalid PDF file signature/);
  });

  it('validates text-only community post links and auto-linkifies inline photo/video URLs', () => {
    const valid = normalizeAndValidatePostLinks([
      { url: 'https://youtu.be/dQw4w9WgXcQ', label: 'Project Walkthrough' },
      { url: 'https://ik.imagekit.io/amanah/photo.jpg', label: 'Site Visit Photo' },
      { url: 'docs.google.com/document/d/123', label: 'Budget Sheet' },
    ]);
    expect(valid.error).toBeUndefined();
    expect(valid.links).toEqual([
      { url: 'https://youtu.be/dQw4w9WgXcQ', label: 'Project Walkthrough', kind: 'video' },
      {
        url: 'https://ik.imagekit.io/amanah/photo.jpg',
        label: 'Site Visit Photo',
        kind: 'photo',
      },
      {
        url: 'https://docs.google.com/document/d/123',
        label: 'Budget Sheet',
        kind: 'document',
      },
    ]);

    const unsafe = normalizeAndValidatePostLinks([{ url: 'javascript:alert(1)' }]);
    expect(unsafe.error).toMatch(/Invalid link URL/);

    const segments = parseTextWithLinks('Salam 🤝 watch https://youtu.be/abc123. Details soon!');
    expect(segments).toEqual([
      { type: 'text', value: 'Salam 🤝 watch ' },
      { type: 'link', value: 'https://youtu.be/abc123' },
      { type: 'text', value: '. Details soon!' },
    ]);
  });

  it('generates monthly fund summary PDF buffer with accurate totals and previous-month rollover key', () => {
    const state = makeBaseState();
    const nowYear = new Date().getUTCFullYear();
    const monthKey = `${nowYear}-01`;

    const summary = buildMonthlyFundSummaryData(state, monthKey);
    expect(summary.monthKey).toBe(monthKey);
    expect(summary.amanahHeight).toBe(15000);
    expect(summary.monthContributionsCollected).toBe(15000);
    expect(summary.clearedMembersCount).toBe(2);

    const { buffer, filename } = generateMonthlyFundSummaryPdfBuffer(state, monthKey);
    expect(filename).toBe(`amanah-monthly-summary-${monthKey}.pdf`);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    expect(getPreviousMonthKey(new Date('2027-01-02T00:00:00.000Z'))).toBe('2026-12');
    expect(getPreviousMonthKey(new Date('2027-03-15T12:00:00.000Z'))).toBe('2027-02');

    expect(isMonthlyPdfScheduleDue(new Date('2027-03-01T00:00:00.000Z'))).toBe(false);
    expect(isMonthlyPdfScheduleDue(new Date('2027-03-14T23:59:59.000Z'))).toBe(false);
    expect(isMonthlyPdfScheduleDue(new Date('2027-03-15T00:00:00.000Z'))).toBe(true);
    expect(isMonthlyPdfScheduleDue(new Date('2027-03-20T12:00:00.000Z'))).toBe(true);
  });

  it('formats transaction email summary payloads cleanly and checks SMTP env configuration', () => {
    expect(isSmtpConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isSmtpConfigured({ SMTP_HOST: 'smtp.example.org' } as unknown as NodeJS.ProcessEnv)).toBe(
      true
    );
    expect(normalizeSmtpPass(' abcd efgh ijkl mnop ', 'smtp.gmail.com')).toBe('abcdefghijklmnop');
    expect(normalizeSmtpPass('custom pass with spaces', 'smtp.custom.org')).toBe(
      'custom pass with spaces'
    );

    const gmailErrMsg = formatSmtpErrorMessage(
      new Error(
        'Invalid login: 534-5.7.9 Please log in with your web browser and then try again. For more information, go to https://support.google.com/mail/?p=InvalidSignIn'
      )
    );
    expect(gmailErrMsg).toContain('534-5.7.9');
    expect(gmailErrMsg).toContain('App Password');
    expect(isSmtpAuthError(gmailErrMsg)).toBe(true);
    expect(isFatalSmtpError(gmailErrMsg)).toBe(true);
    expect(isSmtpAuthError('535-5.7.8 Username and Password not accepted')).toBe(true);
    expect(isFatalSmtpError('ETIMEDOUT')).toBe(true);
    resetSmtpAuthCooldown();

    const payload = buildTransactionSummaryEmailPayload({
      to: 'bilal@amanahcoop.org',
      recipientName: 'Bilal Hasan',
      fundName: 'Amanah',
      currency: 'BDT',
      eventTitle: 'Monthly Contribution Approved',
      transactionType: 'Contribution Approval',
      referenceId: 'C-2026-01',
      amount: 5000,
      statusLabel: 'Approved',
      summaryText: 'Your monthly cooperative deposit has been credited.',
      details: [{ label: 'Billing Month', value: '2026-11' }],
      timestampIso: '2026-11-16T08:00:00.000Z',
    });

    expect(payload.subject).toContain('Monthly Contribution Approved');
    expect(payload.subject).toContain('5,000 BDT');
    expect(payload.subject).toContain('C-2026-01');
    expect(payload.text).toContain('Assalamu Alaikum Bilal Hasan');
    expect(payload.text).toContain('Billing Month: 2026-11');
    expect(payload.html).toContain('5,000 BDT');
  });

  it('exposes the full Bangladesh scheduled banks catalog and evaluates blocking loan eligibility checks', () => {
    expect(BANK_PROVIDERS.length).toBeGreaterThanOrEqual(60);
    expect(BANK_PROVIDERS).toContain('Islami Bank Bangladesh');
    expect(BANK_PROVIDERS).toContain('Sonali Bank');
    expect(BANK_PROVIDERS).toContain('BRAC Bank');

    const state = makeBaseState();
    const cycle3 = buildManagerCycleSchedule({
      ...state,
      fundConfig: { ...state.fundConfig, managerCycleMonths: 3, managerCycleStartDate: '2027-01-01' },
    });
    const cycle6 = buildManagerCycleSchedule({
      ...state,
      fundConfig: { ...state.fundConfig, managerCycleMonths: 6, managerCycleStartDate: '2027-01-01' },
    });
    expect(cycle3.cycleMonths).toBe(3);
    expect(cycle6.cycleMonths).toBe(6);

    const elig = evaluateLoanEligibility(state, state.users[1].id);
    expect(elig.eligible).toBe(true);
    expect(elig.reasons.length).toBeGreaterThan(0);
  });

  it('handles registration alert and approval emails safely without throwing when SMTP is unconfigured', async () => {
    const adminAlert = await sendRegistrationPendingAdminEmail({
      adminEmails: ['admin@amanahcoop.org'],
      applicantName: 'Nadia Karim',
      applicantCode: 'MEM-008',
      applicantEmail: 'nadia@amanahcoop.org',
      mobile: '01700000008',
      referenceMemberName: 'Ayesha Rahman',
      fundName: 'Amanah Cooperative',
    });
    expect(adminAlert.sent).toBe(false);
    expect(adminAlert.reason).toBe('SMTP_NOT_CONFIGURED');

    const welcomeRes = await sendRegistrationApprovedEmail({
      to: 'nadia@amanahcoop.org',
      memberName: 'Nadia Karim',
      memberCode: 'MEM-008',
      adminName: 'Root Admin',
      fundName: 'Amanah Cooperative',
    });
    expect(welcomeRes.sent).toBe(false);
    expect(welcomeRes.reason).toBe('SMTP_NOT_CONFIGURED');
  });

  it('resolves, merges, resets, and applies custom Nodemailer email formats safely across templates', () => {
    expect(EMAIL_TEMPLATE_KEYS).toHaveLength(6);
    expect(sanitizeEmailHeaderColor('red; background:url(x)', '#059669')).toBe('#059669');
    expect(sanitizeEmailHeaderColor('#4F46E5', '#059669')).toBe('#4f46e5');

    const merged = mergeEmailTemplateCollections(undefined, {
      transactionSummary: {
        subject: 'Receipt {{referenceId}} ({{amount}})',
        greeting: 'Salam {{recipientName}}!',
        introBody: 'Ledger notice: {{summaryText}}',
        footerNote: 'Custom cooperative footer note.',
        headerColor: '#4f46e5',
      },
    });
    expect(merged?.transactionSummary?.headerColor).toBe('#4f46e5');

    const resolved = resolveEmailTemplate('transactionSummary', merged);
    expect(resolved.subject).toBe('Receipt {{referenceId}} ({{amount}})');

    const customPayload = buildTransactionSummaryEmailPayload(
      {
        to: 'bilal@amanahcoop.org',
        recipientName: 'Bilal <Admin>',
        fundName: 'Amanah Cooperative',
        currency: 'BDT',
        eventTitle: 'Contribution Verified',
        transactionType: 'Deposit',
        referenceId: 'TXN-901',
        amount: 7500,
        statusLabel: 'Approved',
        summaryText: 'Deposit credited cleanly.',
      },
      merged
    );

    expect(customPayload.subject).toBe('Receipt TXN-901 (7,500 BDT)');
    expect(customPayload.text).toContain('Salam Bilal <Admin>!');
    expect(customPayload.text).toContain('Custom cooperative footer note.');
    expect(customPayload.html).toContain('#4f46e5');
    expect(customPayload.html).toContain('Bilal &lt;Admin&gt;');
    expect(customPayload.html).not.toContain('Bilal <Admin>');

    const previewAll = EMAIL_TEMPLATE_KEYS.map((key) =>
      buildEmailTemplatePreview({
        key,
        templateOverrides: merged,
        fundName: 'Amanah Cooperative',
        currency: 'BDT',
      })
    );
    expect(previewAll.every((p) => p.subject.length > 0 && p.html.includes('Amanah Cooperative'))).toBe(
      true
    );

    // Passing null for a template key resets it cleanly back to default
    const afterReset = mergeEmailTemplateCollections(merged, {
      transactionSummary: null,
    });
    expect(afterReset).toBeUndefined();
  });

  it('tracks failed emails in persistent retry queue with exponential backoff, manual retry, and monitor redaction', () => {
    expect(computeRetryBackoffMs(1)).toBe(60_000);
    expect(computeRetryBackoffMs(2)).toBe(180_000);
    expect(computeRetryBackoffMs(3)).toBe(600_000);
    expect(computeRetryBackoffMs(4)).toBe(1_800_000);

    const state = makeBaseState();
    const t0 = new Date('2026-11-16T10:00:00.000Z');
    const item = enqueueEmailFailureInState(
      state,
      {
        to: ['bilal@amanahcoop.org'],
        subject: '[Amanah] Temporary Password Reset (AC-002)',
        text: 'Assalamu Alaikum Bilal,\nTemporary Password: Amn-SECRET99\nSign in soon.',
        category: 'password_reset',
        attachments: [
          {
            filename: 'summary.pdf',
            content: Buffer.from('%PDF-1.4 sample', 'utf8'),
            contentType: 'application/pdf',
          },
        ],
        maxAttempts: 3,
      },
      'ETIMEDOUT: SMTP timeout',
      t0
    );

    expect(item.status).toBe('retrying');
    expect(item.attempts).toBe(1);
    expect(item.nextAttemptAt).toBe('2026-11-16T10:01:00.000Z');

    // Monitor view must redact temp password & omit heavy base64 payload while keeping filename
    const monitorView = sanitizeQueueItemForMonitor(item);
    expect(monitorView.text).not.toContain('Amn-SECRET99');
    expect(monitorView.text).toContain('Temporary Password: ••••••••');
    expect(monitorView.attachmentFilenames).toEqual(['summary.pdf']);
    expect('attachments' in monitorView).toBe(false);

    // Attempt 2 fails -> still retrying with 3m backoff
    markQueueItemRetryFailedInState(
      state,
      item.id,
      'ECONNREFUSED',
      new Date('2026-11-16T10:01:00.000Z')
    );
    expect(item.status).toBe('retrying');
    expect(item.attempts).toBe(2);
    expect(item.nextAttemptAt).toBe('2026-11-16T10:04:00.000Z');

    // Attempt 3 fails (reaches maxAttempts=3) -> transitions to terminal 'failed'
    markQueueItemRetryFailedInState(
      state,
      item.id,
      '535 Authentication failed',
      new Date('2026-11-16T10:04:00.000Z')
    );
    expect(item.status).toBe('failed');
    expect(item.attempts).toBe(3);

    expect(computeEmailQueueStats(state.emailQueue)).toEqual({
      total: 1,
      pending: 0,
      retrying: 0,
      failed: 1,
      sent: 0,
    });

    // Admin schedules manual retry -> resets to pending, then succeeds
    scheduleManualRetryInState(state, item.id, new Date('2026-11-16T10:10:00.000Z'));
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(0);

    markQueueItemSuccessInState(
      state,
      item.id,
      '<msg-123@amanahcoop.org>',
      new Date('2026-11-16T10:10:05.000Z')
    );
    expect(item.status).toBe('sent');
    expect(item.lastError).toBeUndefined();
    expect(item.messageId).toBe('<msg-123@amanahcoop.org>');
    expect(computeEmailQueueStats(state.emailQueue)).toEqual({
      total: 1,
      pending: 0,
      retrying: 0,
      failed: 0,
      sent: 1,
    });
  });
});

describe('FAQ Defaults & Sorting', () => {
  it('seeds 10 default charter FAQs in ascending sortOrder and preserves sort stability', () => {
    const defaults = createDefaultFaqs('2026-11-16T00:00:00.000Z');
    expect(defaults).toHaveLength(10);
    expect(defaults[0].id).toBe('faq-kyc-application');
    expect(defaults[9].id).toBe('faq-exit-transfer');

    const shuffled = [defaults[5], defaults[1], defaults[0]];
    const sorted = sortFaqItems(shuffled);
    expect(sorted.map((f) => f.id)).toEqual([
      'faq-kyc-application',
      'faq-member-cap',
      'faq-qard-hasan-limits',
    ]);
  });
});

describe('Groq AI Community Spam Shield & Resilient Completion Handling', () => {
  it('flags phishing, gambling, and malicious links while approving genuine cooperative posts', () => {
    const safeResult = analyzeCommunityPostSpamHeuristic({
      title: 'Halal Agri Venture Field Photos',
      content: 'Assalamu Alaikum @Bilal Hasan, uploaded our inspection photos and YouTube walkthrough.',
      links: [
        { url: 'https://youtu.be/dQw4w9WgXcQ', label: 'Walkthrough', kind: 'video' },
        { url: 'https://ik.imagekit.io/amanah/site.jpg', label: 'Field Photo', kind: 'photo' },
      ],
    });
    expect(safeResult.isSpam).toBe(false);
    expect(safeResult.riskLevel).toBe('safe');

    const shortenerCaution = analyzeCommunityPostSpamHeuristic({
      title: 'Shared document link',
      content: 'Check the file here',
      links: [{ url: 'https://bit.ly/charter-notes', label: 'Notes', kind: 'link' }],
    });
    expect(shortenerCaution.isSpam).toBe(false);
    expect(shortenerCaution.riskLevel).toBe('caution');
    expect(shortenerCaution.flaggedLinks).toContain('https://bit.ly/charter-notes');

    const phishingSpam = analyzeCommunityPostSpamHeuristic({
      title: 'Urgent Claim Free USDT Airdrop',
      content: 'Connect wallet to claim 100% guaranteed profit daily http://192.168.1.50/verify',
      links: [{ url: 'https://melbet.com/promo', label: 'Bonus', kind: 'link' }],
    });
    expect(phishingSpam.isSpam).toBe(true);
    expect(phishingSpam.riskLevel).toBe('spam');
    expect(phishingSpam.flaggedLinks.length).toBeGreaterThanOrEqual(1);

    const extracted = extractUrlsFromPost({
      title: 'Update',
      content: 'See https://amanah.example.org/report.',
      links: [{ url: 'https://youtu.be/abc', label: 'Video', kind: 'video' }],
    });
    expect(extracted).toEqual([
      'https://amanah.example.org/report',
      'https://youtu.be/abc',
    ]);
    expect(getGroqModel()).toBe(process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL);

    // Blocking rule: both spam AND suspicious (caution) links block posting
    expect(shouldBlockCommunityPost(safeResult, true)).toBe(false);
    expect(shouldBlockCommunityPost(shortenerCaution, true)).toBe(true);
    expect(shouldBlockCommunityPost(phishingSpam, true)).toBe(true);
    expect(shouldBlockCommunityPost({ isSpam: false, riskLevel: 'caution' }, false)).toBe(false);
    expect(shouldBlockCommunityPost({ isSpam: true, riskLevel: 'spam' }, false)).toBe(true);

    // Shared client link extraction + block matcher stays aligned with server
    const clientUrls = extractPostUrlList({
      title: 'Check this',
      content: 'Visit https://bit.ly/charter-notes for info',
      links: [{ url: 'http://untrusted.example.com/login', label: 'Login', kind: 'link' }],
    });
    expect(clientUrls).toEqual([
      'https://bit.ly/charter-notes',
      'http://untrusted.example.com/login',
    ]);
    expect(isSpamCheckBlockingPost(shortenerCaution, clientUrls.length > 0)).toBe(true);
    expect(isSpamCheckBlockingPost(safeResult, true)).toBe(false);
  });

  it('extracts JSON safely and retries without response_format when Groq returns 400 json_validate_failed', async () => {
    const fenced = extractJsonObjectFromText<{ ok: boolean; text: string }>(
      '```json\n{"ok":true,"text":"Line 1\nLine 2"}\n```'
    );
    expect(fenced.ok).toBe(true);
    expect(fenced.text).toContain('Line 1');

    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_test_mock_key';
    try {
      const requestBodies: Array<Record<string, unknown>> = [];
      let attempt = 0;
      const retryFetch: typeof fetch = async (_input, init) => {
        attempt += 1;
        requestBodies.push(JSON.parse(String(init?.body || '{}')));
        if (attempt === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
                code: 'json_validate_failed',
                failed_generation: '{"incomplete": ',
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            model: DEFAULT_GROQ_MODEL,
            choices: [
              {
                message: {
                  content: '```json\n{"rewrittenText":"Polished text","improvements":["Clarity"]}\n```',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const retried = await callGroqJson<{ rewrittenText: string; improvements: string[] }>({
        messages: [{ role: 'user', content: 'Polish this' }],
        fetchImpl: retryFetch,
      });

      expect(attempt).toBe(2);
      expect(requestBodies[0].response_format).toEqual({ type: 'json_object' });
      expect(requestBodies[1].response_format).toBeUndefined();
      expect(retried.parsed.rewrittenText).toBe('Polished text');

      // Also recovers directly if Groq's failed_generation actually contains valid JSON inside fences
      const recoverFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Failed to validate JSON.',
              code: 'json_validate_failed',
              failed_generation: '```json\n{"isSpam":false,"riskLevel":"safe","reason":"Looks clean"}\n```',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );

      const recovered = await callGroqJson<{ isSpam: boolean; riskLevel: string }>({
        messages: [{ role: 'user', content: 'Check spam' }],
        fetchImpl: recoverFetch,
      });
      expect(recovered.parsed).toMatchObject({ isSpam: false, riskLevel: 'safe' });
    } finally {
      if (prevKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = prevKey;
      }
    }
  });

  it('retries automatically when Groq returns an empty completion and strips reasoning tags', async () => {
    const prevKey = process.env.GROQ_API_KEY;
    const prevModel = process.env.GROQ_MODEL;
    process.env.GROQ_API_KEY = 'gsk_test_mock_key';
    process.env.GROQ_MODEL = 'qwen/qwen3-32b';
    try {
      const seenBodies: Array<Record<string, unknown>> = [];
      let callCount = 0;
      const emptyThenSuccessFetch: typeof fetch = async (_input, init) => {
        callCount += 1;
        seenBodies.push(JSON.parse(String(init?.body || '{}')));
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              model: 'qwen/qwen3-32b',
              choices: [
                {
                  finish_reason: 'length',
                  message: { content: '<think>reasoning truncated before output' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            model: 'qwen/qwen3-32b',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '<think>done</think>{"rewrittenText":"Clean cooperative update","improvements":["Clarified"]}',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await callGroqJson<{ rewrittenText: string; improvements: string[] }>({
        messages: [{ role: 'user', content: 'Rewrite' }],
        maxTokens: 700,
        fetchImpl: emptyThenSuccessFetch,
      });

      expect(callCount).toBe(2);
      expect(seenBodies[0].reasoning_effort).toBe('none');
      expect(seenBodies[0].response_format).toEqual({ type: 'json_object' });
      expect(seenBodies[1].response_format).toBeUndefined();
      expect(Number(seenBodies[1].max_tokens)).toBeGreaterThanOrEqual(4096);
      expect(res.parsed.rewrittenText).toBe('Clean cooperative update');
    } finally {
      if (prevKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prevKey;
      if (prevModel === undefined) delete process.env.GROQ_MODEL;
      else process.env.GROQ_MODEL = prevModel;
    }
  });
});

describe('Mobile Device Registration & 4-Digit PIN Login', () => {
  it('validates 4-digit numeric PIN format strictly', () => {
    expect(isValidFourDigitPin('1234')).toBe(true);
    expect(isValidFourDigitPin('0007')).toBe(true);
    expect(isValidFourDigitPin('123')).toBe(false);
    expect(isValidFourDigitPin('12345')).toBe(false);
    expect(isValidFourDigitPin('12ab')).toBe(false);
    expect(isValidFourDigitPin('')).toBe(false);
  });

  it('registers a mobile device, sanitizes hashes from PublicUser, and verifies 4-digit PIN login', () => {
    const state = makeBaseState();
    const member = state.users[1];

    const reg = registerDeviceOnUser(
      member,
      { pin: '4829', deviceName: 'Pixel 8 Pro' },
      '2026-04-10T10:00:00.000Z'
    );

    expect(reg.isUpdate).toBe(false);
    expect(reg.device.deviceName).toBe('Pixel 8 Pro');
    expect(reg.deviceSecret.length).toBeGreaterThan(20);

    const sanitized = sanitizeUser(member);
    expect(sanitized.registeredDevices).toHaveLength(1);
    expect(sanitized.registeredDevices?.[0]).toEqual({
      deviceId: reg.device.deviceId,
      deviceName: 'Pixel 8 Pro',
      createdAt: '2026-04-10T10:00:00.000Z',
      lastUsedAt: '2026-04-10T10:00:00.000Z',
    });
    expect(JSON.stringify(sanitized)).not.toContain('pinHash');
    expect(JSON.stringify(sanitized)).not.toContain('deviceSecretHash');

    const badSecret = verifyRegisteredDevicePinLogin(member, {
      deviceId: reg.device.deviceId,
      deviceSecret: 'wrong-secret',
      pin: '4829',
    });
    expect(badSecret.ok).toBe(false);
    if ('code' in badSecret) {
      expect(badSecret.code).toBe('DEVICE_NOT_REGISTERED');
    }

    const okLogin = verifyRegisteredDevicePinLogin(
      member,
      {
        deviceId: reg.device.deviceId,
        deviceSecret: reg.deviceSecret,
        pin: '4829',
      },
      Date.parse('2026-04-10T12:00:00.000Z')
    );
    expect(okLogin.ok).toBe(true);
    if ('device' in okLogin) {
      expect(okLogin.device.lastUsedAt).toBe('2026-04-10T12:00:00.000Z');
      expect(okLogin.device.failedAttempts).toBe(0);
    }
  });

  it('locks device PIN after 5 failed attempts and supports revocation & re-registration update', () => {
    const state = makeBaseState();
    const member = state.users[1];
    const now = Date.parse('2026-04-10T10:00:00.000Z');

    const reg = registerDeviceOnUser(member, { pin: '9012', deviceName: 'iPhone 15' });

    for (let i = 0; i < 4; i++) {
      const attempt = verifyRegisteredDevicePinLogin(
        member,
        { deviceId: reg.device.deviceId, deviceSecret: reg.deviceSecret, pin: '0000' },
        now + i * 1000
      );
      expect(attempt.ok).toBe(false);
      if ('code' in attempt) {
        expect(attempt.code).toBe('INVALID_PIN');
        expect(attempt.remainingAttempts).toBe(4 - i);
      }
    }

    const fifthAttempt = verifyRegisteredDevicePinLogin(
      member,
      { deviceId: reg.device.deviceId, deviceSecret: reg.deviceSecret, pin: '0000' },
      now + 5000
    );
    expect(fifthAttempt.ok).toBe(false);
    if ('code' in fifthAttempt) {
      expect(fifthAttempt.code).toBe('PIN_LOCKED');
    }

    // Correct PIN while locked is rejected cleanly
    const whileLocked = verifyRegisteredDevicePinLogin(
      member,
      { deviceId: reg.device.deviceId, deviceSecret: reg.deviceSecret, pin: '9012' },
      now + 60_000
    );
    expect(whileLocked.ok).toBe(false);
    if ('code' in whileLocked) {
      expect(whileLocked.code).toBe('PIN_LOCKED');
    }

    // Updating PIN clears lockout & issues a fresh secret
    const updated = registerDeviceOnUser(member, {
      pin: '3456',
      deviceName: 'iPhone 15',
      existingDeviceId: reg.device.deviceId,
    });
    expect(updated.isUpdate).toBe(true);
    expect(updated.device.deviceId).toBe(reg.device.deviceId);
    const unlocked = verifyRegisteredDevicePinLogin(member, {
      deviceId: updated.device.deviceId,
      deviceSecret: updated.deviceSecret,
      pin: '3456',
    });
    expect(unlocked.ok).toBe(true);

    // Revoking device removes it immediately
    const removed = revokeDeviceOnUser(member, reg.device.deviceId);
    expect(removed?.deviceId).toBe(reg.device.deviceId);
    const afterRevoke = verifyRegisteredDevicePinLogin(member, {
      deviceId: updated.device.deviceId,
      deviceSecret: updated.deviceSecret,
      pin: '3456',
    });
    expect(afterRevoke.ok).toBe(false);
    if ('code' in afterRevoke) {
      expect(afterRevoke.code).toBe('DEVICE_NOT_REGISTERED');
    }
  });
});
