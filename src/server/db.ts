import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { MongoClient, type Db } from 'mongodb';
import type {
  AuditLogEntry,
  Contribution,
  EmailNotification,
  FundConfig,
  HalalProject,
  LoanRequest,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { computeSha256Hash, encryptSensitiveObject, maskReference } from './crypto.ts';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  memberCode: string;
  status: UserStatus;
  joinedAt: string;
  phoneMasked?: string;
}

export interface VaultState {
  users: StoredUser[];
  fundConfig: FundConfig;
  contributions: Contribution[];
  loans: LoanRequest[];
  halalProjects: HalalProject[];
  emailNotifications: EmailNotification[];
  auditLogs: AuditLogEntry[];
}

const VAULT_DIR = path.resolve(process.cwd(), 'data');
const VAULT_FILE = path.join(VAULT_DIR, 'amanah-coop-vault.json');

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let storageEngine: 'mongodb_atlas' | 'encrypted_local_vault' = 'encrypted_local_vault';
let initialized = false;
let memoryState: VaultState | null = null;

function createSeedState(): VaultState {
  const passwordHash = bcrypt.hashSync('Amanah@2026', 10);

  const users: StoredUser[] = [
    {
      id: 'usr-admin-1',
      name: 'Tariq Al-Mansoor',
      email: 'admin@amanahcoop.org',
      passwordHash,
      role: 'admin',
      memberCode: 'AC-001',
      status: 'active',
      joinedAt: '2025-01-10T09:00:00.000Z',
      phoneMasked: '••••4102',
    },
    {
      id: 'usr-mgr-1',
      name: 'Nadia Rahman',
      email: 'manager@amanahcoop.org',
      passwordHash,
      role: 'manager',
      memberCode: 'AC-002',
      status: 'active',
      joinedAt: '2025-01-12T09:00:00.000Z',
      phoneMasked: '••••7831',
    },
    {
      id: 'usr-mem-1',
      name: 'Imran Hossain',
      email: 'imran@amanahcoop.org',
      passwordHash,
      role: 'member',
      memberCode: 'AC-003',
      status: 'active',
      joinedAt: '2025-01-15T09:00:00.000Z',
      phoneMasked: '••••2290',
    },
    {
      id: 'usr-mem-2',
      name: 'Fatima Zahra',
      email: 'fatima@amanahcoop.org',
      passwordHash,
      role: 'member',
      memberCode: 'AC-004',
      status: 'active',
      joinedAt: '2025-02-01T09:00:00.000Z',
      phoneMasked: '••••6514',
    },
    {
      id: 'usr-mem-3',
      name: 'Yusuf Karim',
      email: 'yusuf@amanahcoop.org',
      passwordHash,
      role: 'member',
      memberCode: 'AC-005',
      status: 'active',
      joinedAt: '2025-02-10T09:00:00.000Z',
      phoneMasked: '••••9047',
    },
    {
      id: 'usr-mem-4',
      name: 'Ayesha Siddiqua',
      email: 'ayesha@amanahcoop.org',
      passwordHash,
      role: 'member',
      memberCode: 'AC-006',
      status: 'active',
      joinedAt: '2025-03-01T09:00:00.000Z',
      phoneMasked: '••••3388',
    },
    {
      id: 'usr-pending-1',
      name: 'Bilal Ahmed',
      email: 'bilal@amanahcoop.org',
      passwordHash,
      role: 'member',
      memberCode: 'AC-007',
      status: 'pending_approval',
      joinedAt: '2026-11-13T16:15:00.000Z',
      phoneMasked: '••••5521',
    },
  ];

  const fundConfig: FundConfig = {
    id: 'default-config',
    fundName: 'Amanah Mutual Qard & Halal Fund',
    currency: 'BDT',
    monthlyContributionAmount: 5000,
    maxLoansPerYear: 3,
    maxLoanAmount: 75000,
    maxInstallmentMonths: 12,
    voteThresholdNumerator: 2,
    voteThresholdDenominator: 3,
    maturityDate: '2028-12-31',
    halalInvestmentThesis:
      'Upon reaching the pre-specified maturity date, accumulated cooperative capital transitions from Qard Hasan liquidity into Shariah-screened Mudarabah SME agriculture, healthcare equipment Murabahah, and clean-energy Musharakah ventures.',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'Tariq Al-Mansoor',
  };

  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const contributions: Contribution[] = [];

  months.forEach((billingMonth, mIdx) => {
    users.forEach((user, uIdx) => {
      const isMfs = (mIdx + uIdx) % 2 === 0;
      const refId = isMfs ? `BKX${202600 + mIdx * 10 + uIdx}99` : `IBBL-TXN-${8810 + mIdx * 10 + uIdx}`;
      const senderAccount = isMfs ? `01711-000${100 + uIdx}` : `2050-1940-00${400 + uIdx}`;
      const providerName = isMfs
        ? uIdx % 3 === 0
          ? 'bKash'
          : 'Nagad'
        : 'Islami Bank Bangladesh';

      const id = `contrib-${billingMonth}-${user.id}`;
      const submittedAt = `${billingMonth}-0${Math.min(uIdx + 2, 9)}T10:15:00.000Z`;
      const reviewedAt = `${billingMonth}-10T14:30:00.000Z`;

      const encryptedDetails = encryptSensitiveObject({
        referenceId: refId,
        senderAccount,
        notes: `Monthly cooperative deposit for ${billingMonth}`,
      });

      contributions.push({
        id,
        userId: user.id,
        memberName: user.name,
        memberCode: user.memberCode,
        billingMonth,
        amount: 5000,
        channel: isMfs ? 'mfs' : 'bank',
        providerName,
        maskedReference: maskReference(refId),
        encryptedDetails,
        status: 'approved',
        submittedAt,
        reviewedAt,
        reviewedBy: 'usr-mgr-1',
        reviewerName: 'Nadia Rahman',
        reviewNote: 'Verified against cooperative settlement statement.',
        entryHash: computeSha256Hash({ id, userId: user.id, billingMonth, amount: 5000, refId }),
      });
    });
  });

  // Add 2 pending contributions for November 2026 for Manager approval workflow
  const pending1Ref = 'NGD99481203';
  contributions.unshift({
    id: 'contrib-2026-11-usr-mem-3',
    userId: 'usr-mem-3',
    memberName: 'Yusuf Karim',
    memberCode: 'AC-005',
    billingMonth: '2026-11',
    amount: 5000,
    channel: 'mfs',
    providerName: 'Nagad',
    maskedReference: maskReference(pending1Ref),
    encryptedDetails: encryptSensitiveObject({
      referenceId: pending1Ref,
      senderAccount: '01819-4429047',
      notes: 'November 2026 monthly contribution via Nagad merchant transfer',
    }),
    status: 'pending',
    submittedAt: '2026-11-12T08:40:00.000Z',
    entryHash: computeSha256Hash({ id: 'contrib-2026-11-usr-mem-3', pending1Ref }),
  });

  const pending2Ref = 'DBBL-FT-448219';
  contributions.unshift({
    id: 'contrib-2026-11-usr-mem-4',
    userId: 'usr-mem-4',
    memberName: 'Ayesha Siddiqua',
    memberCode: 'AC-006',
    billingMonth: '2026-11',
    amount: 5000,
    channel: 'bank',
    providerName: 'Dutch-Bangla Bank',
    maskedReference: maskReference(pending2Ref),
    encryptedDetails: encryptSensitiveObject({
      referenceId: pending2Ref,
      senderAccount: '115.107.0043388',
      notes: 'BEFTN deposit for November cycle',
    }),
    status: 'pending',
    submittedAt: '2026-11-13T11:20:00.000Z',
    entryHash: computeSha256Hash({ id: 'contrib-2026-11-usr-mem-4', pending2Ref }),
  });

  // Loans:
  // 1) Active loan for Imran Hossain (AC-003) with 6 monthly installments (2 paid, 1 pending_verification, 3 scheduled)
  const loan1Installments = [1, 2, 3, 4, 5, 6].map((num) => {
    const monthNum = 8 + num; // Sep 2026 -> Feb 2027
    const year = monthNum > 12 ? 2027 : 2026;
    const m = monthNum > 12 ? monthNum - 12 : monthNum;
    const dueDate = `${year}-${String(m).padStart(2, '0')}-15`;
    if (num <= 2) {
      const rRef = `RPY-BK-${700 + num}`;
      return {
        installmentNumber: num,
        dueDate,
        amount: 5000,
        paidAmount: 5000,
        status: 'paid' as const,
        submittedAt: `${dueDate.slice(0, 8)}12T10:00:00.000Z`,
        paidAt: `${dueDate.slice(0, 8)}13T15:00:00.000Z`,
        repaymentChannel: 'mfs' as const,
        repaymentProvider: 'bKash',
        maskedReference: maskReference(rRef),
        encryptedReceipt: encryptSensitiveObject({
          referenceId: rRef,
          senderAccount: '01711-000102',
          notes: `Installment #${num} Qard Hasan repayment`,
        }),
        verifiedBy: 'usr-mgr-1',
        verifierName: 'Nadia Rahman',
      };
    }
    if (num === 3) {
      const rRef = 'RPY-NG-88341';
      return {
        installmentNumber: num,
        dueDate,
        amount: 5000,
        paidAmount: 0,
        status: 'pending_verification' as const,
        submittedAt: '2026-11-13T09:30:00.000Z',
        repaymentChannel: 'mfs' as const,
        repaymentProvider: 'Nagad',
        maskedReference: maskReference(rRef),
        encryptedReceipt: encryptSensitiveObject({
          referenceId: rRef,
          senderAccount: '01711-000102',
          notes: 'November installment paid early via Nagad',
        }),
      };
    }
    return {
      installmentNumber: num,
      dueDate,
      amount: 5000,
      paidAmount: 0,
      status: 'scheduled' as const,
    };
  });

  const loan1: LoanRequest = {
    id: 'loan-2026-001',
    borrowerId: 'usr-mem-1',
    borrowerName: 'Imran Hossain',
    borrowerCode: 'AC-003',
    amount: 30000,
    installmentMonths: 6,
    monthlyInstallment: 5000,
    purpose: 'Family medical procedure & short-term household bridge',
    encryptedSensitiveNotes: encryptSensitiveObject({
      emergencyContext: 'Hospital surgery deposit; zero-interest Qard Hasan requested for 6 months.',
      disbursementAccount: '2050-1940-00402',
      channel: 'bank',
      provider: 'Islami Bank Bangladesh',
    }),
    status: 'active',
    eligibilitySnapshot: {
      noActiveLoan: true,
      loansUsedThisYear: 0,
      maxLoansPerYear: 3,
      quotaAvailable: true,
      beforeMaturityDate: true,
      eligible: true,
      reasons: ['No active loan at application time', 'Annual quota: 0 of 3 used'],
    },
    votes: [
      {
        voterId: 'usr-admin-1',
        voterName: 'Tariq Al-Mansoor',
        voterRole: 'admin',
        decision: 'approve',
        comment: 'Verified medical need; monthly income covers 5,000 installment.',
        castAt: '2026-08-20T10:00:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-001', voter: 'usr-admin-1' }),
      },
      {
        voterId: 'usr-mgr-1',
        voterName: 'Nadia Rahman',
        voterRole: 'manager',
        decision: 'approve',
        comment: 'Consistent contributor since Jan 2025.',
        castAt: '2026-08-20T12:15:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-001', voter: 'usr-mgr-1' }),
      },
      {
        voterId: 'usr-mem-2',
        voterName: 'Fatima Zahra',
        voterRole: 'member',
        decision: 'approve',
        castAt: '2026-08-21T09:10:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-001', voter: 'usr-mem-2' }),
      },
      {
        voterId: 'usr-mem-3',
        voterName: 'Yusuf Karim',
        voterRole: 'member',
        decision: 'approve',
        castAt: '2026-08-21T16:40:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-001', voter: 'usr-mem-3' }),
      },
    ],
    requiredApprovals: 4,
    totalEligibleVoters: 6,
    disbursementSignature: {
      signedById: 'usr-mgr-1',
      signedByName: 'Nadia Rahman',
      signedByRole: 'manager',
      signedAt: '2026-08-22T11:00:00.000Z',
      signatureHash: computeSha256Hash({ disburse: 'loan-2026-001', by: 'usr-mgr-1' }),
    },
    installments: loan1Installments,
    totalRepaid: 10000,
    remainingBalance: 20000,
    requestedAt: '2026-08-19T09:00:00.000Z',
    approvedAt: '2026-08-21T16:40:00.000Z',
    disbursedAt: '2026-08-22T11:00:00.000Z',
    entryHash: computeSha256Hash({ id: 'loan-2026-001', amount: 30000 }),
  };

  // 2) Repaid loan earlier in 2026 for Yusuf Karim (AC-005)
  const loan2: LoanRequest = {
    id: 'loan-2026-002',
    borrowerId: 'usr-mem-3',
    borrowerName: 'Yusuf Karim',
    borrowerCode: 'AC-005',
    amount: 15000,
    installmentMonths: 3,
    monthlyInstallment: 5000,
    purpose: 'University semester tuition bridge',
    encryptedSensitiveNotes: encryptSensitiveObject({
      emergencyContext: 'Semester registration deadline before salary clearance.',
      disbursementAccount: '01819-4429047',
      channel: 'mfs',
      provider: 'Nagad',
    }),
    status: 'repaid',
    eligibilitySnapshot: {
      noActiveLoan: true,
      loansUsedThisYear: 0,
      maxLoansPerYear: 3,
      quotaAvailable: true,
      beforeMaturityDate: true,
      eligible: true,
      reasons: ['No active loan', 'Annual quota: 0 of 3 used'],
    },
    votes: [
      {
        voterId: 'usr-admin-1',
        voterName: 'Tariq Al-Mansoor',
        voterRole: 'admin',
        decision: 'approve',
        castAt: '2026-05-05T10:00:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-002', voter: 'usr-admin-1' }),
      },
      {
        voterId: 'usr-mgr-1',
        voterName: 'Nadia Rahman',
        voterRole: 'manager',
        decision: 'approve',
        castAt: '2026-05-05T11:20:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-002', voter: 'usr-mgr-1' }),
      },
      {
        voterId: 'usr-mem-1',
        voterName: 'Imran Hossain',
        voterRole: 'member',
        decision: 'approve',
        castAt: '2026-05-05T14:00:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-002', voter: 'usr-mem-1' }),
      },
      {
        voterId: 'usr-mem-4',
        voterName: 'Ayesha Siddiqua',
        voterRole: 'member',
        decision: 'approve',
        castAt: '2026-05-06T08:45:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-002', voter: 'usr-mem-4' }),
      },
    ],
    requiredApprovals: 4,
    totalEligibleVoters: 6,
    disbursementSignature: {
      signedById: 'usr-admin-1',
      signedByName: 'Tariq Al-Mansoor',
      signedByRole: 'admin',
      signedAt: '2026-05-06T12:00:00.000Z',
      signatureHash: computeSha256Hash({ disburse: 'loan-2026-002', by: 'usr-admin-1' }),
    },
    installments: [1, 2, 3].map((num) => ({
      installmentNumber: num,
      dueDate: `2026-0${5 + num}-15`,
      amount: 5000,
      paidAmount: 5000,
      status: 'paid' as const,
      paidAt: `2026-0${5 + num}-14T12:00:00.000Z`,
      repaymentChannel: 'mfs' as const,
      repaymentProvider: 'Nagad',
      maskedReference: `••••71${num}0`,
      verifiedBy: 'usr-mgr-1',
      verifierName: 'Nadia Rahman',
    })),
    totalRepaid: 15000,
    remainingBalance: 0,
    requestedAt: '2026-05-04T09:00:00.000Z',
    approvedAt: '2026-05-06T08:45:00.000Z',
    disbursedAt: '2026-05-06T12:00:00.000Z',
    completedAt: '2026-08-14T12:00:00.000Z',
    entryHash: computeSha256Hash({ id: 'loan-2026-002', amount: 15000 }),
  };

  // 3) Pending 2/3 vote loan for Fatima Zahra (AC-004): currently has 3 approvals out of 4 required!
  const loan3: LoanRequest = {
    id: 'loan-2026-003',
    borrowerId: 'usr-mem-2',
    borrowerName: 'Fatima Zahra',
    borrowerCode: 'AC-004',
    amount: 24000,
    installmentMonths: 6,
    monthlyInstallment: 4000,
    purpose: 'Home solar inverter & backup battery emergency replacement',
    encryptedSensitiveNotes: encryptSensitiveObject({
      emergencyContext: 'Critical power backup needed for remote clinical tele-work.',
      disbursementAccount: '01912-8836514',
      channel: 'mfs',
      provider: 'bKash',
    }),
    status: 'pending_vote',
    eligibilitySnapshot: {
      noActiveLoan: true,
      loansUsedThisYear: 0,
      maxLoansPerYear: 3,
      quotaAvailable: true,
      beforeMaturityDate: true,
      eligible: true,
      reasons: ['No active loan', 'Annual quota: 0 of 3 used'],
    },
    votes: [
      {
        voterId: 'usr-mgr-1',
        voterName: 'Nadia Rahman',
        voterRole: 'manager',
        decision: 'approve',
        comment: 'Treasury liquidity supports 24,000 disbursement cleanly.',
        castAt: '2026-11-11T10:30:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-003', voter: 'usr-mgr-1' }),
      },
      {
        voterId: 'usr-mem-3',
        voterName: 'Yusuf Karim',
        voterRole: 'member',
        decision: 'approve',
        comment: 'Supportive of essential household infrastructure.',
        castAt: '2026-11-12T15:05:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-003', voter: 'usr-mem-3' }),
      },
      {
        voterId: 'usr-mem-4',
        voterName: 'Ayesha Siddiqua',
        voterRole: 'member',
        decision: 'approve',
        castAt: '2026-11-13T09:15:00.000Z',
        signatureHash: computeSha256Hash({ loan: 'loan-2026-003', voter: 'usr-mem-4' }),
      },
    ],
    requiredApprovals: 4,
    totalEligibleVoters: 6,
    installments: [1, 2, 3, 4, 5, 6].map((num) => {
      const m = 11 + num;
      const year = m > 12 ? 2027 : 2026;
      const month = m > 12 ? m - 12 : m;
      return {
        installmentNumber: num,
        dueDate: `${year}-${String(month).padStart(2, '0')}-15`,
        amount: 4000,
        paidAmount: 0,
        status: 'scheduled' as const,
      };
    }),
    totalRepaid: 0,
    remainingBalance: 24000,
    requestedAt: '2026-11-11T08:45:00.000Z',
    entryHash: computeSha256Hash({ id: 'loan-2026-003', amount: 24000 }),
  };

  const halalProjects: HalalProject[] = [
    {
      id: 'halal-proj-1',
      title: 'AgriCold Solar Cold-Storage Cooperative',
      sector: 'Sustainable Agriculture',
      shariahStructure: 'Musharakah',
      targetAllocation: 120000,
      projectedAnnualReturn: '11.5% – 14.0% p.a.',
      riskTier: 'Balanced',
      status: 'vetted',
      shariahScholarNote: 'Asset-backed joint venture; zero riba leverage; profit/loss shared proportionally.',
      createdAt: '2026-09-10T10:00:00.000Z',
      votingStatus: 'approved',
      requiredApprovals: 4,
      totalEligibleVoters: 6,
      proposedBy: 'Tariq Al-Mansoor',
      approvedAt: '2026-09-14T16:20:00.000Z',
      votes: [
        {
          voterId: 'usr-admin-1',
          voterName: 'Tariq Al-Mansoor',
          voterRole: 'admin',
          decision: 'yes',
          comment: 'Strong collateralized agricultural yield.',
          castAt: '2026-09-11T09:00:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-1', voter: 'usr-admin-1', d: 'yes' }),
        },
        {
          voterId: 'usr-mgr-1',
          voterName: 'Nadia Rahman',
          voterRole: 'manager',
          decision: 'yes',
          comment: 'Audit financials verified.',
          castAt: '2026-09-12T11:30:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-1', voter: 'usr-mgr-1', d: 'yes' }),
        },
        {
          voterId: 'usr-mem-1',
          voterName: 'Imran Hossain',
          voterRole: 'member',
          decision: 'yes',
          castAt: '2026-09-13T14:10:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-1', voter: 'usr-mem-1', d: 'yes' }),
        },
        {
          voterId: 'usr-mem-2',
          voterName: 'Fatima Zahra',
          voterRole: 'member',
          decision: 'yes',
          castAt: '2026-09-14T16:20:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-1', voter: 'usr-mem-2', d: 'yes' }),
        },
      ],
    },
    {
      id: 'halal-proj-2',
      title: 'Community Diagnostic Clinic Equipment Pool',
      sector: 'Healthcare Infrastructure',
      shariahStructure: 'Murabahah',
      targetAllocation: 85000,
      projectedAnnualReturn: '9.0% – 10.5% p.a.',
      riskTier: 'Conservative',
      status: 'proposed',
      shariahScholarNote: 'Cost-plus medical imaging procurement with verified clinic lease contracts.',
      createdAt: '2026-10-02T14:20:00.000Z',
      votingStatus: 'open',
      requiredApprovals: 4,
      totalEligibleVoters: 6,
      proposedBy: 'Nadia Rahman',
      votes: [
        {
          voterId: 'usr-mgr-1',
          voterName: 'Nadia Rahman',
          voterRole: 'manager',
          decision: 'yes',
          comment: 'Fixed lease margin backed by hospital hardware.',
          castAt: '2026-10-04T10:15:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-2', voter: 'usr-mgr-1', d: 'yes' }),
        },
        {
          voterId: 'usr-mem-2',
          voterName: 'Fatima Zahra',
          voterRole: 'member',
          decision: 'yes',
          comment: 'Essential healthcare community asset.',
          castAt: '2026-10-05T12:00:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-2', voter: 'usr-mem-2', d: 'yes' }),
        },
        {
          voterId: 'usr-mem-3',
          voterName: 'Yusuf Karim',
          voterRole: 'member',
          decision: 'yes',
          castAt: '2026-10-06T15:45:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-2', voter: 'usr-mem-3', d: 'yes' }),
        },
      ],
    },
    {
      id: 'halal-proj-3',
      title: 'Artisanal Textile Loom Working Capital',
      sector: 'Ethical Manufacturing',
      shariahStructure: 'Mudarabah',
      targetAllocation: 60000,
      projectedAnnualReturn: '13.0% – 16.5% p.a.',
      riskTier: 'Growth',
      status: 'proposed',
      shariahScholarNote: 'Pending final quarterly audit of buyer purchase orders before 2028 maturity.',
      createdAt: '2026-11-01T11:00:00.000Z',
      votingStatus: 'open',
      requiredApprovals: 4,
      totalEligibleVoters: 6,
      proposedBy: 'Nadia Rahman',
      votes: [
        {
          voterId: 'usr-mem-3',
          voterName: 'Yusuf Karim',
          voterRole: 'member',
          decision: 'yes',
          comment: 'Supports rural cooperative weavers.',
          castAt: '2026-11-03T10:00:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-3', voter: 'usr-mem-3', d: 'yes' }),
        },
        {
          voterId: 'usr-mem-4',
          voterName: 'Ayesha Siddiqua',
          voterRole: 'member',
          decision: 'no',
          comment: 'Prefer waiting until export receivables are insured.',
          castAt: '2026-11-04T13:20:00.000Z',
          signatureHash: computeSha256Hash({ proj: 'halal-proj-3', voter: 'usr-mem-4', d: 'no' }),
        },
      ],
    },
  ];

  const log1Payload = { event: 'treasury_genesis', maturityDate: fundConfig.maturityDate, maxLoansPerYear: 3 };
  const log1Hash = computeSha256Hash({ index: 1, ...log1Payload });

  const log2Payload = { loanId: 'loan-2026-001', borrower: 'AC-003', amount: 30000, quorum: '4/6' };
  const log2Hash = computeSha256Hash({ prevHash: log1Hash, ...log2Payload });

  const log3Payload = { loanId: 'loan-2026-003', borrower: 'AC-004', amount: 24000, currentVotes: '3/4' };
  const log3Hash = computeSha256Hash({ prevHash: log2Hash, ...log3Payload });

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'audit-003',
      timestamp: '2026-11-13T09:15:00.000Z',
      actorId: 'usr-mem-4',
      actorName: 'Ayesha Siddiqua',
      actorRole: 'member',
      action: 'LOAN_VOTE_CAST',
      resourceType: 'vote',
      resourceId: 'loan-2026-003',
      summary: 'Ayesha Siddiqua cast APPROVE vote on Fatima Zahra Qard Hasan request (3/4 quorum reached)',
      encryptedPayload: encryptSensitiveObject(log3Payload),
      prevHash: log2Hash,
      entryHash: log3Hash,
    },
    {
      id: 'audit-002',
      timestamp: '2026-08-22T11:00:00.000Z',
      actorId: 'usr-mgr-1',
      actorName: 'Nadia Rahman',
      actorRole: 'manager',
      action: 'LOAN_DISBURSED',
      resourceType: 'loan',
      resourceId: 'loan-2026-001',
      summary: 'Multi-sig disbursement executed for Imran Hossain (AC-003) — 30,000 Qard Hasan',
      encryptedPayload: encryptSensitiveObject(log2Payload),
      prevHash: log1Hash,
      entryHash: log2Hash,
    },
    {
      id: 'audit-001',
      timestamp: '2026-01-01T00:05:00.000Z',
      actorId: 'usr-admin-1',
      actorName: 'Tariq Al-Mansoor',
      actorRole: 'admin',
      action: 'FUND_CONFIG_INITIALIZED',
      resourceType: 'config',
      resourceId: 'default-config',
      summary: 'Cooperative fund initialized with 2028-12-31 Halal maturity date and 3 loans/year limit',
      encryptedPayload: encryptSensitiveObject(log1Payload),
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryHash: log1Hash,
    },
  ];

  const emailNotifications: EmailNotification[] = [
    {
      id: 'notif-004',
      type: 'signup_pending_admin',
      recipientEmail: 'admin@amanahcoop.org',
      recipientName: 'Tariq Al-Mansoor',
      recipientUserId: 'usr-admin-1',
      subject: 'New Member Registration Awaiting Approval — Bilal Ahmed (AC-007)',
      body: 'Bilal Ahmed (bilal@amanahcoop.org) submitted a cooperative membership application. Please review and approve their account in Admin & Reports before they can sign in.',
      deliveryChannel: 'in_app_outbox',
      deliveryStatus: 'queued',
      relatedId: 'usr-pending-1',
      createdAt: '2026-11-13T16:15:00.000Z',
      readByRecipient: false,
    },
    {
      id: 'notif-003',
      type: 'contribution_placed_manager',
      recipientEmail: 'manager@amanahcoop.org',
      recipientName: 'Nadia Rahman',
      recipientUserId: 'usr-mgr-1',
      subject: 'Contribution Placement Request — Ayesha Siddiqua (Nov 2026)',
      body: 'Ayesha Siddiqua (AC-006) placed a monthly contribution request of 5,000 BDT via Dutch-Bangla Bank (Ref ••••8219). Please review and approve to credit the central balance.',
      deliveryChannel: 'in_app_outbox',
      deliveryStatus: 'queued',
      relatedId: 'contrib-2026-11-usr-mem-4',
      createdAt: '2026-11-13T11:20:00.000Z',
      readByRecipient: false,
    },
    {
      id: 'notif-002',
      type: 'loan_repayment_notice',
      recipientEmail: 'imran@amanahcoop.org',
      recipientName: 'Imran Hossain',
      recipientUserId: 'usr-mem-1',
      subject: 'Qard Hasan Repayment Reminder — Installment #3 Due',
      body: 'Assalamu Alaikum Imran, installment #3 (5,000 BDT) for loan loan-2026-001 is scheduled. Verified repayments immediately restore central cooperative balance.',
      deliveryChannel: 'in_app_outbox',
      deliveryStatus: 'queued',
      relatedId: 'loan-2026-001',
      createdAt: '2026-11-10T09:00:00.000Z',
      readByRecipient: false,
    },
    {
      id: 'notif-001',
      type: 'loan_approved_confirmation',
      recipientEmail: 'imran@amanahcoop.org',
      recipientName: 'Imran Hossain',
      recipientUserId: 'usr-mem-1',
      subject: 'Loan Acceptance Confirmation — 30,000 BDT Qard Hasan Approved',
      body: 'Your Qard Hasan loan request (loan-2026-001) achieved 2/3 member approval (4/6 votes) and 30,000 BDT was deducted from the central balance for disbursement.',
      deliveryChannel: 'in_app_outbox',
      deliveryStatus: 'queued',
      relatedId: 'loan-2026-001',
      createdAt: '2026-08-22T11:00:00.000Z',
      readByRecipient: true,
    },
  ];

  return {
    users,
    fundConfig,
    contributions,
    loans: [loan3, loan1, loan2],
    halalProjects,
    emailNotifications,
    auditLogs,
  };
}

