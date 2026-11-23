import { describe, expect, it } from 'vitest';
import {
  buildDashboardOverview,
  buildGoogleSheetsBlueprint,
  buildManagerCycleSchedule,
  buildMemberPublicProfile,
  buildMemberSummaries,
  buildMonthlySheetData,
  evaluateLoanEligibility,
} from '../src/server/coopService.ts';
import type { VaultState } from '../src/server/db.ts';
import { createEmptyVaultState, normalizeVaultState } from '../src/server/db.ts';
import { sanitizeUser } from '../src/server/auth.ts';
import { encryptSensitiveObject } from '../src/server/crypto.ts';
import { buildMonthlyFundSummaryData } from '../src/server/pdfSummaryService.ts';
import type { Contribution, EligibilityCheck, LoanRequest } from '../src/types/coop.ts';
import {
  computeEffectiveMemberStartMonth,
  DEFAULT_PROJECT_START_DATE,
  isContributionOnOrAfterProjectStart,
  isLoanOnOrAfterProjectStart,
  isValidIsoDateYmd,
  resolveProjectStartDate,
  resolveProjectStartMonth,
} from '../src/utils/projectDates.ts';

const MOCK_ELIGIBILITY: EligibilityCheck = {
  noActiveLoan: true,
  noOverdueInstallments: true,
  loansUsedThisYear: 0,
  maxLoansPerYear: 3,
  quotaAvailable: true,
  beforeMaturityDate: true,
  eligible: true,
  reasons: [],
};

