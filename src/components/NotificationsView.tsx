'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bell, Calendar, Check, Mail, Send, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  CoopMeeting,
  DashboardSectionId,
  EmailNotification,
  NotificationPreferences,
  NotificationType,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';

interface NotificationsViewProps {
  user: PublicUser;
  workspace: WorkspaceSessionInfo;
  meetings?: CoopMeeting[];
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onNavigate?: (section: DashboardSectionId) => void;
  onOpenManagerDeskTab?: (tab: ManagerDeskTab) => void;
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
  cooperative_notice: 'Cooperative Notice',
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
  onNavigate,
  onOpenManagerDeskTab,
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
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    user.notificationPreferences || DEFAULT_PREFS
  );
  const [modal, setModal] = useState<
    | {
        mode: 'confirm';
        tone: 'emerald' | 'amber' | 'red';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
        confirmLabel: string;
        run: () => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
      }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);

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
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Notification Load Failed',
        description: err instanceof Error ? err.message : 'Failed to load notifications.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  function handleGenerateReminders() {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Trigger Monthly & Repayment Reminders?',
      description:
        'Generates automated monthly contribution and scheduled Qard Hasan installment notices for all active members.',
      confirmLabel: 'Generate Reminders',
      run: async () => {
        setGeneratingReminders(true);
        try {
          const res = await api.sendReminders();
          setNotifications(res.notifications);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Reminders Generated',
            description: `Generated ${res.createdCount} monthly contribution & scheduled loan repayment reminder(s).`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Reminder Generation Failed',
            description: err instanceof Error ? err.message : 'Could not generate reminders.',
          });
        } finally {
          setGeneratingReminders(false);
        }
      },
    });
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
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Preference Update Failed',
        description:
          err instanceof Error ? err.message : 'Failed to save notification preference.',
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  function requestGmailSend(ids?: string[]) {
    const targets = ids
      ? notifications.filter((n) => ids.includes(n.id))
      : notifications.filter((n) => n.deliveryStatus === 'queued').slice(0, 15);

    const previewDetails: ActionModalDetailItem[] = [
      { label: 'Sender Account', value: workspace.email || 'Connected Google Workspace' },
      { label: 'Queued Recipients', value: `${targets.length} email(s)` },
      ...targets.slice(0, 4).map((t) => ({
        label: t.recipientEmail,
        value: t.subject.slice(0, 48),
      })),
    ];

    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: 'Send Notification Email(s) via Gmail?',
      description: `Confirm sending ${targets.length} automated cooperative treasury email(s) from your connected Google account.`,
      details: previewDetails,
      confirmLabel: 'Confirm & Send Emails',
      run: async () => {
        const token = getWorkspaceToken();
        if (!token) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Google Authorization Required',
            description: 'Please sign in with Google first to authorize Gmail sending.',
          });
          return;
        }
        setSendingGmail(true);
        try {
          const res = await api.sendViaGmail(token, ids);
          setNotifications(res.notifications);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: res.failedCount > 0 && res.sentCount === 0 ? 'red' : 'emerald',
            title: res.failedCount > 0 ? 'Gmail Dispatch Completed with Errors' : 'Emails Sent',
            description:
              res.failedCount > 0
                ? `Dispatched ${res.sentCount} email(s) via Gmail API (${res.failedCount} failed: ${res.errors[0] || ''}).`
                : `Dispatched ${res.sentCount} notification email(s) via Gmail API.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Gmail Dispatch Failed',
            description: err instanceof Error ? err.message : 'Gmail dispatch failed.',
          });
        } finally {
          setSendingGmail(false);
        }
      },
    });
  }

  const queuedItems = notifications.filter((n) => n.deliveryStatus === 'queued');

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {upcomingMeetings.length > 0 && (
        <section className="bg-teal-50/75 dark:bg-teal-950/30 backdrop-blur-md border border-teal-200/80 dark:border-teal-900/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 dark:text-teal-300">
            <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Upcoming Cooperative Meetings Scheduled by Manager ({upcomingMeetings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingMeetings.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-lg bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-emerald-200/80 dark:border-emerald-900/50 space-y-1 text-xs"
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
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>Email Outbox &amp; Automated Treasury Notifications</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Contribution, Loan Acceptance, Repayment &amp; Monthly Reminder Notices
            </h2>
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: `All (${notifications.length})` },
                { id: 'queued', label: `Queued (${queuedItems.length})` },
                {
                  id: 'sent',
                  label: `Sent via Gmail (${notifications.filter((n) => n.deliveryStatus === 'sent_via_gmail').length})`,
                },
              ] as const
            ).map((tab) => {
              const active = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="notif-status-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {isStaff && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={generatingReminders}
                onClick={handleGenerateReminders}
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
                onClick={() => requestGmailSend(undefined)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Send Queued via Gmail ({Math.min(queuedItems.length, 15)})</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 pt-1">
          {(
            [
              { id: 'all', label: 'All Topics' },
              { id: 'contributions', label: 'Contributions' },
              { id: 'loans', label: 'Qard Hasan' },
              { id: 'voting', label: 'Voting & Polls' },
              { id: 'meetings', label: 'Meeting Notices' },
              { id: 'community_profile', label: 'Members & Community' },
            ] as const
          ).map((cat) => {
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="notif-topic-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                  />
                )}
                <span className="relative z-10">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Notification & Sound Preferences */}
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
            <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>Notification &amp; In-App Sound Preferences</span>
          </div>
          {savingPrefs && (
            <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400">
              Saving…
            </span>
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
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <span className="font-medium truncate">{item.label}</span>
              <input
                type="checkbox"
                checked={Boolean(prefs[item.key])}
                onChange={() => void handleTogglePreference(item.key)}
                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-indigo-600 focus:ring-indigo-600"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Notification List */}
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 space-y-2">
                <Skeleton width={220} height={12} />
                <Skeleton width="55%" height={18} />
                <Skeleton width="85%" height={14} />
              </div>
            ))}
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

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(() => {
                  const subjLower = item.subject.toLowerCase();
                  if (
                    isStaff &&
                    item.type === 'loan_vote_requested' &&
                    (subjLower.includes('initiate vote') || subjLower.includes('ready to initiate')) &&
                    onOpenManagerDeskTab
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.readByRecipient) void handleMarkRead(item.id);
                          onOpenManagerDeskTab('qard-hasan');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Review in Manager Desk</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    );
                  }
                  if (
                    isStaff &&
                    item.type === 'contribution_placed_manager' &&
                    onOpenManagerDeskTab
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.readByRecipient) void handleMarkRead(item.id);
                          onOpenManagerDeskTab('contributions');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open Manager Desk</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    );
                  }
                  if (
                    (item.type === 'loan_vote_requested' || item.type === 'decision_vote_requested') &&
                    onNavigate
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.readByRecipient) void handleMarkRead(item.id);
                          onNavigate('ballot');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open Opinion Ballot</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    );
                  }
                  if (
                    (item.type === 'loan_guarantor_requested' ||
                      item.type === 'loan_approved_confirmation' ||
                      item.type === 'loan_rejected_notice' ||
                      item.type === 'loan_repayment_notice' ||
                      item.type === 'loan_repayment_rejected') &&
                    user.role !== 'admin' &&
                    onNavigate
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.readByRecipient) void handleMarkRead(item.id);
                          onNavigate('quard-hasan');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open Quard Hasan</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    );
                  }
                  return null;
                })()}
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
                    onClick={() => requestGmailSend([item.id])}
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

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy || sendingGmail || generatingReminders}
        onConfirm={
          modal?.mode === 'confirm'
            ? async () => {
                setModalBusy(true);
                try {
                  await modal.run();
                } finally {
                  setModalBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!modalBusy && !sendingGmail && !generatingReminders) setModal(null);
        }}
      />
    </motion.div>
  );
}