function normalizeVaultState(state: VaultState): VaultState {
  state.emailNotifications = Array.isArray(state.emailNotifications)
    ? state.emailNotifications
    : [];
  const activeVoters = Math.max(1, state.users.filter((u) => u.status === 'active').length);
  const reqApprovals = Math.max(
    1,
    Math.ceil(
      (activeVoters * (state.fundConfig.voteThresholdNumerator || 2)) /
        (state.fundConfig.voteThresholdDenominator || 3)
    )
  );

  state.halalProjects = (state.halalProjects || []).map((proj) => {
    const votes = Array.isArray(proj.votes) ? proj.votes : [];
    const yesCount = votes.filter((v) => v.decision === 'yes').length;
    const noCount = votes.filter((v) => v.decision === 'no').length;
    const totalEligibleVoters = proj.totalEligibleVoters || activeVoters;
    const requiredApprovals = proj.requiredApprovals || reqApprovals;
    let votingStatus = proj.votingStatus;
    if (!votingStatus) {
      if (yesCount >= requiredApprovals || proj.status === 'vetted') {
        votingStatus = 'approved';
      } else if (noCount > totalEligibleVoters - requiredApprovals) {
        votingStatus = 'rejected';
      } else {
        votingStatus = 'open';
      }
    }
    return {
      ...proj,
      votes,
      totalEligibleVoters,
      requiredApprovals,
      votingStatus,
    };
  });
  return state;
}

