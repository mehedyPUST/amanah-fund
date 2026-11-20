'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  Megaphone,
  MessageSquare,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  EmailNotification,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatMoney } from '../utils/format.ts';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';

interface HeaderNotificationBellProps {
  user: PublicUser;
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  notifications: EmailNotification[];
  onNavigate: (tab: DashboardSectionId) => void;
  onOpenManagerDeskTab?: (tab: ManagerDeskTab) => void;
  onOpenContributionMonth: (billingMonth: string) => void;
  onMarkRead: (notificationId: string) => Promise<void>;
}

type BellFilterTab = 'all' | 'treasury' | 'governance';

type AlertTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';

type AlertIconKey =
  | 'loan'
  | 'contribution'
  | 'poll'
  | 'meeting'
  | 'community'
  | 'account'
  | 'queue'
  | 'notice'
  | 'alert';

interface BellAlertItem {
  id: string;
  notificationId?: string;
  group: 'treasury' | 'governance';
  tone: AlertTone;
  iconKey: AlertIconKey;
  categoryLabel: string;
  title: string;
  detail: string;
  timestampLabel: string;
  targetTab: DashboardSectionId;
  managerDeskTab?: ManagerDeskTab;
  billingMonth?: string;
}

const TONE_ICON_SURFACE: Record<AlertTone, string> = {
  emerald:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber:
    'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  rose:
    'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
  sky:
    'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400',
  slate:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function renderAlertIcon(iconKey: AlertIconKey) {
  const cls = 'w-4 h-4';
  switch (iconKey) {
    case 'loan':
      return <HandCoins className={cls} aria-hidden="true" />;
    case 'contribution':
      return <CreditCard className={cls} aria-hidden="true" />;
    case 'poll':
      return <Vote className={cls} aria-hidden="true" />;
    case 'meeting':
      return <CalendarClock className={cls} aria-hidden="true" />;
    case 'community':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'account':
      return <UserCheck className={cls} aria-hidden="true" />;
    case 'queue':
      return <ClipboardCheck className={cls} aria-hidden="true" />;
    case 'notice':
      return <Megaphone className={cls} aria-hidden="true" />;
    case 'alert':
    default:
      return <AlertCircle className={cls} aria-hidden="true" />;
  }
}

export function HeaderNotificationBell({
  user,
  overview,
  contributions,
  loans,
  notifications,
  onNavigate,
  onOpenManagerDeskTab,
  onOpenContributionMonth,
  onMarkRead,
}: HeaderNotificationBellProps) {
  const tNotif = useTranslations('Notifications');
  const tCommon = useTranslations('Common');
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<BellFilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(evt: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evt.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(evt: KeyboardEvent) {
      if (evt.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const ccy = overview?.config.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const alerts = useMemo<BellAlertItem[]>(() => {
    const list: BellAlertItem[] = [];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthLabel = formatBillingMonth(currentMonth);

    const userUnread = notifications.filter(
      (n) =>
        !n.readByRecipient &&
        (n.recipientUserId === user.id ||
          n.recipientEmail.toLowerCase() === user.email.toLowerCase())
    );

    const coveredLoanIds = new Set<string>();

    userUnread.forEach((n) => {
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'ballot' : 'quard-hasan',
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'notification' : 'monthly-contribution',
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'notification' : 'quard-hasan',
        });
      } else if (n.type === 'meeting_scheduled') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          group: 'governance',
          tone: 'sky',
          iconKey: 'meeting',
          categoryLabel: tNotif('bell.categoryMeeting'),
          title: tNotif('types.meeting_scheduled'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'notification',
        });
      } else if (n.type === 'cooperative_notice') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          group: 'governance',
          tone: 'slate',
          iconKey: 'notice',
          categoryLabel: tNotif('bell.categoryNotice'),
          title: tNotif('types.cooperative_notice'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'quard-hasan',
        });
      } else if (n.type === 'loan_vote_requested' || n.type === 'decision_vote_requested') {
        const isManagerReviewNotice =
          isStaff &&
          n.type === 'loan_vote_requested' &&
          (n.subject.toLowerCase().includes('initiate vote') ||
            n.subject.toLowerCase().includes('ready to initiate'));
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
          timestampLabel: formatDateTime(n.createdAt),
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'community',
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
          timestampLabel: formatDateTime(n.createdAt),
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
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'my-profile',
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
      let hasReminderNotif = false;
      userUnread.forEach((n) => {
        if (n.type === 'monthly_contribution_reminder') {
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
            timestampLabel: formatDateTime(n.createdAt),
            targetTab: 'monthly-contribution',
            billingMonth: currentMonth,
          });
        }
      });

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
  }, [notifications, loans, contributions, user.id, user.email, user.role, isStaff, ccy, overview, tNotif]);

  const treasuryCount = useMemo(
    () => alerts.filter((a) => a.group === 'treasury').length,
    [alerts]
  );
  const governanceCount = useMemo(
    () => alerts.filter((a) => a.group === 'governance').length,
    [alerts]
  );
  const markableNotificationIds = useMemo(
    () =>
      alerts
        .map((a) => a.notificationId)
        .filter((id): id is string => Boolean(id)),
    [alerts]
  );
  const visibleAlerts = useMemo(
    () =>
      activeFilter === 'all'
        ? alerts
        : alerts.filter((a) => a.group === activeFilter),
    [alerts, activeFilter]
  );

  const unreadInboxCount = overview?.treasury.unreadNotificationsCount || 0;
  const badgeCount = alerts.length > 0 ? alerts.length : unreadInboxCount;

  async function handleAlertClick(alert: BellAlertItem) {
    setOpen(false);
    if (alert.notificationId) {
      await onMarkRead(alert.notificationId);
    }
    if (alert.targetTab === 'manager-desk' && alert.managerDeskTab && onOpenManagerDeskTab) {
      onOpenManagerDeskTab(alert.managerDeskTab);
    } else if (alert.targetTab === 'monthly-contribution' && alert.billingMonth) {
      onOpenContributionMonth(alert.billingMonth);
    } else {
      onNavigate(alert.targetTab);
    }
  }

  async function handleSingleMarkRead(notificationId: string) {
    if (markingId || markingAll) return;
    setMarkingId(notificationId);
    try {
      await onMarkRead(notificationId);
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || markableNotificationIds.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.allSettled(markableNotificationIds.map((id) => onMarkRead(id)));
    } finally {
      setMarkingAll(false);
    }
  }

  const filterTabs: Array<{ id: BellFilterTab; label: string; count: number }> = [
    { id: 'all', label: tNotif('bell.filterAll'), count: alerts.length },
    { id: 'treasury', label: tNotif('bell.filterTreasury'), count: treasuryCount },
    { id: 'governance', label: tNotif('bell.filterGovernance'), count: governanceCount },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={tNotif('bellAria')}
        aria-label={tNotif('bellAria')}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg border transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
          open
            ? 'border-emerald-500/60 dark:border-emerald-500/50 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
            : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-mono tabular-nums text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile focus scrim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-40 sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="false"
              aria-label={tNotif('panelAria')}
              className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-[60px] sm:top-full sm:right-0 sm:mt-2.5 sm:w-[420px] max-h-[min(560px,calc(100dvh-76px))] flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800/90 shrink-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                        {tNotif('title')}
                      </h2>
                      {badgeCount > 0 && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="font-mono text-xs tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                            {tNotif('activeCount', { count: badgeCount })}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {tNotif('subtitle')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-1">
                    {markableNotificationIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        disabled={markingAll}
                        title={tNotif('markAllRead')}
                        aria-label={tNotif('markAllRead')}
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <CheckCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">{tNotif('markAllRead')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label={tCommon('closeDialog')}
                      title={tCommon('close')}
                      className="w-8 h-8 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Segmented category filter */}
                {alerts.length > 0 && (
                  <div
                    role="tablist"
                    aria-label={tNotif('panelAria')}
                    className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80"
                  >
                    {filterTabs.map((tab) => {
                      const isActive = activeFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveFilter(tab.id)}
                          className={`h-8 px-2 rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          <span className="truncate">{tab.label}</span>
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              isActive
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scrollable Feed */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
                {alerts.length === 0 ? (
                  <div className="px-6 py-10 text-center flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {tNotif('allCaughtUp')}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[270px] leading-relaxed">
                      {tNotif('allCaughtUpDesc')}
                    </p>
                  </div>
                ) : visibleAlerts.length === 0 ? (
                  <div className="px-6 py-9 text-center flex flex-col items-center">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {tNotif('bell.emptyTabTitle')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className="mt-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
                    >
                      {tNotif('bell.emptyTabAction')}
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {visibleAlerts.map((alert) => {
                      const isUnreadNotif = Boolean(alert.notificationId);
                      const isBusy = markingId === alert.notificationId || markingAll;
                      return (
                        <li
                          key={alert.id}
                          className={`group flex items-stretch transition-colors duration-150 ${
                            isUnreadNotif
                              ? 'bg-emerald-50/25 dark:bg-emerald-950/15 hover:bg-slate-50 dark:hover:bg-slate-800/55'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/55'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void handleAlertClick(alert)}
                            className="flex-1 min-w-0 px-4 py-3.5 flex items-start gap-3 text-left cursor-pointer focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/60"
                          >
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${TONE_ICON_SURFACE[alert.tone]}`}
                            >
                              {renderAlertIcon(alert.iconKey)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug truncate">
                                  {alert.title}
                                </span>
                                {isUnreadNotif && (
                                  <span className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                    · {tNotif('bell.newLabel')}
                                  </span>
                                )}
                              </div>

                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                                {alert.detail}
                              </p>

                              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                                <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0">
                                  {alert.categoryLabel}
                                </span>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums truncate">
                                  {alert.timestampLabel}
                                </span>
                              </div>
                            </div>
                          </button>

                          <div className="pr-3 flex items-center gap-0.5 shrink-0">
                            {alert.notificationId && (
                              <button
                                type="button"
                                onClick={() => void handleSingleMarkRead(alert.notificationId!)}
                                disabled={isBusy}
                                title={tNotif('markAsRead')}
                                aria-label={tNotif('markAsRead')}
                                className="w-8 h-8 rounded-lg text-slate-400 dark:text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Check className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleAlertClick(alert)}
                              aria-label={alert.title}
                              className="w-6 h-8 rounded-lg text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-300 flex items-center justify-center transition-all duration-150 group-hover:translate-x-0.5 cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/90 bg-slate-50/75 dark:bg-slate-950/55 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                  {tNotif('unreadCount', { count: unreadInboxCount })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigate('notification');
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-emerald-700 dark:hover:bg-emerald-100 text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>{tNotif('openNotifications')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
