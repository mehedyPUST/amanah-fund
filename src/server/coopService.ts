import type {
  AuditLogEntry,
  Contribution,
  ContributionSensitiveDetails,
  DashboardOverview,
  EligibilityCheck,
  EmailNotification,
  LoanRequest,
  LoanSensitiveDetails,
  MemberSummary,
  MonthlyCashflowPoint,
  NotificationType,
  PublicUser,
  RepaymentReceiptDetails,
  UserRegistrationDetails,
} from '../types/coop.ts';
import { computeSha256Hash, decryptSensitiveObject, encryptSensitiveObject } from './crypto.ts';
import { getStorageEngine, type VaultState } from './db.ts';

export function queueEmailNotification(
  state: VaultState,
  params: {
    type: NotificationType;
    recipientEmail: string;
    recipientName: string;
    recipientUserId?: string;
    subject: string;
    body: string;
    relatedId?: string;
  }
): EmailNotification {
  const notif: EmailNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: params.type,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    recipientUserId: params.recipientUserId,
    subject: params.subject,
    body: params.body,
    deliveryChannel: 'in_app_outbox',
    deliveryStatus: 'queued',
    relatedId: params.relatedId,
    createdAt: new Date().toISOString(),
    readByRecipient: false,
  };
  state.emailNotifications.unshift(notif);
  return notif;
}

export function appendAuditLog(
  state: VaultState,
  params: {
    actor: PublicUser;
    action: string;
    resourceType: AuditLogEntry['resourceType'];
    resourceId: string;
    summary: string;
    payload: Record<string, unknown>;
  }
): void {
  const prevHash =
    state.auditLogs.length > 0
      ? state.auditLogs[0].entryHash
      : '0000000000000000000000000000000000000000000000000000000000000000';

  const timestamp = new Date().toISOString();
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const encryptedPayload = encryptSensitiveObject(params.payload);
  const entryHash = computeSha256Hash({
    id,
    timestamp,
    actorId: params.actor.id,
    action: params.action,
    resourceId: params.resourceId,
    prevHash,
    payload: params.payload,
  });

  state.auditLogs.unshift({
    id,
    timestamp,
    actorId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    summary: params.summary,
    encryptedPayload,
    prevHash,
    entryHash,
  });
}

export function evaluateLoanEligibility(state: VaultState, userId: string): EligibilityCheck {
  const currentYear = new Date().getFullYear();
  const maxLoansPerYear = state.fundConfig.maxLoansPerYear;

  const userLoans = state.loans.filter((l) => l.borrowerId === userId);
  const activeOrPendingLoan = userLoans.find((l) =>
    ['pending_vote', 'approved_pending_disbursement', 'active'].includes(l.status)
  );
  const noActiveLoan = !activeOrPendingLoan;

  // Count non-rejected loans requested in the current calendar year
  const loansUsedThisYear = userLoans.filter((l) => {
    const reqYear = new Date(l.requestedAt).getFullYear();
    return reqYear === currentYear && l.status !== 'rejected';
  }).length;

  const quotaAvailable = loansUsedThisYear < maxLoansPerYear;

  const now = new Date();
  const maturity = new Date(`${state.fundConfig.maturityDate}T23:59:59.999Z`);
  const beforeMaturityDate = now <= maturity;

  const reasons: string[] = [];
  if (!noActiveLoan && activeOrPendingLoan) {
    reasons.push(
      `Existing loan (${activeOrPendingLoan.id}) is currently "${activeOrPendingLoan.status.replace(/_/g, ' ')}". Only one active or pending Qard Hasan loan is permitted at a time.`
    );
  } else {
    reasons.push('No active or pending Qard Hasan loan.');
  }

  if (!quotaAvailable) {
    reasons.push(
      `Annual limit reached: ${loansUsedThisYear} of ${maxLoansPerYear} permitted loans used in ${currentYear}.`
    );
  } else {
    reasons.push(
      `Annual quota available: ${loansUsedThisYear} of ${maxLoansPerYear} loans used in ${currentYear}.`
    );
  }

  if (!beforeMaturityDate) {
    reasons.push(
      `Fund reached maturity (${state.fundConfig.maturityDate}) and has transitioned to Halal project investment phase.`
    );
  } else {
    reasons.push(`Qard Hasan lending window active until ${state.fundConfig.maturityDate}.`);
  }

  return {
    noActiveLoan,
    activeLoanId: activeOrPendingLoan?.id,
    loansUsedThisYear,
    maxLoansPerYear,
    quotaAvailable,
    beforeMaturityDate,
    eligible: noActiveLoan && quotaAvailable && beforeMaturityDate,
    reasons,
  };
}