function buildFixtureState(projectStartDate: string): VaultState {
  const base = createEmptyVaultState();
  base.fundConfig = {
    ...base.fundConfig,
    projectStartDate,
    maturityDate: '2036-12-31',
    monthlyContributionAmount: 5000,
    maxLoanAmount: 50000,
    maxLoansPerYear: 3,
    loanSavingsCapPct: 75,
    managerCycleMonths: 3,
    managerCycleStartDate: undefined,
  };

  base.users = [
    {
      id: 'adm-1',
      name: 'System Admin',
      email: 'admin@amanah.test',
      memberCode: 'ADMIN-1',
      role: 'admin',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00.000Z',
      passwordHash: 'hash',
    },
    {
      id: 'mem-1',
      name: 'Tariq Mahmud',
      email: 'tariq@amanah.test',
      memberCode: 'AC001',
      role: 'member',
      status: 'active',
      joinedAt: '2026-01-05T00:00:00.000Z',
      passwordHash: 'hash',
    },
    {
      id: 'mem-2',
      name: 'Sadia Afrin',
      email: 'sadia@amanah.test',
      memberCode: 'AC002',
      role: 'member',
      status: 'active',
      joinedAt: '2026-02-10T00:00:00.000Z',
      passwordHash: 'hash',
    },
  ];

  const encContrib = encryptSensitiveObject({
    senderAccount: '01700000001',
    referenceId: 'TXN-001',
  });

  const contributions: Contribution[] = [
    {
      id: 'c-jan-1',
      userId: 'mem-1',
      memberCode: 'AC001',
      memberName: 'Tariq Mahmud',
      billingMonth: '2026-01',
      amount: 5000,
      channel: 'mfs',
      providerName: 'bKash',
      maskedReference: '***101',
      encryptedDetails: encContrib,
      status: 'approved',
      submittedAt: '2026-01-05T10:00:00.000Z',
      entryHash: 'h1',
    },
    {
      id: 'c-feb-1',
      userId: 'mem-1',
      memberCode: 'AC001',
      memberName: 'Tariq Mahmud',
      billingMonth: '2026-02',
      amount: 5000,
      channel: 'mfs',
      providerName: 'bKash',
      maskedReference: '***102',
      encryptedDetails: encContrib,
      status: 'approved',
      submittedAt: '2026-02-05T10:00:00.000Z',
      entryHash: 'h2',
    },
    {
      id: 'c-mar-1',
      userId: 'mem-1',
      memberCode: 'AC001',
      memberName: 'Tariq Mahmud',
      billingMonth: '2026-03',
      amount: 5000,
      channel: 'mfs',
      providerName: 'bKash',
      maskedReference: '***103',
      encryptedDetails: encContrib,
      status: 'approved',
      submittedAt: '2026-03-05T10:00:00.000Z',
      entryHash: 'h3',
    },
    {
      id: 'c-apr-1',
      userId: 'mem-1',
      memberCode: 'AC001',
      memberName: 'Tariq Mahmud',
      billingMonth: '2026-04',
      amount: 5000,
      channel: 'mfs',
      providerName: 'bKash',
      maskedReference: '***104',
      encryptedDetails: encContrib,
      status: 'approved',
      submittedAt: '2026-04-05T10:00:00.000Z',
      entryHash: 'h4',
    },
    {
      id: 'c-mar-2',
      userId: 'mem-2',
      memberCode: 'AC002',
      memberName: 'Sadia Afrin',
      billingMonth: '2026-03',
      amount: 5000,
      channel: 'bank',
      providerName: 'Islami Bank',
      maskedReference: '***203',
      encryptedDetails: encContrib,
      status: 'approved',
      submittedAt: '2026-03-08T10:00:00.000Z',
      entryHash: 'h5',
    },
  ];

  const encLoan = encryptSensitiveObject({
    emergencyContext: 'Household support',
    disbursementAccount: '01700000002',
    channel: 'mfs',
    provider: 'bKash',
  });

  const loans: LoanRequest[] = [
    {
      id: 'QH-FEB',
      borrowerId: 'mem-2',
      borrowerCode: 'AC002',
      borrowerName: 'Sadia Afrin',
      amount: 4000,
      purpose: 'Pre-start emergency loan',
      installmentMonths: 2,
      monthlyInstallment: 2000,
      encryptedSensitiveNotes: encLoan,
      eligibilitySnapshot: MOCK_ELIGIBILITY,
      status: 'repaid',
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 2,
      disbursedAt: '2026-02-15T10:00:00.000Z',
      totalRepaid: 4000,
      remainingBalance: 0,
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-03-15',
          amount: 2000,
          paidAmount: 2000,
          status: 'paid',
          paidAt: '2026-03-14T10:00:00.000Z',
        },
        {
          installmentNumber: 2,
          dueDate: '2026-04-15',
          amount: 2000,
          paidAmount: 2000,
          status: 'paid',
          paidAt: '2026-04-14T10:00:00.000Z',
        },
      ],
      requestedAt: '2026-02-12T10:00:00.000Z',
      entryHash: 'lh1',
    },
    {
      id: 'QH-APR',
      borrowerId: 'mem-1',
      borrowerCode: 'AC001',
      borrowerName: 'Tariq Mahmud',
      amount: 6000,
      purpose: 'Post-start loan',
      installmentMonths: 3,
      monthlyInstallment: 2000,
      encryptedSensitiveNotes: encLoan,
      eligibilitySnapshot: MOCK_ELIGIBILITY,
      status: 'active',
      votes: [],
      requiredApprovals: 2,
      totalEligibleVoters: 2,
      disbursedAt: '2026-04-02T10:00:00.000Z',
      totalRepaid: 2000,
      remainingBalance: 4000,
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-05-02',
          amount: 2000,
          paidAmount: 2000,
          status: 'paid',
          paidAt: '2026-04-20T10:00:00.000Z',
        },
        {
          installmentNumber: 2,
          dueDate: '2026-06-02',
          amount: 2000,
          paidAmount: 0,
          status: 'scheduled',
        },
        {
          installmentNumber: 3,
          dueDate: '2026-07-02',
          amount: 2000,
          paidAmount: 0,
          status: 'scheduled',
        },
      ],
      requestedAt: '2026-04-01T10:00:00.000Z',
      entryHash: 'lh2',
    },
  ];

  base.contributions = contributions;
  base.loans = loans;
  return base;
}

