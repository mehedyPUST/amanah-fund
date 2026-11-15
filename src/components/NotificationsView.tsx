'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Calendar, Check, Mail, Send, ShieldAlert, Volume2 } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  CoopMeeting,
  EmailNotification,
  NotificationPreferences,
  NotificationType,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { useCoopSession } from './AppProviders.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface NotificationsViewProps {
  user: PublicUser;
  workspace: WorkspaceSessionInfo;
  meetings?: CoopMeeting[];
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
  contribution_rejected: 'Contribution Correction Needed',
  loan_vote_requested: 'Qard Hasan Vote Open',
  loan_guarantor_requested: 'Guarantor Co-Sign Request',
  loan_approved_confirmation: 'Qard Hasan Approved',
  loan_rejected_notice: 'Qard Hasan Declined',
  loan_repayment_notice: 'Qard Hasan Installment Notice',
  loan_repayment_rejected: 'Installment Correction Needed',
  monthly_contribution_reminder: 'Monthly Contribution Reminder',
  profit_distribution_notice: 'Halal Profit Distribution',
  meeting_scheduled: 'Cooperative Meeting Notice',
  decision_vote_requested: 'Decision Poll Open',
  profile_update_requested: 'Profile Update Request',
  profile_update_reviewed: 'Profile Update Decision',
  community_post_created: 'Community Post Published',
  community_moderation: 'Community Moderation',
  community_mention: 'Community Mention',
};

type CategoryFilter = 'all' | 'contributions' | 'loans' | 'meetings' | 'voting' | 'community_profile';

function getNotificationCategory(type: NotificationType): Exclude<CategoryFilter, 'all'> {
  if (
    type === 'contribution_placed_manager' ||
    type === 'contribution_accepted' ||
    type === 'contribution_rejected' ||
    type === 'monthly_contribution_reminder'
  ) {
    return 'contributions';
  }
  if (type === 'loan_vote_requested' || type === 'decision_vote_requested') {
    return 'voting';
  }
  if (type === 'meeting_scheduled') {
    return 'meetings';
  }
  if (
    type === 'loan_guarantor_requested' ||
    type === 'loan_approved_confirmation' ||
    type === 'loan_rejected_notice' ||
    type === 'loan_repayment_notice' ||
    type === 'loan_repayment_rejected'
  ) {
    return 'loans';
  }
  return 'community_profile';
}

const DEFAULT_PREFS: NotificationPreferences = {
  inAppAlerts: true,
  soundEnabled: false,
  emailBallots: true,
  emailRepayments: true,
  emailCommunity: true,
};

export function NotificationsView({
  user,
  workspace,
  meetings = [],
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefresh,
}: NotificationsViewProps) {
  const { setUser } = useCoopSession();
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'queued' | 'sent'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [generatingReminders, setGeneratingReminders] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [confirmGmailOpen, setConfirmGmailOpen] = useState(false);
  const [pendingSendIds, setPendingSendIds] = useState<string[] | undefined>(undefined);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    user.notificationPreferences || DEFAULT_PREFS
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (user.notificationPreferences) {
      setPrefs(user.notificationPreferences);
    }
  }, [user.notificationPreferences]);

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

  async function handleTogglePreference(key: keyof NotificationPreferences) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      const res = await api.updatePreferences({ [key]: next[key] });
      setUser(res.user);
      setPrefs(res.user.notificationPreferences || next);
    } catch (err) {
      setPrefs(prefs);
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save notification preference.',
      });
    } finally {
      setSavingPrefs(false);
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
    if (filterType === 'queued' && n.deliveryStatus !== 'queued') return false;
    if (filterType === 'sent' && n.deliveryStatus !== 'sent_via_gmail') return false;
    if (categoryFilter !== 'all' && getNotificationCategory(n.type) !== categoryFilter) {
      return false;
    }
    return true;
  });

  const upcomingMeetings = meetings.filter((m) => m.status === 'scheduled');

  return (
    <div className="space-y-6">
      {upcomingMeetings.length > 0 && (
        <section className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Upcoming Cooperative Meetings Scheduled by Manager ({upcomingMeetings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingMeetings.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 space-y-1 text-xs"
              >
                <div className="font-semibold text-slate-900 dark:text-white">{m.title}</div>
                <div className="font-mono text-emerald-700 dark:text-emerald-400">
                  {formatDateTime(m.scheduledFor)} · {m.locationOrLink}
                </div>
                {m.agenda && <p className="text-slate-600 dark:text-slate-400">{m.agenda}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Header & Reminder / Gmail Actions */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs hover:shadow-md transition-all duration-200">
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
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
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
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-xs'
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
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-amber-50/50 dark:hover:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700 disabled:opacity-50 transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
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
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Send Queued via Gmail ({Math.min(queuedItems.length, 15)})</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {(
            [
              { id: 'all', label: 'All Topics' },
              { id: 'contributions', label: 'Contributions' },
              { id: 'loans', label: 'Qard Hasan' },
              { id: 'voting', label: 'Voting & Polls' },
              { id: 'meetings', label: 'Meeting Notices' },
              { id: 'community_profile', label: 'Members & Community' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Notification & Sound Preferences */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
            <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Notification &amp; In-App Sound Preferences</span>
          </div>
          {savingPrefs && (
            <span className="text-[11px] font-mono text-slate-400">Saving…</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(
            [
              { key: 'inAppAlerts', label: 'In-App Alerts' },
              { key: 'soundEnabled', label: 'Subtle Sound Chime' },
              { key: 'emailBallots', label: 'Ballot & Guarantor' },
              { key: 'emailRepayments', label: 'Repayment Reminders' },
              { key: 'emailCommunity', label: 'Community Mentions' },
            ] as const
          ).map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
            >
              <span className="font-medium truncate">{item.label}</span>
              <input
                type="checkbox"
                checked={Boolean(prefs[item.key])}
                onChange={() => void handleTogglePreference(item.key)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Notification List */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
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
              className={`p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${
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
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1 cursor-pointer"
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
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer"
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
