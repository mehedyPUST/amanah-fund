import http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSensitiveObject } from '../src/server/crypto.ts';
import type { VaultState } from '../src/server/db.ts';
import type { DashboardOverview, LoanRequest } from '../src/types/coop.ts';

let mockState: VaultState;

function createTestVault(): VaultState {
  return {
    users: [
      {
        id: 'u-admin',
        name: 'Amina Rahman',
        email: 'amina@amanahcoop.org',
        passwordHash: 'hash1',
        role: 'admin',
        memberCode: 'AC-001',
        status: 'active',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'u-member-1',
        name: 'Bilal Hasan',
        email: 'bilal@amanahcoop.org',
        passwordHash: 'hash2',
        role: 'member',
        memberCode: 'AC-002',
        status: 'active',
        joinedAt: '2026-01-05T00:00:00.000Z',
      },
      {
        id: 'u-member-2',
        name: 'Fatima Zahra',
        email: 'fatima@amanahcoop.org',
        passwordHash: 'hash3',
        role: 'member',
        memberCode: 'AC-003',
        status: 'active',
        joinedAt: '2026-01-10T00:00:00.000Z',
      },
      {
        id: 'u-manager-1',
        name: 'Tariq Karim',
        email: 'tariq@amanahcoop.org',
        passwordHash: 'hash4',
        role: 'manager',
        memberCode: 'AC-004',
        status: 'active',
        joinedAt: '2026-01-12T00:00:00.000Z',
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
      maturityDate: '2029-12-31',
      managerCycleMonths: 3,
      managerCycleStartDate: '2026-01-01',
      halalInvestmentThesis: 'Post-maturity Halal investments.',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'Amina Rahman',
    },
    contributions: [
      {
        id: 'c-1',
        userId: 'u-member-1',
        memberName: 'Bilal Hasan',
        memberCode: 'AC-002',
        billingMonth: '2026-01',
        amount: 60000,
        channel: 'mfs',
        providerName: 'bKash',
        maskedReference: '••••1001',
        encryptedDetails: encryptSensitiveObject({
          referenceId: 'BK1001',
          senderAccount: '01700001111',
        }),
        status: 'approved',
        submittedAt: '2026-01-10T00:00:00.000Z',
        entryHash: 'hash-c1',
      },
    ],
    loans: [],
    halalProjects: [],
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
    privateMessages: [],
    decisionPolls: [],
    meetings: [],
    profileChangeRequests: [],
  };
}

vi.mock('../src/server/db.ts', () => ({
  initDatabase: async () => 'encrypted_local_vault' as const,
  getStorageEngine: () => 'encrypted_local_vault' as const,
  getStorageDiagnostic: () => ({
    storageEngine: 'encrypted_local_vault' as const,
    storageReason: 'missing_uri' as const,
    connectionErrorCode: null,
  }),
  loadVaultState: async () => structuredClone(mockState),
  findActiveUserByIds: async (ids: string[]) => {
    for (const id of ids) {
      const found = mockState.users.find((u) => u.id === id && u.status === 'active');
      if (found) return structuredClone(found);
    }
    return null;
  },
  loadFundConfigOnly: async () => structuredClone(mockState.fundConfig),
  loadFaqsOnly: async () => structuredClone(mockState.faqs || []),
  loadNoticesOnly: async () => structuredClone(mockState.notices || []),
  loadUserBootstrapSummary: async () => {
    const active = mockState.users.filter((u) => u.status === 'active');
    return {
      hasMembers: mockState.users.length > 0,
      activeMembersCount: active.length,
      activeReferences: active.map((u) => ({ name: u.name, memberCode: u.memberCode })),
    };
  },
  updateVaultState: async (mutator: (state: VaultState) => VaultState | Promise<VaultState>) => {
    const next = await mutator(structuredClone(mockState));
    mockState = next;
    return structuredClone(mockState);
  },
  registerVaultNotificationsCommitHook: () => undefined,
  revokeSessionTokens: async (
    entries: Array<{ id: string; userId?: string; expiresAt: string }>
  ) => {
    const existing = Array.isArray(mockState.revokedTokens) ? mockState.revokedTokens : [];
    const byId = new Map(existing.map((e) => [e.id, e]));
    const nowIso = new Date().toISOString();
    for (const entry of entries) {
      byId.set(entry.id, {
        id: entry.id,
        userId: entry.userId,
        revokedAt: nowIso,
        expiresAt: entry.expiresAt,
      });
    }
    mockState.revokedTokens = Array.from(byId.values());
  },
  findRevokedTokenIds: async (tokenIds: string[]) => {
    const nowMs = Date.now();
    const revoked = new Set<string>();
    for (const entry of mockState.revokedTokens || []) {
      if (tokenIds.includes(entry.id) && Date.parse(entry.expiresAt) > nowMs) {
        revoked.add(entry.id);
      }
    }
    return revoked;
  },
}));

const { apiRouter } = await import('../src/server/routes.ts');
const { SESSION_COOKIE_NAME, signAuthToken } = await import('../src/server/auth.ts');

describe('POST /api/loans Qard Hasan placement integration', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', apiRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    mockState = createTestVault();
  });

  function authHeaders(userId: string) {
    const user = mockState.users.find((u) => u.id === userId)!;
    const token = signAuthToken(user);
    return {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    };
  }

  it('places a standard Qard Hasan loan request with rounded amount and full repayment schedule', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 15000.456,
        installmentMonths: 6,
        purpose: 'Urgent medical surgery support',
        emergencyContext: 'Hospital admission advance',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01711223344',
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { loan: LoanRequest };
    expect(data.loan.amount).toBe(15000.46);
    expect(data.loan.installmentMonths).toBe(6);
    expect(data.loan.status).toBe('pending_manager_review');
    expect(data.loan.installments).toHaveLength(6);
    const scheduleSum = data.loan.installments.reduce((s, item) => s + item.amount, 0);
    expect(Math.round(scheduleSum * 100) / 100).toBe(15000.46);
    expect(data.loan.decryptedSensitiveNotes?.provider).toBe('bKash');
    expect(data.loan.decryptedSensitiveNotes?.disbursementAccount).toBe('01711223344');
  });

  it('supports 25 to 36 month repayment schedules when admin config permits up to 36 months', async () => {
    mockState.fundConfig.maxInstallmentMonths = 36;

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 30000,
        installmentMonths: 30,
        purpose: 'Longer family education support',
        channel: 'bank',
        provider: 'Islami Bank Bangladesh PLC',
        disbursementAccount: '2050123456789',
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { loan: LoanRequest };
    expect(data.loan.installmentMonths).toBe(30);
    expect(data.loan.installments).toHaveLength(30);
    expect(data.loan.monthlyInstallment).toBe(1000);
  });

  it('enforces co-signing guarantor selection above threshold and queues request in Manager Desk', async () => {
    const missingGuarantorRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 50000,
        installmentMonths: 10,
        purpose: 'Home structural repair',
        channel: 'mfs',
        provider: 'Nagad',
        disbursementAccount: '01811223344',
      }),
    });
    expect(missingGuarantorRes.status).toBe(400);

    const validRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 50000,
        installmentMonths: 10,
        purpose: 'Home structural repair',
        channel: 'mfs',
        provider: 'Nagad',
        disbursementAccount: '01811223344',
        guarantorIds: ['u-member-2'],
      }),
    });

    expect(validRes.status).toBe(201);
    const data = (await validRes.json()) as { loan: LoanRequest };
    // Always lands in Manager Desk Stage 1 so managers can initiate voting
    expect(data.loan.status).toBe('pending_manager_review');
    expect(data.loan.guarantors).toHaveLength(1);
    expect(data.loan.guarantors?.[0].memberId).toBe('u-member-2');
    expect(data.loan.guarantors?.[0].status).toBe('pending');
  });

  it('rejects duplicate pending loans, invalid amounts, and admin loan requests', async () => {
    const adminRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-admin'),
      body: JSON.stringify({
        amount: 5000,
        installmentMonths: 3,
        purpose: 'Test',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01700000000',
      }),
    });
    expect(adminRes.status).toBe(403);

    const lowAmountRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 50,
        installmentMonths: 3,
        purpose: 'Too small',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01700000000',
      }),
    });
    expect(lowAmountRes.status).toBe(400);

    const firstRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 10000,
        installmentMonths: 4,
        purpose: 'First valid loan',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01700000000',
      }),
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 5000,
        installmentMonths: 2,
        purpose: 'Second concurrent loan',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01700000000',
      }),
    });
    expect(secondRes.status).toBe(400);
  });

  it('surfaces submitted loan immediately in borrower dashboard overview, loans list, and manager desk review queue', async () => {
    const createRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 20000,
        installmentMonths: 5,
        purpose: 'Medical diagnostic checkup',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01711223344',
      }),
    });
    expect(createRes.status).toBe(201);
    const { loan } = (await createRes.json()) as { loan: LoanRequest };

    const memberOvRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: authHeaders('u-member-1'),
    });
    expect(memberOvRes.status).toBe(200);
    expect(memberOvRes.headers.get('cache-control')).toContain('no-store');
    const memberOv = (await memberOvRes.json()) as DashboardOverview;
    expect(memberOv.personal.eligibility.noActiveLoan).toBe(false);
    expect(memberOv.personal.eligibility.activeLoanId).toBe(loan.id);
    expect(memberOv.treasury.pendingLoansReviewCount).toBe(1);

    const borrowerLoansRes = await fetch(`${baseUrl}/api/loans`, {
      headers: authHeaders('u-member-1'),
    });
    expect(borrowerLoansRes.status).toBe(200);
    expect(borrowerLoansRes.headers.get('cache-control')).toContain('no-store');
    const borrowerLoansData = (await borrowerLoansRes.json()) as { loans: LoanRequest[] };
    expect(
      borrowerLoansData.loans.some(
        (l) => l.id === loan.id && l.borrowerId === 'u-member-1' && l.status === 'pending_manager_review'
      )
    ).toBe(true);

    const mgrLoansRes = await fetch(`${baseUrl}/api/loans`, {
      headers: authHeaders('u-manager-1'),
    });
    expect(mgrLoansRes.status).toBe(200);
    const mgrLoansData = (await mgrLoansRes.json()) as { loans: LoanRequest[] };
    expect(mgrLoansData.loans.some((l) => l.id === loan.id && l.status === 'pending_manager_review')).toBe(
      true
    );

    const initVoteRes = await fetch(`${baseUrl}/api/loans/${loan.id}/initiate-vote`, {
      method: 'POST',
      headers: authHeaders('u-manager-1'),
      body: JSON.stringify({}),
    });
    expect(initVoteRes.status).toBe(200);
    const initVoteData = (await initVoteRes.json()) as { loan: LoanRequest };
    expect(initVoteData.loan.status).toBe('pending_vote');

    const mgrOvAfterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: authHeaders('u-manager-1'),
    });
    const mgrOvAfter = (await mgrOvAfterRes.json()) as DashboardOverview;
    expect(mgrOvAfter.treasury.pendingLoansReviewCount).toBe(0);
    expect(mgrOvAfter.treasury.pendingVotesCount).toBe(1);
  });

  it('enforces the 75% savings borrowing limit and 10-month cap when configured per constitution', async () => {
    mockState.fundConfig.maxLoanAmount = 50000;
    mockState.fundConfig.maxInstallmentMonths = 10;
    mockState.fundConfig.loanSavingsCapPct = 75;

    // u-member-1 has 60,000 approved savings => 75% cap = 45,000 (< 50,000)
    const overSavingsCapRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 48000,
        installmentMonths: 8,
        purpose: 'Exceeds 75% savings limit',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01711223344',
        guarantorIds: ['u-member-2'],
      }),
    });
    expect(overSavingsCapRes.status).toBe(400);

    const withinCapRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: authHeaders('u-member-1'),
      body: JSON.stringify({
        amount: 45000,
        installmentMonths: 10,
        purpose: 'Within 75% savings limit',
        channel: 'mfs',
        provider: 'bKash',
        disbursementAccount: '01711223344',
        guarantorIds: ['u-member-2'],
      }),
    });
    expect(withinCapRes.status).toBe(201);
  });

  it('revokes session token and clears cookies completely on POST /api/auth/logout', async () => {
    const member = mockState.users.find((u) => u.id === 'u-member-1')!;
    const activeToken = signAuthToken(member);

    // Token works before sign-out
    const beforeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${activeToken}`,
        'X-Amanah-Session': activeToken,
      },
    });
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.headers.get('cache-control')).toContain('no-store');

    // Sign out
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${activeToken}`,
        'X-Amanah-Session': activeToken,
      },
      body: JSON.stringify({ sessionToken: activeToken }),
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('cache-control')).toContain('no-store');
    const setCookies = logoutRes.headers.getSetCookie?.() || [];
    expect(setCookies.length).toBeGreaterThanOrEqual(3);
    expect(
      setCookies.some(
        (c) =>
          c.startsWith(`${SESSION_COOKIE_NAME}=;`) &&
          (c.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT') || c.includes('Max-Age=0'))
      )
    ).toBe(true);

    // Replaying the signed-out token via Cookie or X-Amanah-Session must return 401
    const replayCookieRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${activeToken}` },
    });
    expect(replayCookieRes.status).toBe(401);

    const replayHeaderRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'X-Amanah-Session': activeToken },
    });
    expect(replayHeaderRes.status).toBe(401);

    // A fresh login issues a distinct jti that authenticates cleanly
    const freshToken = signAuthToken(member);
    const freshRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'X-Amanah-Session': freshToken },
    });
    expect(freshRes.status).toBe(200);
  });
});
