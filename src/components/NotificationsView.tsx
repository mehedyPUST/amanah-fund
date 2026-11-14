'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Mail, Send, ShieldAlert } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { EmailNotification, NotificationType, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface NotificationsViewProps {
  user: PublicUser;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  signup_pending_admin: 'Signup Approval Request',
  signup_approved: 'Account Approved',
  contribution_placed_manager: 'Contribution Placed (Manager)',
  contribution_accepted: 'Contribution Accepted',
  loan_vote_requested: '2/3 Loan Vote Required',
  loan_approved_confirmation: 'Loan Request Approved',
  loan_rejected_notice: 'Loan Request Declined',
  loan_repayment_notice: 'Loan Repayment Notice',
  monthly_contribution_reminder: 'Monthly Contribution Reminder',
};

export function NotificationsView({
  user,
  workspace,
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefresh,
}: NotificationsViewProps) {
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'queued' | 'sent'>('all');
  const [generatingReminders, setGeneratingReminders] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [confirmGmailOpen, setConfirmGmailOpen] = useState(false);
  const [pendingSendIds, setPendingSendIds] = useState<string[] | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load notifications.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function handleGenerateReminders() {
    setGeneratingReminders(true);
    setFeedback(null);
    try {
      const res = await api.sendReminders();
      setNotifications(res.notifications);
      setFeedback({
        type: 'success',
        text: `Generated ${res.createdCount} monthly contribution & scheduled loan repayment reminder(s).`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not generate reminders.',
      });
    } finally {
      setGeneratingReminders(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readByRecipient: true } : n))
      );
      await onRefresh();
    } catch {
      // ignore transient error
    }
  }

  async function handleConfirmGmailSend() {
    const token = getWorkspaceToken();
    if (!token) {
      setFeedback({
        type: 'error',
        text: 'Please sign in with Google first to authorize Gmail sending.',
      });
      setConfirmGmailOpen(false);
      return;
    }

    setSendingGmail(true);
    setFeedback(null);
    try {
      const res = await api.sendViaGmail(token, pendingSendIds);
      setNotifications(res.notifications);
      setConfirmGmailOpen(false);
      setPendingSendIds(undefined);
      setFeedback({
        type: res.failedCount > 0 && res.sentCount === 0 ? 'error' : 'success',
        text:
          res.failedCount > 0
            ? `Dispatched ${res.sentCount} email(s) via Gmail API (${res.failedCount} failed: ${res.errors[0] || ''}).`
            : `Dispatched ${res.sentCount} notification email(s) via Gmail API.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gmail dispatch failed.',
      });
    } finally {
      setSendingGmail(false);
    }
  }

  const queuedItems = notifications.filter((n) => n.deliveryStatus === 'queued');
  const targetsForModal = pendingSendIds
    ? notifications.filter((n) => pendingSendIds.includes(n.id))
    : queuedItems.slice(0, 15);

  const visibleNotifications = notifications.filter((n) => {
    if (filterType === 'queued') return n.deliveryStatus === 'queued';
    if (filterType === 'sent') return n.deliveryStatus === 'sent_via_gmail';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Reminder / Gmail Actions */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>Email Outbox & Automated Treasury Notifications</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Contribution, Loan Acceptance, Repayment & Monthly Reminder Notices
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Automatic alerts generated for manager contribution placement reviews, contribution
              acceptance, 2/3 loan approvals, scheduled repayments, and monthly deposit reminders.
            </p>
          </div>

          {isStaff && (
            <GoogleSignInButton
              workspace={workspace}
              connecting={connectingGoogle}
              onConnect={() => void onConnectGoogle()}
              onDisconnect={() => void onDisconnectGoogle()}
            />
          )}
        </div>

        {feedback && (
          <div
            role="status"
            className={`p-3 rounded-lg border text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${notifications.length})` },
                { id: 'queued', label: `Queued (${queuedItems.length})` },
                {
                  id: 'sent',
                  label: `Sent via Gmail (${notifications.filter((n) => n.deliveryStatus === 'sent_via_gmail').length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isStaff && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={generatingReminders}
                onClick={() => void handleGenerateReminders()}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>
                  {generatingReminders
                    ? 'Generating Reminders…'
                    : 'Trigger Monthly & Repayment Reminders'}
                </span>
              </button>

              <button
                type="button"
                disabled={!workspace.connected || queuedItems.length === 0 || sendingGmail}
                onClick={() => {
                  setPendingSendIds(undefined);
                  setConfirmGmailOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Send Queued via Gmail ({Math.min(queuedItems.length, 15)})</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Notification List */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <div className="p-5">
            <Skeleton height={160} />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No notifications match this filter.
          </div>
        ) : (
          visibleNotifications.map((item) => (
            <div
              key={item.id}
              className={`p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                !item.readByRecipient ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
              }`}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    To: {item.recipientName} &lt;{item.recipientEmail}&gt;
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.subject}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                  {item.body}
                </p>

                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Delivery:{' '}
                  {item.deliveryStatus === 'sent_via_gmail'
                    ? `Sent via Gmail API (${formatDateTime(item.sentAt)})`
                    : 'Queued in In-App Outbox (ready for Gmail dispatch)'}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!item.readByRecipient && (
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(item.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mark Read</span>
                  </button>
                )}
                {isStaff && item.deliveryStatus === 'queued' && workspace.connected && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSendIds([item.id]);
                      setConfirmGmailOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" aria-hidden="true" />
                    <span>Send Gmail</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Explicit Confirmation Modal before sending emails via Gmail API */}
      {confirmGmailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-gmail-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <h4
                  id="confirm-gmail-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Confirm Sending Email(s) via Gmail
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  You are about to send {targetsForModal.length} automated cooperative treasury
                  email(s) from your connected Google account ({workspace.email}).
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              {targetsForModal.map((n) => (
                <div key={n.id} className="p-2.5 space-y-0.5">
                  <div className="font-mono text-slate-900 dark:text-white">{n.recipientEmail}</div>
                  <div className="text-slate-600 dark:text-slate-400 truncate">{n.subject}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={sendingGmail}
                onClick={() => {
                  setConfirmGmailOpen(false);
                  setPendingSendIds(undefined);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingGmail}
                onClick={() => void handleConfirmGmailSend()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                {sendingGmail ? 'Sending via Gmail…' : 'Confirm & Send Emails'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