export function computeRequiredApprovals(state: VaultState): {
  activeVoters: number;
  requiredApprovals: number;
} {
  const activeVoters = state.users.filter((u) => u.status === 'active').length;
  const requiredApprovals = Math.max(
    1,
    Math.ceil(
      (activeVoters * state.fundConfig.voteThresholdNumerator) /
        state.fundConfig.voteThresholdDenominator
    )
  );
  return { activeVoters, requiredApprovals };
}

export function buildDashboardOverview(state: VaultState, currentUser: PublicUser): DashboardOverview {
  const approvedContributions = state.contributions.filter((c) => c.status === 'approved');
  const pendingContributions = state.contributions.filter((c) => c.status === 'pending');

  const totalContributionsPool = approvedContributions.reduce((sum, c) => sum + c.amount, 0);
  const pendingContributionsAmount = pendingContributions.reduce((sum, c) => sum + c.amount, 0);

  const approvedOrDisbursedLoans = state.loans.filter(
    (l) =>
      l.status === 'approved_pending_disbursement' ||
      l.status === 'active' ||
      l.status === 'repaid'
  );
  const disbursedLoans = state.loans.filter((l) => l.status === 'active' || l.status === 'repaid');
  const approvedLoansDeducted = approvedOrDisbursedLoans.reduce((sum, l) => sum + l.amount, 0);
  const totalLoansDisbursed = disbursedLoans.reduce((sum, l) => sum + l.amount, 0);
  const totalRepaid = approvedOrDisbursedLoans.reduce((sum, l) => sum + l.totalRepaid, 0);
  const activeLoansOutstanding = state.loans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.remainingBalance, 0);

  // Central balance: + Approved Contributions - Approved Loans + Verified Loan Repayments
  const centralBalance = totalContributionsPool - approvedLoansDeducted + totalRepaid;
  const availableLiquidity = Math.max(0, centralBalance);

  const pendingVotesCount = state.loans.filter((l) => l.status === 'pending_vote').length;
  const pendingDisbursementsCount = state.loans.filter(
    (l) => l.status === 'approved_pending_disbursement'
  ).length;
  const pendingRepaymentsCount = state.loans.reduce(
    (sum, l) => sum + l.installments.filter((i) => i.status === 'pending_verification').length,
    0
  );

  const personalContribs = state.contributions.filter((c) => c.userId === currentUser.id);
  const personalApproved = personalContribs.filter((c) => c.status === 'approved');
  const personalPending = personalContribs.filter((c) => c.status === 'pending');

  const personalLoans = state.loans.filter((l) => l.borrowerId === currentUser.id);
  const activeLoanBalance = personalLoans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.remainingBalance, 0);
  const totalRepaidPersonal = personalLoans.reduce((sum, l) => sum + l.totalRepaid, 0);

  const now = new Date();
  const maturity = new Date(`${state.fundConfig.maturityDate}T23:59:59.999Z`);
  const diffMs = maturity.getTime() - now.getTime();
  const daysUntilMaturity = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const phase = now <= maturity ? 'qard_hasan' : 'halal_investment';

  // Build monthly cashflow series from contributions + loans + repayments
  const monthMap = new Map<string, MonthlyCashflowPoint>();
  const ensureMonth = (m: string) => {
    if (!monthMap.has(m)) {
      monthMap.set(m, { month: m, contributions: 0, disbursed: 0, repaid: 0 });
    }
    return monthMap.get(m)!;
  };

  approvedContributions.forEach((c) => {
    ensureMonth(c.billingMonth).contributions += c.amount;
  });
  disbursedLoans.forEach((l) => {
    if (l.disbursedAt) {
      ensureMonth(l.disbursedAt.slice(0, 7)).disbursed += l.amount;
    }
    l.installments.forEach((inst) => {
      if (inst.status === 'paid' && inst.paidAt) {
        ensureMonth(inst.paidAt.slice(0, 7)).repaid += inst.paidAmount;
      }
    });
  });

  const monthlySeries = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  const pendingMembersCount = state.users.filter((u) => u.status === 'pending_approval').length;
  const isStaff = currentUser.role === 'admin' || currentUser.role === 'manager';
  const unreadNotificationsCount = state.emailNotifications.filter((n) => {
    if (n.readByRecipient) return false;
    if (isStaff) return true;
    return n.recipientUserId === currentUser.id || n.recipientEmail === currentUser.email;
  }).length;

  return {
    config: state.fundConfig,
    phase,
    daysUntilMaturity,
    treasury: {
      totalContributionsPool,
      totalLoansDisbursed,
      approvedLoansDeducted,
      totalRepaid,
      activeLoansOutstanding,
      centralBalance,
      availableLiquidity,
      pendingContributionsAmount,
      pendingContributionsCount: pendingContributions.length,
      pendingVotesCount,
      pendingDisbursementsCount,
      pendingRepaymentsCount,
      activeMembersCount: state.users.filter((u) => u.status === 'active').length,
      pendingMembersCount,
      unreadNotificationsCount,
    },
    personal: {
      totalContributed: personalApproved.reduce((s, c) => s + c.amount, 0),
      approvedContributionsCount: personalApproved.length,
      pendingContributionsCount: personalPending.length,
      activeLoanBalance,
      totalRepaidPersonal,
      eligibility: evaluateLoanEligibility(state, currentUser.id),
    },
    monthlySeries,
    storageEngine: getStorageEngine(),
  };
}

