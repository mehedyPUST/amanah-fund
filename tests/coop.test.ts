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
import {
  buildOtpAuthUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/server/totp.ts';
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




