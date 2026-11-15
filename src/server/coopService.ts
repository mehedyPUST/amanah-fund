import type {
  AuditLogEntry,
  CommunityPost,
  Contribution,
  ContributionSensitiveDetails,
  DashboardOverview,
  EligibilityCheck,
  EmailNotification,
  HalalProject,
  LeaderboardEntry,
  LoanRequest,
  LoanSensitiveDetails,
  MemberPublicProfile,
  MemberSummary,
  MonthlyCashflowPoint,
  NotificationType,
  PublicUser,
  RepaymentReceiptDetails,
  UserRegistrationDetails,
  UserRole,
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

export function applyOverdueChecksToState(
  state: VaultState,
  referenceDate = new Date()
): { changed: boolean; newlyOverdue: Array<{ loanId: string; borrowerId: string; installmentNumber: number }> } {
  const todayUtc = referenceDate.toISOString().slice(0, 10);
  let changed = false;
  const newlyOverdue: Array<{ loanId: string; borrowerId: string; installmentNumber: number }> = [];

  for (const loan of state.loans) {
    if (loan.status !== 'active') continue;
    for (const inst of loan.installments) {
      if (inst.status === 'scheduled' && inst.dueDate < todayUtc) {
        inst.status = 'overdue';
        changed = true;
        if (!inst.overdueNotifiedAt) {
          inst.overdueNotifiedAt = referenceDate.toISOString();
          newlyOverdue.push({
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            installmentNumber: inst.installmentNumber,
          });
          const borrower = state.users.find((u) => u.id === loan.borrowerId);
          if (borrower) {
            queueEmailNotification(state, {
              type: 'loan_repayment_notice',
              recipientEmail: borrower.email,
              recipientName: borrower.name,
              recipientUserId: borrower.id,
              subject: `Overdue Installment Reminder: ${loan.id} Installment #${inst.installmentNumber}`,
              body: `Assalamu Alaikum ${borrower.name}, installment #${inst.installmentNumber} (${inst.amount} ${state.fundConfig.currency}) for Qard Hasan loan ${loan.id} passed its due date (${inst.dueDate}). Please submit your Bank/MFS repayment reference in the Qard Hasan tab.`,
              relatedId: `${loan.id}#${inst.installmentNumber}`,
            });
          }
        }
      }
    }
  }

  return { changed, newlyOverdue };
}

export function extractMentionedUsers(
  text: string,
  users: VaultState['users'],
  excludeUserId?: string
): Array<{ id: string; name: string; email: string; memberCode: string }> {
  const lower = text.toLowerCase();
  const matched: Array<{ id: string; name: string; email: string; memberCode: string }> = [];
  for (const u of users) {
    if (u.status !== 'active' || u.id === excludeUserId) continue;
    const byCode = `@${u.memberCode.toLowerCase()}`;
    const byName = `@${u.name.toLowerCase()}`;
    if (lower.includes(byCode) || lower.includes(byName)) {
      matched.push({ id: u.id, name: u.name, email: u.email, memberCode: u.memberCode });
    }
  }
  return matched;
}

export function evaluateLoanEligibility(state: VaultState, userId: string): EligibilityCheck {
  const currentYear = new Date().getFullYear();
  const maxLoansPerYear = state.fundConfig.maxLoansPerYear;

  const userLoans = state.loans.filter((l) => l.borrowerId === userId);
  const activeOrPendingLoan = userLoans.find((l) =>
    ['pending_guarantor', 'pending_vote', 'approved_pending_disbursement', 'active'].includes(
      l.status
    )
  );
  const noActiveLoan = !activeOrPendingLoan;

  const overdueCount = userLoans.reduce(
    (sum, l) =>
      sum +
      l.installments.filter(
        (inst) => inst.status === 'overdue'
      ).length,
    0
  );
  const noOverdueInstallments = overdueCount === 0;

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

  if (!noOverdueInstallments) {
    reasons.push(
      `${overdueCount} overdue installment(s) detected. Settle overdue repayments before requesting new financing.`
    );
  } else {
    reasons.push('Zero overdue loan installments.');
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
    noOverdueInstallments,
    overdueCount,
    activeLoanId: activeOrPendingLoan?.id,
    loansUsedThisYear,
    maxLoansPerYear,
    quotaAvailable,
    beforeMaturityDate,
    eligible: noActiveLoan && noOverdueInstallments && quotaAvailable && beforeMaturityDate,
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
  const overdueInstallmentsCount = state.loans.reduce(
    (sum, l) => sum + (l.status === 'active' ? l.installments.filter((i) => i.status === 'overdue').length : 0),
    0
  );

  const totalProfitDistributedPool = Math.round(
    state.halalProjects.reduce(
      (sum, proj) =>
        sum + (proj.distributions || []).reduce((dSum, dist) => dSum + dist.distributablePool, 0),
      0
    ) * 100
  ) / 100;

  const personalContribs = state.contributions.filter((c) => c.userId === currentUser.id);
  const personalApproved = personalContribs.filter((c) => c.status === 'approved');
  const personalPending = personalContribs.filter((c) => c.status === 'pending');

  const personalLoans = state.loans.filter((l) => l.borrowerId === currentUser.id);
  const activeLoanBalance = personalLoans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.remainingBalance, 0);
  const totalRepaidPersonal = personalLoans.reduce((sum, l) => sum + l.totalRepaid, 0);

  const personalTotalContributed = personalApproved.reduce((s, c) => s + c.amount, 0);
  const totalProfitDistributed =
    Math.round(
      state.halalProjects.reduce(
        (sum, proj) =>
          sum +
          (proj.distributions || []).reduce(
            (dSum, dist) =>
              dSum +
              dist.allocations
                .filter((a) => a.userId === currentUser.id)
                .reduce((aSum, a) => aSum + a.payoutAmount, 0),
            0
          ),
        0
      ) * 100
    ) / 100;
  const cooperativeEquity = Math.max(
    0,
    Math.round((personalTotalContributed - activeLoanBalance + totalProfitDistributed) * 100) / 100
  );

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

  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const shiftMonthBack = (ym: string): string => {
    const [yStr, mStr] = ym.split('-');
    const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const leaderboard: LeaderboardEntry[] = state.users
    .filter((u) => u.status === 'active')
    .map((member) => {
      const memberApproved = approvedContributions.filter((c) => c.userId === member.id);
      const totalContributed = memberApproved.reduce((sum, c) => sum + c.amount, 0);
      const paidMonths = new Set(memberApproved.map((c) => c.billingMonth));
      const approvedMonthsCount = paidMonths.size;
      const currentMonthPaid = paidMonths.has(currentMonthKey);

      // Compute consecutive monthly payment streak ending at current month or previous month
      let streak = 0;
      let cursor = currentMonthPaid
        ? currentMonthKey
        : paidMonths.has(prevMonthKey)
          ? prevMonthKey
          : '';
      while (cursor && paidMonths.has(cursor) && streak < 120) {
        streak += 1;
        cursor = shiftMonthBack(cursor);
      }

      // Compute expected months since joining (inclusive of current month, minimum 1)
      const joined = new Date(member.joinedAt);
      const monthsSinceJoined = Number.isNaN(joined.getTime())
        ? 1
        : Math.max(
            1,
            (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
              (now.getUTCMonth() - joined.getUTCMonth()) +
              1
          );
      const denominator = Math.max(monthsSinceJoined, approvedMonthsCount, 1);
      const consistencyScore = Math.min(
        100,
        Math.round((approvedMonthsCount / denominator) * 100)
      );

      return {
        userId: member.id,
        memberName: member.name,
        memberCode: member.memberCode,
        photoUrl: member.photoUrl,
        totalContributed,
        approvedContributionsCount: memberApproved.length,
        approvedMonthsCount,
        currentStreakMonths: streak,
        consistencyScore,
        currentMonthPaid,
        isSelf: member.id === currentUser.id,
      };
    })
    .sort((a, b) => {
      if (b.totalContributed !== a.totalContributed) {
        return b.totalContributed - a.totalContributed;
      }
      if (b.currentStreakMonths !== a.currentStreakMonths) {
        return b.currentStreakMonths - a.currentStreakMonths;
      }
      return b.approvedMonthsCount - a.approvedMonthsCount;
    });

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
      overdueInstallmentsCount,
      totalProfitDistributedPool,
      activeMembersCount: state.users.filter((u) => u.status === 'active').length,
      pendingMembersCount,
      unreadNotificationsCount,
    },
    personal: {
      totalContributed: personalTotalContributed,
      approvedContributionsCount: personalApproved.length,
      pendingContributionsCount: personalPending.length,
      activeLoanBalance,
      totalRepaidPersonal,
      totalProfitDistributed,
      cooperativeEquity,
      eligibility: evaluateLoanEligibility(state, currentUser.id),
    },
    monthlySeries,
    leaderboard,
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

  const anonymizedVotes = loan.votes.map((v, idx) => {
    const isSelf = v.voterId === viewer.id;
    return {
      ...v,
      isSelf,
      voterId: isSelf ? viewer.id : `anon-${v.signatureHash.slice(0, 8)}-${idx + 1}`,
      voterName: isSelf ? 'You (Verified Member)' : `Anonymous Member #${idx + 1}`,
      voterRole: (isSelf ? v.voterRole : 'member') as UserRole,
    };
  });

  return {
    ...loan,
    votes: anonymizedVotes,
    decryptedSensitiveNotes,
    installments: hydratedInstallments,
  };
}

export function hydrateHalalProjectForViewer(
  project: HalalProject,
  viewer: PublicUser
): HalalProject {
  const anonymizedVotes = project.votes.map((v, idx) => {
    const isSelf = v.voterId === viewer.id;
    return {
      ...v,
      isSelf,
      voterId: isSelf ? viewer.id : `anon-${v.signatureHash.slice(0, 8)}-${idx + 1}`,
      voterName: isSelf ? 'You (Verified Member)' : `Anonymous Member #${idx + 1}`,
      voterRole: (isSelf ? v.voterRole : 'member') as UserRole,
    };
  });

  return {
    ...project,
    votes: anonymizedVotes,
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

export function buildMemberPublicProfile(
  state: VaultState,
  targetUserId: string,
  viewer: PublicUser
): MemberPublicProfile | null {
  const target = state.users.find((u) => u.id === targetUserId);
  if (!target) return null;
  if (target.status !== 'active' && viewer.role !== 'admin') return null;

  let reg: UserRegistrationDetails | undefined;
  if (target.encryptedRegistrationDetails) {
    try {
      reg = decryptSensitiveObject<UserRegistrationDetails>(target.encryptedRegistrationDetails);
    } catch {
      reg = undefined;
    }
  }

  const allApprovedContribs = state.contributions.filter((c) => c.status === 'approved');
  const totalPool = allApprovedContribs.reduce((sum, c) => sum + c.amount, 0);

  const memberContribs = state.contributions.filter((c) => c.userId === target.id);
  const memberApproved = memberContribs.filter((c) => c.status === 'approved');
  const memberPending = memberContribs.filter((c) => c.status === 'pending');

  const totalContributed = memberApproved.reduce((sum, c) => sum + c.amount, 0);
  const paidMonths = new Set(memberApproved.map((c) => c.billingMonth));
  const approvedMonthsCount = paidMonths.size;

  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const shiftMonthBack = (ym: string): string => {
    const [yStr, mStr] = ym.split('-');
    const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const currentMonthPaid = paidMonths.has(currentMonthKey);
  let streak = 0;
  let cursor = currentMonthPaid
    ? currentMonthKey
    : paidMonths.has(prevMonthKey)
      ? prevMonthKey
      : '';
  while (cursor && paidMonths.has(cursor) && streak < 120) {
    streak += 1;
    cursor = shiftMonthBack(cursor);
  }

  const joined = new Date(target.joinedAt);
  const monthsSinceJoined = Number.isNaN(joined.getTime())
    ? 1
    : Math.max(
        1,
        (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
          (now.getUTCMonth() - joined.getUTCMonth()) +
          1
      );
  const denominator = Math.max(monthsSinceJoined, approvedMonthsCount, 1);
  const consistencyScore = Math.min(100, Math.round((approvedMonthsCount / denominator) * 100));

  const fundSharePct =
    totalPool > 0 ? Math.round((totalContributed / totalPool) * 10000) / 100 : 0;

  const totalProfitDistributed =
    Math.round(
      state.halalProjects.reduce(
        (sum, proj) =>
          sum +
          (proj.distributions || []).reduce(
            (dSum, dist) =>
              dSum +
              dist.allocations
                .filter((a) => a.userId === target.id)
                .reduce((aSum, a) => aSum + a.payoutAmount, 0),
            0
          ),
        0
      ) * 100
    ) / 100;

  const memberLoans = state.loans.filter((l) => l.borrowerId === target.id);
  const takenLoans = memberLoans.filter((l) =>
    ['approved_pending_disbursement', 'active', 'repaid'].includes(l.status)
  );
  const activeLoanBalance = memberLoans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.remainingBalance, 0);
  const totalRepaid = takenLoans.reduce((sum, l) => sum + l.totalRepaid, 0);
  const loansRepaidCount = memberLoans.filter((l) => l.status === 'repaid').length;

  const cooperativeEquity = Math.max(
    0,
    Math.round((totalContributed - activeLoanBalance + totalProfitDistributed) * 100) / 100
  );

  const guarantorCount = state.loans.filter((l) =>
    (l.guarantors || []).some((g) => g.memberId === target.id && g.status === 'accepted')
  ).length;

  const recentContributions = [...memberApproved]
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, 12)
    .map((c) => ({
      id: c.id,
      billingMonth: c.billingMonth,
      amount: c.amount,
      channel: c.channel,
      submittedAt: c.submittedAt,
      status: 'approved' as const,
    }));

  const isAdmin = viewer.role === 'admin';
  const allActiveCommunityPosts = (state.communityPosts || []).filter(
    (post) => post.status === 'active'
  );

  const rawAuthorPosts = (state.communityPosts || []).filter(
    (post) => post.authorId === target.id && (isAdmin || post.status === 'active')
  );

  const communityPosts: CommunityPost[] = rawAuthorPosts
    .map((post) => ({
      ...post,
      authorPhotoUrl: target.photoUrl || post.authorPhotoUrl,
      authorMuted: Boolean(target.communityMuted),
      reactions: Array.isArray(post.reactions) ? post.reactions : [],
      comments: Array.isArray(post.comments)
        ? post.comments.map((c) => {
            const commentAuthor = state.users.find((u) => u.id === c.authorId);
            return {
              ...c,
              authorPhotoUrl: commentAuthor?.photoUrl || c.authorPhotoUrl,
            };
          })
        : [],
    }))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const activeAuthorPosts = allActiveCommunityPosts.filter((p) => p.authorId === target.id);
  const commentsCount = allActiveCommunityPosts.reduce(
    (sum, p) =>
      sum + (Array.isArray(p.comments) ? p.comments.filter((c) => c.authorId === target.id).length : 0),
    0
  );
  const reactionsReceivedCount = activeAuthorPosts.reduce(
    (sum, p) => sum + (Array.isArray(p.reactions) ? p.reactions.length : 0),
    0
  );

  return {
    id: target.id,
    name: target.name,
    memberCode: target.memberCode,
    role: target.role,
    status: target.status,
    joinedAt: target.joinedAt,
    photoUrl: reg?.photoUrl || target.photoUrl,
    isSelf: target.id === viewer.id,
    about: {
      email: target.email,
      mobile: reg?.mobile || target.phoneMasked || undefined,
      occupation: reg?.occupation || undefined,
      companyOrganization: reg?.companyOrganization || undefined,
      presentAddress: reg?.presentAddress || undefined,
      referenceMemberName: reg?.referenceMemberName || undefined,
      joinedAt: target.joinedAt,
      postsCount: activeAuthorPosts.length,
      commentsCount,
      reactionsReceivedCount,
    },
    fundSummary: {
      currency: state.fundConfig.currency,
      monthlyTarget: state.fundConfig.monthlyContributionAmount,
      totalContributed,
      approvedContributionsCount: memberApproved.length,
      pendingContributionsCount: memberPending.length,
      approvedMonthsCount,
      currentStreakMonths: streak,
      consistencyScore,
      currentMonthPaid,
      fundSharePct,
      totalProfitDistributed,
      activeLoanBalance,
      totalRepaid,
      totalLoansTakenCount: takenLoans.length,
      loansRepaidCount,
      cooperativeEquity,
      guarantorCount,
      recentContributions,
    },
    communityPosts,
  };
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
    ['Last Blueprint Generated', new Date().toISOString(), 'Amanah'],
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

