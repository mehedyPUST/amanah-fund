'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  Mail,
  Send,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { queryKeys } from '../lib/queryKeys.ts';
import type {
  CoopMeeting,
  DashboardOverview,
  DashboardSectionId,
  EmailNotification,
  NotificationPreferences,
  NotificationType,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { scrollFilterButtonWithNeighbors } from '../utils/scrollFilterBar.ts';
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
  signup_activation_issued: 'Activation Codes Issued',
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
  const tNotif = useTranslations('Notifications');
  const t = useTranslations('Notifications.view');
  const { setUser } = useCoopSession();
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const getTypeLabel = (type: NotificationType) => {
    const key = `types.${type}`;
    return tNotif.has(key) ? tNotif(key) : TYPE_LABELS[type] || type;
  };
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'queued' | 'sent'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [generatingReminders, setGeneratingReminders] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const queryClient = useQueryClient();
  const tRef = useRef(t);
  tRef.current = t;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: tRef.current('loadFailedTitle'),
        description: err instanceof Error ? err.message : tRef.current('loadFailedDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const handleReadSync = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readByRecipient: true } : n))
      );
    };
    window.addEventListener('amanah:notification-read', handleReadSync);
    return () => {
      window.removeEventListener('amanah:notification-read', handleReadSync);
    };
  }, [loadNotifications]);

  function handleGenerateReminders() {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('triggerRemindersTitle'),
      description: t('triggerRemindersDesc'),
      confirmLabel: t('generateRemindersBtn'),
      run: async () => {
        setGeneratingReminders(true);
        try {
          const res = await api.sendReminders();
          setNotifications(res.notifications);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('remindersGeneratedTitle'),
            description: t('remindersGeneratedDesc', { count: res.createdCount }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('remindersFailedTitle'),
            description: err instanceof Error ? err.message : t('remindersFailedDesc'),
          });
        } finally {
          setGeneratingReminders(false);
        }
      },
    });
  }

  async function handleMarkRead(id: string) {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        if (!n.readByRecipient) wasUnread = true;
        return { ...n, readByRecipient: true };
      })
    );
    queryClient.setQueryData<{ notifications: EmailNotification[] }>(
      queryKeys.dashboard.notifications(),
      (prev) => {
        if (!prev) return prev;
        return {
          notifications: prev.notifications.map((n) => {
            if (n.id !== id) return n;
            if (!n.readByRecipient) wasUnread = true;
            return { ...n, readByRecipient: true };
          }),
        };
      }
    );
    if (wasUnread) {
      queryClient.setQueryData<DashboardOverview>(queryKeys.dashboard.overview(), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          treasury: {
            ...prev.treasury,
            unreadNotificationsCount: Math.max(0, (prev.treasury.unreadNotificationsCount || 0) - 1),
          },
        };
      });
    }
    try {
      await api.markNotificationRead(id);
    } catch {
      if (wasUnread) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readByRecipient: false } : n))
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.notifications() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview() });
      }
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
        title: t('prefUpdateFailedTitle'),
        description: err instanceof Error ? err.message : t('prefUpdateFailedDesc'),
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
      { label: t('senderAccount'), value: workspace.email || t('connectedGoogleWorkspace') },
      { label: t('queuedRecipients'), value: t('emailsCount', { count: targets.length }) },
      ...targets.slice(0, 4).map((item) => ({
        label: item.recipientEmail,
        value: item.subject.slice(0, 48),
      })),
    ];

    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('sendGmailTitle'),
      description: t('sendGmailDesc', { count: targets.length }),
      details: previewDetails,
      confirmLabel: t('confirmSendEmails'),
      run: async () => {
        const token = getWorkspaceToken();
        if (!token) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('googleAuthRequiredTitle'),
            description: t('googleAuthRequiredDesc'),
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
            title: res.failedCount > 0 ? t('gmailDispatchErrorsTitle') : t('emailsSentTitle'),
            description:
              res.failedCount > 0
                ? t('gmailDispatchPartialDesc', {
                    sent: res.sentCount,
                    failed: res.failedCount,
                    error: res.errors[0] || '',
                  })
                : t('gmailDispatchSuccessDesc', { sent: res.sentCount }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('gmailDispatchFailedTitle'),
            description: err instanceof Error ? err.message : t('gmailDispatchFailedDesc'),
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
        <section className="amanah-card-teal border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 dark:text-teal-300">
            <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('upcomingMeetingsTitle', { count: upcomingMeetings.length })}</span>
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
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('heading')}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              aria-expanded={showSettings}
              aria-controls="notification-settings-panel"
              className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                showSettings
                  ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/25'
              }`}
            >
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0"
                aria-hidden="true"
              />
              <span>{t('notificationSettings')}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
                  showSettings ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {isStaff && (
              <GoogleSignInButton
                workspace={workspace}
                connecting={connectingGoogle}
                onConnect={() => void onConnectGoogle()}
                onDisconnect={() => void onDisconnectGoogle()}
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-fit max-w-full">
            {(
              [
                { id: 'all', label: t('filterAll', { count: notifications.length }) },
                { id: 'queued', label: t('filterQueued', { count: queuedItems.length }) },
                {
                  id: 'sent',
                  label: t('filterSent', {
                    count: notifications.filter((n) => n.deliveryStatus === 'sent_via_gmail')
                      .length,
                  }),
                },
              ] as const
            ).map((tab) => {
              const active = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={(e) => {
                    setFilterType(tab.id);
                    scrollFilterButtonWithNeighbors(e.currentTarget);
                  }}
                  className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:justify-center">
              <button
                type="button"
                disabled={generatingReminders}
                onClick={handleGenerateReminders}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-amber-50/50 dark:hover:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700 disabled:opacity-50 transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                <span>
                  {generatingReminders ? t('generatingReminders') : t('triggerRemindersBtn')}
                </span>
              </button>

              <button
                type="button"
                disabled={!workspace.connected || queuedItems.length === 0 || sendingGmail}
                onClick={() => requestGmailSend(undefined)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('sendQueuedGmail', { count: Math.min(queuedItems.length, 15) })}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-fit max-w-full">
          {(
            [
              { id: 'all', label: t('topicAll') },
              { id: 'contributions', label: t('topicContributions') },
              { id: 'loans', label: t('topicLoans') },
              { id: 'voting', label: t('topicVoting') },
              { id: 'meetings', label: t('topicMeetings') },
              { id: 'community_profile', label: t('topicCommunityProfile') },
            ] as const
          ).map((cat) => {
            const active = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={(e) => {
                  setCategoryFilter(cat.id);
                  scrollFilterButtonWithNeighbors(e.currentTarget);
                }}
                className={`relative px-2.5 py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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

      {/* Notification & Sound Preferences (collapsed under Notification Settings button) */}
      <AnimatePresence initial={false}>
        {showSettings && (
          <motion.section
            id="notification-settings-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>{t('prefsHeading')}</span>
              </div>
              {savingPrefs && (
                <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400">
                  {t('saving')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-2.5">
              {(
                [
                  { key: 'inAppAlerts', label: t('prefInAppAlerts') },
                  { key: 'soundEnabled', label: t('prefSoundEnabled') },
                  { key: 'emailBallots', label: t('prefEmailBallots') },
                  { key: 'emailRepayments', label: t('prefEmailRepayments') },
                  { key: 'emailCommunity', label: t('prefEmailCommunity') },
                ] as const
              ).map((item, idx) => (
                <label
                  key={item.key}
                  className={`min-h-[44px] sm:min-h-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors ${
                    idx === 4 ? 'col-span-2 lg:col-span-1' : ''
                  }`}
                >
                  <span className="font-medium truncate">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[item.key])}
                    onChange={() => void handleTogglePreference(item.key)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-indigo-600 focus:ring-indigo-600 shrink-0"
                  />
                </label>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Notification List */}
      <section className="space-y-2.5">
        {loading ? (
          <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3.5 sm:p-5 space-y-2">
                <Skeleton width={220} height={12} />
                <Skeleton width="55%" height={18} />
                <Skeleton width="85%" height={14} />
              </div>
            ))}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400 shadow-xs">
            {t('emptyFiltered')}
          </div>
        ) : (
          visibleNotifications.map((item, idx) => {
            const isExpanded = Boolean(expandedIds[item.id]);
            const rowBgClass =
              idx % 2 === 1
                ? 'bg-sky-50/85 dark:bg-slate-800/55'
                : 'bg-white/95 dark:bg-slate-900/85';
            return (
              <div
                key={item.id}
                className={`rounded-xl border border-slate-200/85 dark:border-slate-800/85 shadow-2xs transition-colors ${rowBgClass} ${
                  !item.readByRecipient ? 'border-l-[3px] border-l-emerald-500' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIds((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Click to collapse' : 'Click to expand'}
                  className={`group/notif relative w-full p-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/45 dark:hover:bg-slate-800/75 transition-colors cursor-pointer ${
                    isExpanded ? 'rounded-t-xl' : 'rounded-xl'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {!item.readByRecipient && (
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                        />
                      )}
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {item.subject}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {getTypeLabel(item.type)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 break-all">
                        {t('toPrefix', { name: item.recipientName, email: item.recipientEmail })}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="relative flex items-center shrink-0">
                    {!isExpanded && (
                      <span
                        role="tooltip"
                        className="hidden md:inline-block pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 z-30 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium whitespace-nowrap shadow-md opacity-0 translate-x-1 group-hover/notif:opacity-100 group-hover/notif:translate-x-0 group-focus-visible/notif:opacity-100 group-focus-visible/notif:translate-x-0 transition-all duration-150"
                      >
                        Click to expand
                      </span>
                    )}
                    <ChevronDown
                      aria-hidden="true"
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                        isExpanded
                          ? 'rotate-180 text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-4 pt-2 sm:px-5 sm:pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 border-t border-slate-200/70 dark:border-slate-800/80">
                        <div className="space-y-1.5 min-w-0">
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                            {item.body}
                          </p>

                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {t('deliveryPrefix')}{' '}
                            {item.deliveryStatus === 'sent_via_gmail'
                              ? t('sentViaGmailAt', { date: formatDateTime(item.sentAt) })
                              : t('queuedOutbox')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:pt-2 shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center [&>button]:min-h-[44px] sm:[&>button]:min-h-0">
                          {(() => {
                            const subjLower = item.subject.toLowerCase();
                            const deskLabel = user.role === 'admin' ? t('governanceDesk') : t('managerDesk');
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
                                  <span>{t('reviewInDesk', { desk: deskLabel })}</span>
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
                                  <span>{t('openDesk', { desk: deskLabel })}</span>
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
                                  <span>{t('openVoting')}</span>
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
                                  <span>{t('openQardHasan')}</span>
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
                              <span>{t('markRead')}</span>
                            </button>
                          )}
                          {isStaff && item.deliveryStatus === 'queued' && workspace.connected && (
                            <button
                              type="button"
                              onClick={() => requestGmailSend([item.id])}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3 h-3" aria-hidden="true" />
                              <span>{t('sendGmail')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </section>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : t('okGotIt')}
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
