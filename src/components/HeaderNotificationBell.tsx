'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, Check, CheckCircle2, Clock } from 'lucide-react';
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
  kind: 'approved_loan' | 'contribution_reminder' | 'general';
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
          title: 'Qard Hasan Approved',
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
              ? 'Contribution Approved'
              : 'Contribution Correction Needed',
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
              ? 'Installment Correction Needed'
              : 'Qard Hasan Installment Update',
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: user.role === 'admin' ? 'notification' : 'quard-hasan',
        });
      } else if (n.type === 'meeting_scheduled') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'general',
          title: 'Meeting Scheduled',
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'notification',
        });
      } else if (n.type === 'loan_guarantor_requested') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'general',
          title: 'Guarantor Co-Sign Request',
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
          kind: isManagerReviewNotice ? 'approved_loan' : 'general',
          title: isManagerReviewNotice ? 'Qard Hasan Application Ready for Review' : 'Opinion Ballot Open',
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: isManagerReviewNotice ? 'manager-desk' : 'ballot',
          managerDeskTab: isManagerReviewNotice ? 'qard-hasan' : undefined,
        });
      } else if (n.type === 'community_post_created' || n.type === 'community_mention') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'general',
          title: 'Community Update',
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'community',
        });
      } else if (n.type === 'profile_update_requested') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'general',
          title: 'Profile Update Review Needed',
          detail: n.subject,
          timestampLabel: formatDateTime(n.createdAt),
          targetTab: 'member-registry',
        });
      } else if (n.type === 'profile_update_reviewed') {
        list.push({
          id: `notif-${n.id}`,
          notificationId: n.id,
          kind: 'general',
          title: 'Profile Update Decision',
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
          title: l.borrowerId === user.id ? 'Your Loan Was Approved' : 'Approved Loan Ready to Disburse',
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
            title: 'Pending Contribution Reminder',
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
          title: `${currentMonthLabel} Contribution Due`,
          detail: `Monthly deposit of ${formatMoney(targetAmount, ccy)} has not been submitted yet.`,
          timestampLabel: 'Current billing cycle',
          targetTab: 'monthly-contribution',
          billingMonth: currentMonth,
        });
      } else if (myPendingContribs.length > 0) {
        list.push({
          id: `pending-contrib-${myPendingContribs[0].id}`,
          kind: 'contribution_reminder',
          title: 'Contribution Pending Verification',
          detail: `${formatBillingMonth(myPendingContribs[0].billingMonth)} deposit (${formatMoney(myPendingContribs[0].amount, ccy)}) awaiting review.`,
          timestampLabel: formatDateTime(myPendingContribs[0].submittedAt),
          targetTab: 'monthly-contribution',
        });
      }
    }

    if (isStaff && (overview?.treasury.pendingLoansReviewCount || 0) > 0) {
      const count = overview?.treasury.pendingLoansReviewCount || 0;
      list.push({
        id: 'staff-pending-loan-reviews',
        kind: 'approved_loan',
        title: 'Qard Hasan Awaiting Vote Initiation',
        detail: `${count} Qard Hasan request${count === 1 ? '' : 's'} waiting in Manager Desk to initiate 2/3 ballot.`,
        timestampLabel: 'Manager Desk queue',
        targetTab: 'manager-desk',
        managerDeskTab: 'qard-hasan',
      });
    }

    if (user.role === 'manager' && (overview?.treasury.pendingContributionsCount || 0) > 0) {
      const count = overview?.treasury.pendingContributionsCount || 0;
      list.push({
        id: 'staff-pending-contribs',
        kind: 'contribution_reminder',
        title: 'Deposits Awaiting Manager Verification',
        detail: `${count} member contribution${count === 1 ? '' : 's'} queued for approval.`,
        timestampLabel: 'Manager Desk queue',
        targetTab: 'manager-desk',
        managerDeskTab: 'contributions',
      });
    }

    return list;
  }, [notifications, loans, contributions, user.id, user.email, user.role, isStaff, ccy, overview]);

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
        title="Loan & contribution alerts"
        aria-label="Loan & contribution alerts"
        className={`relative p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
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

      {open && (
        <div
          role="dialog"
          aria-label="Treasury alerts and reminders"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
                Notifications & Reminders
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Approved loans and pending contribution alerts
              </p>
            </div>
            {badgeCount > 0 && (
              <span className="font-mono text-xs tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                {badgeCount} active
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
                All caught up
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No new approved loan notices or pending contribution reminders right now.
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.map((alert) => {
                const isLoan = alert.kind === 'approved_loan';
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
                            : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {isLoan ? (
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
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
                        title="Mark notification as read"
                        aria-label="Mark notification as read"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors shrink-0 cursor-pointer"
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
              {unreadInboxCount} unread in inbox
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate('notification');
              }}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Open Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