describe('Project starting date helper & cooperative calculation anchoring', () => {
  it('validates strict ISO dates and clamps effective member start months', () => {
    expect(isValidIsoDateYmd('2026-03-01')).toBe(true);
    expect(isValidIsoDateYmd('2026-02-30')).toBe(false);
    expect(isValidIsoDateYmd('2026-13-01')).toBe(false);
    expect(isValidIsoDateYmd('not-a-date')).toBe(false);

    expect(resolveProjectStartDate(undefined)).toBe(DEFAULT_PROJECT_START_DATE);
    expect(resolveProjectStartDate({ projectStartDate: '2026-04-15' })).toBe('2026-04-15');
    expect(resolveProjectStartMonth({ projectStartDate: '2026-04-15' })).toBe('2026-04');

    expect(computeEffectiveMemberStartMonth('2026-01-05T00:00:00Z', '2026-03')).toBe('2026-03');
    expect(computeEffectiveMemberStartMonth('2026-05-10T00:00:00Z', '2026-03')).toBe('2026-05');

    expect(
      isContributionOnOrAfterProjectStart(
        { billingMonth: '2026-02', submittedAt: '2026-02-05T00:00:00Z' },
        '2026-03-01'
      )
    ).toBe(false);
    expect(
      isContributionOnOrAfterProjectStart(
        { billingMonth: '2026-03', submittedAt: '2026-03-01T00:00:00Z' },
        '2026-03-01'
      )
    ).toBe(true);
    expect(
      isLoanOnOrAfterProjectStart(
        { disbursedAt: '2026-02-15T10:00:00.000Z', requestedAt: '2026-02-12T10:00:00.000Z' },
        '2026-03-01'
      )
    ).toBe(false);
  });

  it('recalculates treasury totals, dues, personal standing, and consistency scores from projectStartDate', () => {
    const refDate = new Date('2026-04-25T10:00:00.000Z');

    // Start from 2026-01-01: all 5 contributions (25,000) and both loans (4k + 6k = 10k disbursed, 6k repaid)
    const janState = buildFixtureState('2026-01-01');
    const janOverview = buildDashboardOverview(janState, sanitizeUser(janState.users[1]), refDate);

    expect(janOverview.treasury.totalContributionsPool).toBe(25000);
    expect(janOverview.treasury.totalLoansDisbursed).toBe(10000);
    expect(janOverview.treasury.totalRepaid).toBe(6000);
    expect(janOverview.treasury.centralBalance).toBe(21000); // 25000 - 10000 + 6000
    expect(janOverview.personal.totalContributed).toBe(20000);
    expect(janOverview.personal.dueContributionMonths).toBe(0);
    // mem-1: Jan..Apr = 4 months all paid -> 100% consistency
    const janTariqBoard = janOverview.leaderboard.find((e) => e.userId === 'mem-1');
    expect(janTariqBoard?.totalContributed).toBe(20000);
    expect(janTariqBoard?.consistencyScore).toBe(100);
    expect(janTariqBoard?.currentStreakMonths).toBe(4);
    // Expected due pool: mem-1 (Jan..Apr = 4 * 5000 = 20000) + mem-2 (Feb..Apr = 3 * 5000 = 15000) = 35000
    expect(janOverview.treasury.thisMonthDueTarget).toBe(35000);
    expect(janOverview.treasury.thisMonthDueRemaining).toBe(10000);

    // Move projectStartDate to 2026-03-01: excludes Jan & Feb contributions (10,000) and Feb loan (4,000 + its repayments)
    const marState = buildFixtureState('2026-03-01');
    const marOverview = buildDashboardOverview(marState, sanitizeUser(marState.users[1]), refDate);

    expect(marOverview.treasury.totalContributionsPool).toBe(15000); // c-mar-1, c-apr-1, c-mar-2
    expect(marOverview.treasury.totalLoansDisbursed).toBe(6000); // only QH-APR
    expect(marOverview.treasury.totalRepaid).toBe(2000); // only QH-APR inst 1
    expect(marOverview.treasury.centralBalance).toBe(11000); // 15000 - 6000 + 2000
    expect(marOverview.personal.totalContributed).toBe(10000); // Mar + Apr only
    // mem-1 effective start becomes 2026-03 -> Mar..Apr = 2 months paid -> consistency 100%, streak 2
    const marTariqBoard = marOverview.leaderboard.find((e) => e.userId === 'mem-1');
    expect(marTariqBoard?.totalContributed).toBe(10000);
    expect(marTariqBoard?.consistencyScore).toBe(100);
    expect(marTariqBoard?.currentStreakMonths).toBe(2);
    // mem-2 joined 2026-02, clamped to 2026-03 -> Mar..Apr = 2 months expected, 1 month paid -> 50% consistency
    const marSadiaBoard = marOverview.leaderboard.find((e) => e.userId === 'mem-2');
    expect(marSadiaBoard?.consistencyScore).toBe(50);
    // Cumulative expected target for both mem-1 & mem-2 from Mar..Apr = 2 * 2 * 5000 = 20000
    expect(marOverview.treasury.thisMonthDueTarget).toBe(20000);
    expect(marOverview.treasury.thisMonthDueRemaining).toBe(5000); // Sadia Apr unpaid
    expect(marOverview.monthlySeries.every((m) => m.month >= '2026-03')).toBe(true);
  });

  it('returns zero dues and zero pool when projectStartDate is in the future relative to referenceDate', () => {
    const refDate = new Date('2026-04-25T10:00:00.000Z');
    const futureState = buildFixtureState('2027-01-01');
    const overview = buildDashboardOverview(futureState, sanitizeUser(futureState.users[2]), refDate);

    expect(overview.treasury.totalContributionsPool).toBe(0);
    expect(overview.treasury.centralBalance).toBe(0);
    expect(overview.treasury.thisMonthDueTarget).toBe(0);
    expect(overview.treasury.thisMonthDueRemaining).toBe(0);
    expect(overview.personal.dueContributionMonths).toBe(0);
    expect(overview.personal.dueContributionAmount).toBe(0);
    expect(overview.monthlySeries).toHaveLength(0);
  });

  it('scopes loan eligibility savings cap & annual quota, member summaries, public profiles, sheets, monthly PDF, and cycle fallback', () => {
    const refDate = new Date('2026-04-25T10:00:00.000Z');
    const marState = buildFixtureState('2026-03-01');

    // Eligibility for mem-2: QH-FEB excluded so loansUsedThisYear is 0, savings from Mar = 5000 -> 75% cap = 3750
    const eligMar = evaluateLoanEligibility(marState, 'mem-2', refDate);
    expect(eligMar.loansUsedThisYear).toBe(0);
    expect(eligMar.memberTotalSavings).toBe(5000);
    expect(eligMar.effectiveMaxLoanAmount).toBe(3750);

    // Summaries & Public Profiles
    const summaries = buildMemberSummaries(marState);
    const tariqSummary = summaries.find((m) => m.id === 'mem-1');
    const sadiaSummary = summaries.find((m) => m.id === 'mem-2');
    expect(tariqSummary?.totalContributed).toBe(10000);
    expect(sadiaSummary?.totalContributed).toBe(5000);
    expect(sadiaSummary?.loansThisYear).toBe(0);

    const tariqProfile = buildMemberPublicProfile(
      marState,
      'mem-1',
      sanitizeUser(marState.users[0]),
      refDate
    );
    expect(tariqProfile?.fundSummary.totalContributed).toBe(10000);
    expect(tariqProfile?.fundSummary.consistencyScore).toBe(100);
    expect(tariqProfile?.fundSummary.currentStreakMonths).toBe(2);

    // Monthly Sheet & PDF Summary
    const sheetApr = buildMonthlySheetData(marState, '2026-04', refDate);
    expect(sheetApr.availableMonths.every((m) => m >= '2026-03')).toBe(true);
    expect(sheetApr.fundSummary.fundHeight).toBe(15000);
    expect(sheetApr.fundSummary.totalQardHasan).toBe(6000);
    expect(sheetApr.fundSummary.totalDueHasana).toBe(4000);

    const pdfFeb = buildMonthlyFundSummaryData(marState, '2026-02');
    expect(pdfFeb.projectStartDate).toBe('2026-03-01');
    expect(pdfFeb.monthContributionsCollected).toBe(0);
    expect(pdfFeb.monthContributionsTarget).toBe(0);

    // Google Sheets Blueprint
    const tabs = buildGoogleSheetsBlueprint(marState, '2026-04');
    const summaryTab = tabs.find((t) => t.sheetName === 'Fund_Summary');
    const contribTab = tabs.find((t) => t.sheetName === 'Contributions');
    const loansTab = tabs.find((t) => t.sheetName === 'Loans');
    expect(summaryTab?.rows.some((r) => r[0] === 'Project Start Date' && r[1] === '2026-03-01')).toBe(true);
    expect(contribTab?.rows.length).toBe(4); // header + 3 post-March contributions
    expect(loansTab?.rows.length).toBe(2); // header + 1 post-March loan

    // Manager cycle falls back to projectStartDate when managerCycleStartDate is unset
    const schedule = buildManagerCycleSchedule(marState, refDate);
    expect(schedule.cycleStartDate).toBe('2026-03-01');

    // Vault normalization ensures invalid/missing projectStartDate falls back to DEFAULT_PROJECT_START_DATE
    const badState = buildFixtureState('2026-02-31');
    const normalized = normalizeVaultState(badState);
    expect(normalized.fundConfig.projectStartDate).toBe(DEFAULT_PROJECT_START_DATE);
  });
});