function readLocalVault(): VaultState {
  if (memoryState) return memoryState;
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const seed = createSeedState();
    fs.writeFileSync(VAULT_FILE, JSON.stringify(seed, null, 2), 'utf8');
    memoryState = seed;
    return seed;
  }
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  memoryState = normalizeVaultState(JSON.parse(raw) as VaultState);
  return memoryState;
}

function writeLocalVault(state: VaultState): void {
  memoryState = state;
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  fs.writeFileSync(VAULT_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function initDatabase(): Promise<'mongodb_atlas' | 'encrypted_local_vault'> {
  if (initialized) return storageEngine;

  const uri = process.env.MONGODB_URI;
  if (uri && uri.startsWith('mongodb') && !uri.includes('<username>')) {
    try {
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4500 });
      await mongoClient.connect();
      mongoDb = mongoClient.db('amanah_coop');
      storageEngine = 'mongodb_atlas';

      const usersCount = await mongoDb.collection('users').countDocuments();
      if (usersCount === 0) {
        const seed = createSeedState();
        await mongoDb.collection('users').insertMany(seed.users);
        await mongoDb.collection('fundConfig').insertOne(seed.fundConfig);
        if (seed.contributions.length) await mongoDb.collection('contributions').insertMany(seed.contributions);
        if (seed.loans.length) await mongoDb.collection('loans').insertMany(seed.loans);
        if (seed.halalProjects.length) await mongoDb.collection('halalProjects').insertMany(seed.halalProjects);
        if (seed.emailNotifications.length) await mongoDb.collection('emailNotifications').insertMany(seed.emailNotifications);
        if (seed.auditLogs.length) await mongoDb.collection('auditLogs').insertMany(seed.auditLogs);
      } else {
        const notifCount = await mongoDb.collection('emailNotifications').countDocuments();
        if (notifCount === 0) {
          const seed = createSeedState();
          if (seed.emailNotifications.length) {
            await mongoDb.collection('emailNotifications').insertMany(seed.emailNotifications);
          }
        }
        const pendingUserExists = await mongoDb
          .collection('users')
          .findOne({ email: 'bilal@amanahcoop.org' });
        if (!pendingUserExists) {
          const seed = createSeedState();
          const bilal = seed.users.find((u) => u.email === 'bilal@amanahcoop.org');
          if (bilal) {
            await mongoDb.collection('users').insertOne(bilal);
          }
        }
      }
      initialized = true;
      return storageEngine;
    } catch (err) {
      console.warn('[DB] MongoDB Atlas connection failed, falling back to encrypted local vault:', err);
      mongoClient = null;
      mongoDb = null;
    }
  }

  storageEngine = 'encrypted_local_vault';
  readLocalVault();
  initialized = true;
  return storageEngine;
}

