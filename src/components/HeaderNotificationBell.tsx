'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, Check, CheckCircle2, Clock, Vote } from 'lucide-react';
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

interface BellAlertItem {
  id: string;
  notificationId?: string;
  kind: 'approved_loan' | 'contribution_reminder' | 'governance' | 'general';
  title: string;
  detail: string;
  timestampLabel: string;
  targetTab: DashboardSectionId;
  managerDeskTab?: ManagerDeskTab;
  billingMonth?: string;
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
  const [open, setOpen] = useState(false);
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
          kind: 'approved_loan',
          title: tNotif('types.loan_approved_confirmation'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'ballot' : 'quard-hasan',
        });
      } else if (n.type === 'contribution_accepted' || n.type === 'contribution_rejected') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'contribution_reminder',
          title:
            n.type === 'contribution_accepted'
              ? tNotif('types.contribution_accepted')
              : tNotif('types.contribution_rejected'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'notification' : 'monthly-contribution',
        });
      } else if (n.type === 'loan_repayment_rejected' || n.type === 'loan_repayment_notice') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'approved_loan',
          title:
            n.type === 'loan_repayment_rejected'
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
          kind: 'governance',
          title: tNotif('types.meeting_scheduled'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'notification',
        });
      } else if (n.type === 'cooperative_notice') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'governance',
          title: tNotif('types.cooperative_notice'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'notification',
        });
      } else if (n.type === 'loan_guarantor_requested') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'governance',
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
          kind: isManagerReviewNotice ? 'approved_loan' : 'governance',
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
          kind: 'governance',
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
          kind: 'governance',
          title: tNotif('types.profile_update_requested'),
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'member-registry',
        });
      } else if (n.type === 'profile_update_reviewed') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'governance',
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
          kind: 'approved_loan',
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
            kind: 'contribution_reminder',
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
          kind: 'contribution_reminder',
          title: tNotif('bell.contributionDueTitle', { month: currentMonthLabel }),
          detail: tNotif('bell.contributionDueDetail', { amount: formatMoney(targetAmount, ccy) }),
          timestampLabel: tNotif('bell.currentBillingCycle'),
          targetTab: 'monthly-contribution',
          billingMonth: currentMonth,
        });
      } else if (myPendingContribs.length > 0) {
        list.push({
          id: `pending-contrib-${myPendingContribs[0].id}`,
          kind: 'contribution_reminder',
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
        kind: 'approved_loan',
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
        kind: 'contribution_reminder',
        title: tNotif('bell.depositsAwaitingVerificationTitle'),
        detail: tNotif('bell.depositsAwaitingVerificationDetail', { count }),
        timestampLabel: tNotif('bell.managerDeskQueue'),
        targetTab: 'manager-desk',
        managerDeskTab: 'contributions',
      });
    }

    return list;
  }, [notifications, loans, contributions, user.id, user.email, user.role, isStaff, ccy, overview, tNotif]);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title={tNotif('bellAria')}
        aria-label={tNotif('bellAria')}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200 cursor-pointer shrink-0 ${
          open
            ? 'border-amber-400 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800'
        }`}
      >
        <Bell className="w-4 h-4" />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white font-mono tabular-nums text-[10px] font-semibold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label={tNotif('panelAria')}
            className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-[58px] sm:top-auto sm:right-0 sm:mt-2 sm:w-96 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-50/50 via-white to-white dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
                  {tNotif('title')}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {tNotif('subtitle')}
                </p>
              </div>
              {badgeCount > 0 && (
                <span className="font-mono text-xs tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {tNotif('activeCount', { count: badgeCount })}
                </span>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <CheckCircle2
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto"
                  aria-hidden="true"
                />
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {tNotif('allCaughtUp')}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {tNotif('allCaughtUpDesc')}
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {alerts.map((alert) => {
                  const isLoan = alert.kind === 'approved_loan';
                  const isGovernance = alert.kind === 'governance';
                  return (
                    <div
                      key={alert.id}
                      className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => void handleAlertClick(alert)}
                        className="flex items-start gap-3 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                            isLoan
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                              : isGovernance
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isLoan ? (
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          ) : isGovernance ? (
                            <Vote className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Clock className="w-4 h-4" aria-hidden="true" />
                          )}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {alert.title}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                            {alert.detail}
                          </p>
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            {alert.timestampLabel}
                          </div>
                        </div>
                      </button>

                      {alert.notificationId && (
                        <button
                          type="button"
                          onClick={() => void onMarkRead(alert.notificationId!)}
                          title={tNotif('markAsRead')}
                          aria-label={tNotif('markAsRead')}
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors shrink-0 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {tNotif('unreadCount', { count: unreadInboxCount })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate('notification');
                }}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>{tNotif('openNotifications')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
