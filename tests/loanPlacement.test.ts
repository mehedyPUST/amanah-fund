import http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSensitiveObject } from '../src/server/crypto.ts';
import type { VaultState } from '../src/server/db.ts';
import type { LoanRequest } from '../src/types/coop.ts';

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
  loadVaultState: async () => structuredClone(mockState),
  updateVaultState: async (mutator: (state: VaultState) => VaultState | Promise<VaultState>) => {
    const next = await mutator(structuredClone(mockState));
    mockState = next;
    return structuredClone(mockState);
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

  it('enforces co-signing guarantor selection above threshold and creates pending_guarantor status when provided', async () => {
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
    expect(data.loan.status).toBe('pending_guarantor');
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
});