export function getStorageEngine(): 'mongodb_atlas' | 'encrypted_local_vault' {
  return storageEngine;
}

export async function loadVaultState(): Promise<VaultState> {
  await initDatabase();
  if (mongoDb) {
    const [users, configDoc, contributions, loans, halalProjects, emailNotifications, auditLogs] =
      await Promise.all([
        mongoDb.collection<StoredUser>('users').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection<FundConfig>('fundConfig').findOne({ id: 'default-config' }, { projection: { _id: 0 } }),
        mongoDb.collection<Contribution>('contributions').find({}, { projection: { _id: 0 } }).sort({ submittedAt: -1 }).toArray(),
        mongoDb.collection<LoanRequest>('loans').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
        mongoDb.collection<HalalProject>('halalProjects').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection<EmailNotification>('emailNotifications').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
        mongoDb.collection<AuditLogEntry>('auditLogs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
      ]);

    return normalizeVaultState({
      users,
      fundConfig: configDoc || createSeedState().fundConfig,
      contributions,
      loans,
      halalProjects,
      emailNotifications,
      auditLogs,
    });
  }
  return readLocalVault();
}

export async function updateVaultState(mutator: (state: VaultState) => VaultState | Promise<VaultState>): Promise<VaultState> {
  const current = await loadVaultState();
  const next = await mutator(structuredClone(current));

  if (mongoDb) {
    await Promise.all([
      mongoDb.collection('users').deleteMany({}).then(() => (next.users.length ? mongoDb!.collection('users').insertMany(next.users) : null)),
      mongoDb.collection('fundConfig').replaceOne({ id: 'default-config' }, next.fundConfig, { upsert: true }),
      mongoDb
        .collection('contributions')
        .deleteMany({})
        .then(() => (next.contributions.length ? mongoDb!.collection('contributions').insertMany(next.contributions) : null)),
      mongoDb.collection('loans').deleteMany({}).then(() => (next.loans.length ? mongoDb!.collection('loans').insertMany(next.loans) : null)),
      mongoDb
        .collection('halalProjects')
        .deleteMany({})
        .then(() => (next.halalProjects.length ? mongoDb!.collection('halalProjects').insertMany(next.halalProjects) : null)),
      mongoDb
        .collection('emailNotifications')
        .deleteMany({})
        .then(() => (next.emailNotifications.length ? mongoDb!.collection('emailNotifications').insertMany(next.emailNotifications) : null)),
      mongoDb
        .collection('auditLogs')
        .deleteMany({})
        .then(() => (next.auditLogs.length ? mongoDb!.collection('auditLogs').insertMany(next.auditLogs) : null)),
    ]);
  } else {
    writeLocalVault(next);
  }
  return next;
}