export function hydrateContributionForViewer(
  contribution: Contribution,
  viewer: PublicUser
): Contribution {
  const canDecrypt =
    viewer.role === 'admin' || viewer.role === 'manager' || viewer.id === contribution.userId;

  if (!canDecrypt) {
    return { ...contribution, decryptedDetails: undefined };
  }
  try {
    const decryptedDetails = decryptSensitiveObject<ContributionSensitiveDetails>(
      contribution.encryptedDetails
    );
    return { ...contribution, decryptedDetails };
  } catch {
    return contribution;
  }
}

export function hydrateLoanForViewer(loan: LoanRequest, viewer: PublicUser): LoanRequest {
  const canDecryptSensitive =
    viewer.role === 'admin' || viewer.role === 'manager' || viewer.id === loan.borrowerId;

  let decryptedSensitiveNotes: LoanSensitiveDetails | undefined;
  if (canDecryptSensitive) {
    try {
      decryptedSensitiveNotes = decryptSensitiveObject<LoanSensitiveDetails>(
        loan.encryptedSensitiveNotes
      );
    } catch {
      decryptedSensitiveNotes = undefined;
    }
  }

  const hydratedInstallments = loan.installments.map((inst) => {
    if (!inst.encryptedReceipt || !canDecryptSensitive) {
      return { ...inst, decryptedReceipt: undefined };
    }
    try {
      const decryptedReceipt = decryptSensitiveObject<RepaymentReceiptDetails>(
        inst.encryptedReceipt
      );
      return { ...inst, decryptedReceipt };
    } catch {
      return inst;
    }
  });

  return {
    ...loan,
    decryptedSensitiveNotes,
    installments: hydratedInstallments,
  };
}

