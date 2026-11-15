import { describe, expect, it } from 'vitest';
import {
  appendAuditLog,
  applyOverdueChecksToState,
  buildDashboardOverview,
  buildMemberPublicProfile,
  computeRequiredApprovals,
  evaluateLoanEligibility,
  extractMentionedUsers,
  hydrateLoanForViewer,
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
    const hydrated = hydrateLoanForViewer(loan, viewerAdmin);
    expect(hydrated.votes[0].isSelf).toBe(true);
    expect(hydrated.votes[0].voterId).toBe('u-1');
    expect(hydrated.votes[1].isSelf).toBe(false);
    expect(hydrated.votes[1].voterId).not.toBe('u-2');
    expect(hydrated.votes[1].voterName).toContain('Anonymous Member');
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


