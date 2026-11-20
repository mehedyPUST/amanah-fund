import type { ManagerDeskTab } from '../components/ManagerDeskView.tsx';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  EmailNotification,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatMoney } from './format.ts';

export type AlertTone = 'emerald' | 'amber' | 'rose' | 'red' | 'sky' | 'slate';

export type AlertIconKey =
  | 'loan'
  | 'contribution'
  | 'poll'
  | 'meeting'
  | 'community'
  | 'account'
  | 'queue'
  | 'notice'
  | 'alert';

export interface BellAlertItem {
  id: string;
  notificationId?: string;
  group: 'treasury' | 'governance';
  tone: AlertTone;
  iconKey: AlertIconKey;
  isPriorityBlink?: boolean;
  categoryLabel: string;
  title: string;
  detail: string;
  timestampLabel: string;
  targetTab: DashboardSectionId;
  managerDeskTab?: ManagerDeskTab;
  billingMonth?: string;
}

export function isMeetingOrNoticeBoardNotification(
  n: Pick<EmailNotification, 'type' | 'relatedId' | 'subject'>
): boolean {
  if (n.type === 'meeting_scheduled') {
    return true;
  }
  if (n.type === 'cooperative_notice') {
    if (n.relatedId?.startsWith('notice-')) {
      return true;
    }
    const subj = (n.subject || '').toLowerCase();
    if (
      subj.startsWith('password reset request') ||
      subj.startsWith('temporary password issued')
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function isNotificationForUser(
  n: Pick<EmailNotification, 'recipientUserId' | 'recipientEmail'>,
  user: Pick<PublicUser, 'id' | 'email' | 'role'>
): boolean {
  if (
    (user.role === 'admin' || user.role === 'manager') &&
    !n.recipientUserId &&
    !n.recipientEmail
  ) {
    return true;
  }
  return (
    n.recipientUserId === user.id ||
    (Boolean(n.recipientEmail) &&
      Boolean(user.email) &&
      n.recipientEmail.toLowerCase() === user.email.toLowerCase())
  );
}

export interface BuildBellAlertsTranslate {
  (key: string, values?: Record<string, string | number | Date>): string;
  has?: (key: string) => boolean;
}

export function buildBellAlerts({
  user,
  userUnread,
  overview,
  contributions,
  loans,
  tNotif,
  now = new Date(),
}: {
  user: Pick<PublicUser, 'id' | 'role'>;
  userUnread: EmailNotification[];
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  tNotif: BuildBellAlertsTranslate;
  now?: Date;
}): BellAlertItem[] {
  const list: BellAlertItem[] = [];
  const ccy = overview?.config.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthLabel = formatBillingMonth(currentMonth);
  const coveredLoanIds = new Set<string>();
  let hasReminderNotif = false;

  const resolveTypeTitle = (type: string, fallback: string) => {
    const key = `types.${type}`;
    if (tNotif.has) {
      return tNotif.has(key) ? tNotif(key) : fallback;
    }
    try {
      return tNotif(key);
    } catch {
      return fallback;
    }
  };

  userUnread.forEach((n) => {
    const timestampLabel = formatDateTime(n.createdAt);
    const subjLower = (n.subject || '').toLowerCase();

    if (n.type === 'loan_approved_confirmation') {
      if (n.relatedId) coveredLoanIds.add(n.relatedId);
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: 'emerald',
        iconKey: 'loan',
        categoryLabel: tNotif('bell.categoryLoan'),
        title: tNotif('types.loan_approved_confirmation'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'ballot' : 'quard-hasan',
      });
    } else if (n.type === 'loan_rejected_notice') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: 'rose',
        iconKey: 'alert',
        categoryLabel: tNotif('bell.categoryLoan'),
        title: tNotif('types.loan_rejected_notice'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'notification' : 'quard-hasan',
      });
    } else if (n.type === 'contribution_placed_manager') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: 'amber',
        iconKey: 'contribution',
        categoryLabel: tNotif('bell.categoryContribution'),
        title: tNotif('types.contribution_placed_manager'),
        detail: n.subject,
        timestampLabel,
        targetTab: isStaff ? 'manager-desk' : 'monthly-contribution',
        managerDeskTab: isStaff ? 'contributions' : undefined,
      });
    } else if (n.type === 'contribution_accepted' || n.type === 'contribution_rejected') {
      const isAccepted = n.type === 'contribution_accepted';
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: isAccepted ? 'emerald' : 'rose',
        iconKey: isAccepted ? 'contribution' : 'alert',
        categoryLabel: tNotif('bell.categoryContribution'),
        title: isAccepted
          ? tNotif('types.contribution_accepted')
          : tNotif('types.contribution_rejected'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'notification' : 'monthly-contribution',
      });
    } else if (n.type === 'monthly_contribution_reminder') {
      hasReminderNotif = true;
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: 'amber',
        iconKey: 'contribution',
        categoryLabel: tNotif('bell.categoryContribution'),
        title: tNotif('bell.pendingContributionReminder'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'notification' : 'monthly-contribution',
        billingMonth: user.role === 'admin' ? undefined : currentMonth,
      });
    } else if (n.type === 'loan_repayment_rejected' || n.type === 'loan_repayment_notice') {
      const isRejected = n.type === 'loan_repayment_rejected';
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: isRejected ? 'rose' : 'emerald',
        iconKey: isRejected ? 'alert' : 'loan',
        categoryLabel: tNotif('bell.categoryLoan'),
        title: isRejected
          ? tNotif('types.loan_repayment_rejected')
          : tNotif('types.loan_repayment_notice'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'notification' : 'quard-hasan',
      });
    } else if (n.type === 'profit_distribution_notice') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'treasury',
        tone: 'emerald',
        iconKey: 'loan',
        categoryLabel: tNotif('bell.categoryProfit'),
        title: tNotif('types.profit_distribution_notice'),
        detail: n.subject,
        timestampLabel,
        targetTab: user.role === 'admin' ? 'fund-overview' : 'my-amanah',
      });
    } else if (n.type === 'meeting_scheduled') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'red',
        iconKey: 'meeting',
        isPriorityBlink: true,
        categoryLabel: tNotif('bell.categoryMeeting'),
        title: tNotif('types.meeting_scheduled'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'notification',
      });
    } else if (n.type === 'cooperative_notice') {
      const isNoticeBoardAlert = isMeetingOrNoticeBoardNotification(n);
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: isNoticeBoardAlert ? 'red' : 'slate',
        iconKey: 'notice',
        isPriorityBlink: isNoticeBoardAlert,
        categoryLabel: tNotif('bell.categoryNotice'),
        title: tNotif('types.cooperative_notice'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'notification',
      });
    } else if (n.type === 'loan_guarantor_requested') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'amber',
        iconKey: 'loan',
        categoryLabel: tNotif('bell.categoryLoan'),
        title: tNotif('types.loan_guarantor_requested'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'quard-hasan',
      });
    } else if (n.type === 'loan_vote_requested' || n.type === 'decision_vote_requested') {
      const isManagerReviewNotice =
        isStaff &&
        n.type === 'loan_vote_requested' &&
        (subjLower.includes('initiate vote') || subjLower.includes('ready to initiate'));
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: isManagerReviewNotice ? 'treasury' : 'governance',
        tone: isManagerReviewNotice ? 'amber' : 'sky',
        iconKey: isManagerReviewNotice ? 'queue' : 'poll',
        categoryLabel: isManagerReviewNotice
          ? tNotif('bell.categoryQueue')
          : tNotif('bell.categoryPoll'),
        title:
          n.type === 'decision_vote_requested'
            ? tNotif('types.decision_vote_requested')
            : tNotif('types.loan_vote_requested'),
        detail: n.subject,
        timestampLabel,
        targetTab: isManagerReviewNotice ? 'manager-desk' : 'ballot',
        managerDeskTab: isManagerReviewNotice ? 'qard-hasan' : undefined,
      });
    } else if (n.type === 'community_post_created' || n.type === 'community_mention') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'sky',
        iconKey: 'community',
        categoryLabel: tNotif('bell.categoryCommunity'),
        title:
          n.type === 'community_mention'
            ? tNotif('types.community_mention')
            : tNotif('types.community_post_created'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'community',
      });
    } else if (n.type === 'community_moderation') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'amber',
        iconKey: 'community',
        categoryLabel: tNotif('bell.categoryCommunity'),
        title: tNotif('types.community_moderation'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'community',
      });
    } else if (n.type === 'signup_pending_admin') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'amber',
        iconKey: 'account',
        categoryLabel: tNotif('bell.categoryAccount'),
        title: tNotif('types.signup_pending_admin'),
        detail: n.subject,
        timestampLabel,
        targetTab: isStaff ? 'member-registry' : 'notification',
      });
    } else if (n.type === 'signup_activation_issued') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'sky',
        iconKey: 'account',
        categoryLabel: tNotif('bell.categoryAccount'),
        title: tNotif('types.signup_activation_issued'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'notification',
      });
    } else if (n.type === 'signup_approved') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'emerald',
        iconKey: 'account',
        categoryLabel: tNotif('bell.categoryAccount'),
        title: tNotif('types.signup_approved'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'my-profile',
      });
    } else if (n.type === 'profile_update_requested') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'amber',
        iconKey: 'account',
        categoryLabel: tNotif('bell.categoryAccount'),
        title: tNotif('types.profile_update_requested'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'member-registry',
      });
    } else if (n.type === 'profile_update_reviewed') {
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'emerald',
        iconKey: 'account',
        categoryLabel: tNotif('bell.categoryAccount'),
        title: tNotif('types.profile_update_reviewed'),
        detail: n.subject,
        timestampLabel,
        targetTab: 'my-profile',
      });
    } else {
      // Exhaustive fallback: ensure no unread inbox notification can ever be silently dropped
      list.push({
        id: `notif-${n.id}`,
        notificationId: n.id,
        group: 'governance',
        tone: 'slate',
        iconKey: 'notice',
        categoryLabel: tNotif('bell.categoryNotice'),
        title: resolveTypeTitle(n.type, n.subject),
        detail: n.subject || n.body,
        timestampLabel,
        targetTab: 'notification',
      });
    }
  });

  // Surface loans newly approved (awaiting disbursement) if not already represented by an unread alert
  loans
    .filter(
      (l) =>
        l.status === 'approved_pending_disbursement' &&
        !coveredLoanIds.has(l.id) &&
        (l.borrowerId === user.id || isStaff)
    )
    .forEach((l) => {
      list.push({
        id: `loan-approved-${l.id}`,
        group: 'treasury',
        tone: 'emerald',
        iconKey: 'loan',
        categoryLabel: tNotif('bell.categoryLoan'),
        title:
          l.borrowerId === user.id
            ? tNotif('bell.yourLoanApproved')
            : tNotif('bell.approvedLoanReadyDisburse'),
        detail: `${l.id} · ${l.borrowerName} · ${formatMoney(l.amount, ccy)}`,
        timestampLabel: formatDateTime(l.approvedAt || l.requestedAt),
        targetTab: isStaff ? 'manager-desk' : 'quard-hasan',
        managerDeskTab: isStaff ? 'qard-hasan' : undefined,
      });
    });

  // Admins do not contribute, so skip personal contribution due reminders for Admins
  if (user.role !== 'admin') {
    const myCurrentMonthContribs = contributions.filter(
      (c) => c.userId === user.id && c.billingMonth === currentMonth
    );
    const hasApprovedOrPendingCurrentMonth = myCurrentMonthContribs.some(
      (c) => c.status === 'approved' || c.status === 'pending'
    );
    const myPendingContribs = contributions.filter(
      (c) => c.userId === user.id && c.status === 'pending'
    );

    if (!hasReminderNotif && !hasApprovedOrPendingCurrentMonth) {
      const targetAmount = overview?.config.monthlyContributionAmount || 5000;
      list.push({
        id: `due-contrib-${currentMonth}`,
        group: 'treasury',
        tone: 'amber',
        iconKey: 'contribution',
        categoryLabel: tNotif('bell.categoryContribution'),
        title: tNotif('bell.contributionDueTitle', { month: currentMonthLabel }),
        detail: tNotif('bell.contributionDueDetail', { amount: formatMoney(targetAmount, ccy) }),
        timestampLabel: tNotif('bell.currentBillingCycle'),
        targetTab: 'monthly-contribution',
        billingMonth: currentMonth,
      });
    } else if (myPendingContribs.length > 0) {
      list.push({
        id: `pending-contrib-${myPendingContribs[0].id}`,
        group: 'treasury',
        tone: 'amber',
        iconKey: 'contribution',
        categoryLabel: tNotif('bell.categoryContribution'),
        title: tNotif('bell.contributionPendingVerification'),
        detail: tNotif('bell.contributionPendingDetail', {
          month: formatBillingMonth(myPendingContribs[0].billingMonth),
          amount: formatMoney(myPendingContribs[0].amount, ccy),
        }),
        timestampLabel: formatDateTime(myPendingContribs[0].submittedAt),
        targetTab: 'monthly-contribution',
      });
    }
  }

  if (isStaff && (overview?.treasury.pendingLoansReviewCount || 0) > 0) {
    const count = overview?.treasury.pendingLoansReviewCount || 0;
    const deskLabel =
      user.role === 'admin' ? tNotif('view.governanceDesk') : tNotif('view.managerDesk');
    list.push({
      id: 'staff-pending-loan-reviews',
      group: 'treasury',
      tone: 'amber',
      iconKey: 'queue',
      categoryLabel: tNotif('bell.categoryQueue'),
      title: tNotif('bell.loansAwaitingVoteTitle'),
      detail: tNotif('bell.loansAwaitingVoteDetail', { count, desk: deskLabel }),
      timestampLabel:
        user.role === 'admin'
          ? tNotif('bell.governanceDeskQueue')
          : tNotif('bell.managerDeskQueue'),
      targetTab: 'manager-desk',
      managerDeskTab: 'qard-hasan',
    });
  }

  if (user.role === 'manager' && (overview?.treasury.pendingContributionsCount || 0) > 0) {
    const count = overview?.treasury.pendingContributionsCount || 0;
    list.push({
      id: 'staff-pending-contribs',
      group: 'treasury',
      tone: 'amber',
      iconKey: 'queue',
      categoryLabel: tNotif('bell.categoryQueue'),
      title: tNotif('bell.depositsAwaitingVerificationTitle'),
      detail: tNotif('bell.depositsAwaitingVerificationDetail', { count }),
      timestampLabel: tNotif('bell.managerDeskQueue'),
      targetTab: 'manager-desk',
      managerDeskTab: 'contributions',
    });
  }

  return list;
}