export function buildMemberSummaries(
  state: VaultState,
  includeRegistrationDetails = false
): MemberSummary[] {
  const currentYear = new Date().getFullYear();
  return state.users.map((u) => {
    const approvedContribs = state.contributions.filter(
      (c) => c.userId === u.id && c.status === 'approved'
    );
    const totalContributed = approvedContribs.reduce((s, c) => s + c.amount, 0);
    const userLoans = state.loans.filter((l) => l.borrowerId === u.id);
    const loansThisYear = userLoans.filter(
      (l) => new Date(l.requestedAt).getFullYear() === currentYear && l.status !== 'rejected'
    ).length;
    const activeLoanBalance = userLoans
      .filter((l) => l.status === 'active')
      .reduce((s, l) => s + l.remainingBalance, 0);
    const hasActiveLoan = userLoans.some((l) =>
      ['pending_vote', 'approved_pending_disbursement', 'active'].includes(l.status)
    );

    let registrationDetails: UserRegistrationDetails | undefined;
    if (includeRegistrationDetails && u.encryptedRegistrationDetails) {
      try {
        registrationDetails = decryptSensitiveObject<UserRegistrationDetails>(
          u.encryptedRegistrationDetails
        );
      } catch {
        registrationDetails = undefined;
      }
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      memberCode: u.memberCode,
      status: u.status,
      joinedAt: u.joinedAt,
      phoneMasked: u.phoneMasked,
      photoUrl: u.photoUrl,
      registrationDetails,
      totalContributed,
      approvedContributionsCount: approvedContribs.length,
      loansThisYear,
      activeLoanBalance,
      hasActiveLoan,
    };
  });
}

export function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface SheetTabBlueprint {
  sheetName: string;
  rows: (string | number)[][];
}

export function buildGoogleSheetsBlueprint(state: VaultState): SheetTabBlueprint[] {
  const approvedContribs = state.contributions.filter((c) => c.status === 'approved');
  const totalContrib = approvedContribs.reduce((s, c) => s + c.amount, 0);
  const approvedLoans = state.loans.filter(
    (l) =>
      l.status === 'approved_pending_disbursement' ||
      l.status === 'active' ||
      l.status === 'repaid'
  );
  const totalLoansDeducted = approvedLoans.reduce((s, l) => s + l.amount, 0);
  const totalRepaid = approvedLoans.reduce((s, l) => s + l.totalRepaid, 0);
  const centralBalance = totalContrib - totalLoansDeducted + totalRepaid;

  const summaryRows: (string | number)[][] = [
    ['Metric', 'Value', 'Notes'],
    ['Fund Name', state.fundConfig.fundName, 'Cooperative entity'],
    ['Currency', state.fundConfig.currency, 'Active ledger currency'],
    ['Maturity Date', state.fundConfig.maturityDate, 'Pre-specified Halal investment transition date'],
    ['Max Loans Per Member / Year', state.fundConfig.maxLoansPerYear, 'Admin configurable annual quota'],
    ['Approved Contributions (+)', totalContrib, `${approvedContribs.length} approved deposits`],
    ['Approved Loans Deducted (-)', totalLoansDeducted, `${approvedLoans.length} approved/active/repaid loans`],
    ['Verified Repayments (+)', totalRepaid, 'Installments returned to fund'],
    ['Central Fund Balance (=)', centralBalance, 'Live available cooperative treasury'],
    ['Active Members', state.users.filter((u) => u.status === 'active').length, 'Eligible voters'],
    ['Last Blueprint Generated', new Date().toISOString(), 'Amanah Co-op Treasury'],
  ];

  const memberSummaries = buildMemberSummaries(state);
  const memberRows: (string | number)[][] = [
    [
      'Member Code',
      'Name',
      'Email',
      'Role',
      'Status',
      'Total Contributed',
      'Loans Used This Year',
      'Active Loan Balance',
      'Joined At',
    ],
    ...memberSummaries.map((m) => [
      m.memberCode,
      m.name,
      m.email,
      m.role,
      m.status,
      m.totalContributed,
      m.loansThisYear,
      m.activeLoanBalance,
      m.joinedAt,
    ]),
  ];

  const contribRows: (string | number)[][] = [
    [
      'Contribution ID',
      'Member Code',
      'Member Name',
      'Billing Month',
      'Amount',
      'Channel',
      'Provider',
      'Masked Ref',
      'Status',
      'Submitted At',
      'Reviewed By',
    ],
    ...state.contributions.map((c) => [
      c.id,
      c.memberCode,
      c.memberName,
      c.billingMonth,
      c.amount,
      c.channel.toUpperCase(),
      c.providerName,
      c.maskedReference,
      c.status,
      c.submittedAt,
      c.reviewerName || '',
    ]),
  ];

  const loanRows: (string | number)[][] = [
    [
      'Loan ID',
      'Borrower Code',
      'Borrower Name',
      'Principal',
      'Installments',
      'Monthly Installment',
      'Total Repaid',
      'Remaining Balance',
      'Approvals',
      'Required 2/3',
      'Status',
      'Requested At',
    ],
    ...state.loans.map((l) => [
      l.id,
      l.borrowerCode,
      l.borrowerName,
      l.amount,
      l.installmentMonths,
      l.monthlyInstallment,
      l.totalRepaid,
      l.remainingBalance,
      l.votes.filter((v) => v.decision === 'approve').length,
      l.requiredApprovals,
      l.status,
      l.requestedAt,
    ]),
  ];

  const installmentRows: (string | number)[][] = [
    [
      'Loan ID',
      'Borrower',
      'Installment #',
      'Due Date',
      'Amount',
      'Paid Amount',
      'Status',
      'Provider',
      'Paid At',
    ],
    ...state.loans.flatMap((l) =>
      l.installments.map((inst) => [
        l.id,
        l.borrowerName,
        inst.installmentNumber,
        inst.dueDate,
        inst.amount,
        inst.paidAmount,
        inst.status,
        inst.repaymentProvider || '',
        inst.paidAt || '',
      ])
    ),
  ];

  const placementRows: (string | number)[][] = [
    [
      'Project ID',
      'Title',
      'Sector',
      'Shariah Structure',
      'Target Allocation',
      'Yes Votes',
      'No Votes',
      'Required 2/3',
      'Voting Status',
      'Project Status',
    ],
    ...state.halalProjects.map((p) => [
      p.id,
      p.title,
      p.sector,
      p.shariahStructure,
      p.targetAllocation,
      p.votes.filter((v) => v.decision === 'yes').length,
      p.votes.filter((v) => v.decision === 'no').length,
      p.requiredApprovals,
      p.votingStatus,
      p.status,
    ]),
  ];

  const notificationRows: (string | number)[][] = [
    ['Notification ID', 'Type', 'Recipient Email', 'Subject', 'Status', 'Channel', 'Created At'],
    ...state.emailNotifications.map((n) => [
      n.id,
      n.type,
      n.recipientEmail,
      n.subject,
      n.deliveryStatus,
      n.deliveryChannel,
      n.createdAt,
    ]),
  ];

  return [
    { sheetName: 'Fund_Summary', rows: summaryRows },
    { sheetName: 'Members', rows: memberRows },
    { sheetName: 'Contributions', rows: contribRows },
    { sheetName: 'Loans', rows: loanRows },
    { sheetName: 'Installments', rows: installmentRows },
    { sheetName: 'Investment_Placements', rows: placementRows },
    { sheetName: 'Email_Notifications', rows: notificationRows },
  ];
}

