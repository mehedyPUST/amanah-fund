'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  Calendar,
  Check,
  ChevronDown,
  Mail,
  Send,
  SlidersHorizontal,
  Smartphone,
  Users,
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
  PushNotificationStatusResponse,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  getPushClientCapabilities,
  syncFcmPushSubscription,
  unregisterFcmPushSubscription,
  type PushClientCapabilities,
} from '../utils/fcmClient.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { scrollFilterButtonWithNeighbors } from '../utils/scrollFilterBar.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
import {
  NotificationBlinkMarker,
  isMeetingOrNoticeBoardNotification,
  isNotificationForUser,
} from './NotificationBlinkMarker.tsx';
import { groupNotificationsForView } from '../utils/notificationGroups.ts';
import { useToast } from './ToastProvider.tsx';

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
  pushAlerts: true,
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
  const toast = useToast();
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
  const [pushStatus, setPushStatus] = useState<PushNotificationStatusResponse | null>(null);
  const [pushCaps, setPushCaps] = useState<PushClientCapabilities>(() =>
    getPushClientCapabilities()
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
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

  const loadPushStatus = useCallback(async () => {
    setPushCaps(getPushClientCapabilities());
    try {
      const status = await api.getPushStatus();
      setPushStatus(status);
    } catch {
      // ignore push diagnostics load errors silently
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadPushStatus();
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
  }, [loadNotifications, loadPushStatus]);

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
          setModal(null);
          await onRefresh();
          toast.success(
            t('remindersGeneratedTitle'),
            t('remindersGeneratedDesc', { count: res.createdCount })
          );
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
    let wasUnreadInView = false;
    let wasUnreadForUser = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        if (!n.readByRecipient) {
          wasUnreadInView = true;
          if (isNotificationForUser(n, user)) {
            wasUnreadForUser = true;
          }
        }
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
            if (!n.readByRecipient && isNotificationForUser(n, user)) {
              wasUnreadForUser = true;
            }
            return { ...n, readByRecipient: true };
          }),
        };
      }
    );
    if (wasUnreadForUser) {
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
      if (wasUnreadInView) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readByRecipient: false } : n))
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.notifications() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview() });
      }
    }
  }

  async function handleMarkGroupRead(ids: string[]) {
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => handleMarkRead(id)));
  }

  async function handleTogglePreference(key: keyof NotificationPreferences) {
    const currentVal = key === 'pushAlerts' ? prefs.pushAlerts !== false : Boolean(prefs[key]);
    const nextVal = !currentVal;
    const next = { ...prefs, [key]: nextVal };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      const res = await api.updatePreferences({ [key]: nextVal });
      setUser(res.user);
      setPrefs(res.user.notificationPreferences || next);
      if (key === 'pushAlerts') {
        if (nextVal) {
          await handleEnablePushAlerts(true);
        } else {
          await unregisterFcmPushSubscription(pushStatus?.firebaseConfig);
          await loadPushStatus();
        }
      }
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

  async function handleEnablePushAlerts(skipPrefSave = false) {
    setPushBusy(true);
    try {
      if (!skipPrefSave && prefs.pushAlerts === false) {
        const prefRes = await api.updatePreferences({ pushAlerts: true });
        setUser(prefRes.user);
        setPrefs(prefRes.user.notificationPreferences || { ...prefs, pushAlerts: true });
      }
      const result = await syncFcmPushSubscription({ requestPermission: true });
      setPushCaps(getPushClientCapabilities());
      await loadPushStatus();
      if (result.ok) {
        toast.success(
          t('push.enabledTitle'),
          result.status?.configuredServer
            ? t('push.enabledDesc')
            : t('push.enabledClientPendingServerDesc')
        );
      } else {
        setModal({
          mode: 'notice',
          tone: result.reason === 'permission_denied' ? 'red' : 'amber',
          title: t('push.setupNoticeTitle'),
          description:
            result.reason === 'ios_install_required'
              ? t('push.iosInstallRequired')
              : result.reason === 'permission_denied'
                ? t('push.permissionDenied')
                : result.reason === 'not_configured_client'
                  ? t('push.vapidMissing')
                  : result.message || t('push.enableFailed'),
        });
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePushOnDevice() {
    setPushBusy(true);
    try {
      await unregisterFcmPushSubscription(pushStatus?.firebaseConfig);
      await loadPushStatus();
      toast.info(t('push.deviceRemovedTitle'), t('push.deviceRemovedDesc'));
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSendTestPush() {
    setPushTestBusy(true);
    try {
      const res = await api.sendTestPushNotification();
      await loadPushStatus();
      if (res.ok) {
        toast.success(
          t('push.testSuccessTitle'),
          t('push.testSuccessDesc', { count: res.deliveredCount })
        );
      } else {
        setModal({
          mode: 'notice',
          tone: res.configuredServer ? 'red' : 'amber',
          title: t('push.testFailedTitle'),
          description: res.reason || t('push.testFailedDesc'),
        });
      }
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('push.testFailedTitle'),
        description: err instanceof Error ? err.message : t('push.testFailedDesc'),
      });
    } finally {
      setPushTestBusy(false);
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
          setModal(null);
          await onRefresh();
          if (res.failedCount > 0) {
            setModal({
              mode: 'notice',
              tone: res.sentCount === 0 ? 'red' : 'amber',
              title: t('gmailDispatchErrorsTitle'),
              description: t('gmailDispatchPartialDesc', {
                sent: res.sentCount,
                failed: res.failedCount,
                error: res.errors[0] || '',
              }),
            });
          } else {
            toast.success(
              t('emailsSentTitle'),
              t('gmailDispatchSuccessDesc', { sent: res.sentCount })
            );
          }
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

  const queuedItems = useMemo(
    () => notifications.filter((n) => n.deliveryStatus === 'queued'),
    [notifications]
  );

  const groupedNotifications = useMemo(
    () => groupNotificationsForView(notifications, user),
    [notifications, user]
  );

  const queuedGroupsCount = useMemo(
    () => groupedNotifications.filter((g) => g.queuedIds.length > 0).length,
    [groupedNotifications]
  );
  const sentGroupsCount = useMemo(
    () => groupedNotifications.filter((g) => g.sentItems.length > 0).length,
    [groupedNotifications]
  );

  const visibleGroups = useMemo(
    () =>
      groupedNotifications.filter((g) => {
        if (filterType === 'queued' && g.queuedIds.length === 0) return false;
        if (filterType === 'sent' && g.sentItems.length === 0) return false;
        if (categoryFilter !== 'all' && getNotificationCategory(g.type) !== categoryFilter) {
          return false;
        }
        return true;
      }),
    [groupedNotifications, filterType, categoryFilter]
  );

  const upcomingMeetings = meetings.filter((m) => m.status === 'scheduled');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-3 sm:space-y-4"
    >
      {upcomingMeetings.length > 0 && (
        <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 dark:text-teal-300">
            <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('upcomingMeetingsTitle', { count: upcomingMeetings.length })}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingMeetings.map((m) => {
              const hasUnreadMeetingAlert = notifications.some(
                (n) =>
                  !n.readByRecipient &&
                  n.type === 'meeting_scheduled' &&
                  n.relatedId === m.id &&
                  isNotificationForUser(n, user)
              );
              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/92 backdrop-blur-md border ring-1 ring-inset ring-white/60 dark:ring-white/5 space-y-1 text-xs ${
                    hasUnreadMeetingAlert
                      ? 'border-red-300/90 dark:border-red-800/80'
                      : 'border-emerald-200/80 dark:border-emerald-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    {hasUnreadMeetingAlert && (
                      <NotificationBlinkMarker
                        variant="red"
                        size="sm"
                        label="Unread meeting notification"
                      />
                    )}
                    <span className="truncate">{m.title}</span>
                  </div>
                  <div className="font-mono text-emerald-700 dark:text-emerald-400">
                    {formatDateTime(m.scheduledFor)} · {m.locationOrLink}
                  </div>
                  {m.agenda && <p className="text-slate-600 dark:text-slate-400">{m.agenda}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Compact Header, Quick Controls & Filters */}
      <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t('eyebrow')}</span>
            </div>
            <h2 className="hidden sm:block text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
              {t('heading')}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {pushCaps.supported && (
              <button
                type="button"
                disabled={pushBusy}
                onClick={() =>
                  pushCaps.permission === 'granted' && (pushStatus?.devicesCount || 0) > 0
                    ? void handleSendTestPush()
                    : void handleEnablePushAlerts(false)
                }
                className={`h-8 px-2.5 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  pushCaps.permission === 'granted' && (pushStatus?.devicesCount || 0) > 0
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60'
                    : 'border-amber-300 dark:border-amber-800 bg-amber-50/85 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100/85 dark:hover:bg-amber-950/60'
                }`}
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {pushBusy || pushTestBusy
                    ? t('push.working')
                    : pushCaps.permission === 'granted' && (pushStatus?.devicesCount || 0) > 0
                      ? t('push.testPushBtn')
                      : t('push.enableBtn')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              aria-expanded={showSettings}
              aria-controls="notification-settings-panel"
              className={`h-8 px-2.5 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                showSettings
                  ? 'border-teal-400 dark:border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/40 dark:hover:bg-teal-950/25'
              }`}
            >
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"
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
                compact
                workspace={workspace}
                connecting={connectingGoogle}
                onConnect={() => void onConnectGoogle()}
                onDisconnect={() => void onDisconnectGoogle()}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth items-center gap-1 p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 w-full sm:w-fit max-w-full">
            {(
              [
                { id: 'all', label: t('filterAll', { count: groupedNotifications.length }) },
                { id: 'queued', label: t('filterQueued', { count: queuedGroupsCount }) },
                {
                  id: 'sent',
                  label: t('filterSent', {
                    count: sentGroupsCount,
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
                  className={`relative px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="notif-status-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-emerald-700 dark:bg-emerald-600 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {isStaff && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full lg:w-auto">
              <button
                type="button"
                disabled={generatingReminders}
                onClick={handleGenerateReminders}
                title={t('triggerRemindersBtn')}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11.5px] font-medium text-slate-800 dark:text-slate-200 hover:bg-amber-50/50 dark:hover:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700 disabled:opacity-50 transition-all duration-150 active:scale-[0.98] inline-flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {generatingReminders ? t('generatingReminders') : t('triggerRemindersBtn')}
                </span>
              </button>

              <button
                type="button"
                disabled={!workspace.connected || queuedItems.length === 0 || sendingGmail}
                onClick={() => requestGmailSend(undefined)}
                title={t('sendQueuedGmail', { count: Math.min(queuedItems.length, 15) })}
                className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-[11.5px] font-medium shadow-xs transition-all duration-150 active:scale-[0.98] inline-flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
              >
                <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {t('sendQueuedGmail', { count: Math.min(queuedItems.length, 15) })}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth items-center gap-1 p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 w-full sm:w-fit max-w-full">
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
                className={`relative px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="notif-topic-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
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
            className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <Volume2 className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>{t('prefsHeading')}</span>
              </div>
              {savingPrefs && (
                <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400">
                  {t('saving')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-2.5">
              {(
                [
                  { key: 'pushAlerts', label: t('prefPushAlerts') },
                  { key: 'inAppAlerts', label: t('prefInAppAlerts') },
                  { key: 'soundEnabled', label: t('prefSoundEnabled') },
                  { key: 'emailBallots', label: t('prefEmailBallots') },
                  { key: 'emailRepayments', label: t('prefEmailRepayments') },
                  { key: 'emailCommunity', label: t('prefEmailCommunity') },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="min-h-[44px] sm:min-h-0 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                >
                  <span className="font-medium truncate">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={
                      item.key === 'pushAlerts'
                        ? prefs.pushAlerts !== false
                        : Boolean(prefs[item.key])
                    }
                    onChange={() => void handleTogglePreference(item.key)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600 shrink-0"
                  />
                </label>
              ))}
            </div>

            {/* Firebase Cloud Messaging Device & Push Controls */}
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs min-w-0">
                <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                    <span>{t('push.cardTitle')}</span>
                    <span className="font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      {t('push.devicesRegistered', { count: pushStatus?.devicesCount || 0 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    {pushCaps.isIosSafariNeedsInstall
                      ? t('push.iosInstallRequired')
                      : !pushCaps.supported
                        ? t('push.browserUnsupported')
                        : pushCaps.permission === 'denied'
                          ? t('push.permissionDenied')
                          : pushStatus && !pushStatus.configuredClient
                            ? t('push.vapidMissing')
                            : pushStatus && !pushStatus.configuredServer
                              ? t('push.serverCredsMissing')
                              : t('push.cardDesc')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={pushBusy || !pushCaps.supported}
                  onClick={() => void handleEnablePushAlerts(false)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{pushBusy ? t('push.working') : t('push.syncDeviceBtn')}</span>
                </button>
                {(pushStatus?.devicesCount || 0) > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={pushTestBusy}
                      onClick={() => void handleSendTestPush()}
                      className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{pushTestBusy ? t('push.working') : t('push.testPushBtn')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pushBusy}
                      onClick={() => void handleDisablePushOnDevice()}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('push.removeDeviceBtn')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Notification List */}
      <section className="space-y-2.5">
        {loading ? (
          <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3.5 sm:p-5 space-y-2">
                <Skeleton width={220} height={12} />
                <Skeleton width="55%" height={18} />
                <Skeleton width="85%" height={14} />
              </div>
            ))}
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-8 text-center text-xs text-slate-500 dark:text-slate-400 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            {t('emptyFiltered')}
          </div>
        ) : (
          visibleGroups.map((group, idx) => {
            const item = group.primary;
            const isExpanded = Boolean(expandedIds[group.id]);
            const isUnread = group.isUnread;
            const isPriorityAlert = isMeetingOrNoticeBoardNotification(item);
            const rowBgClass =
              isUnread && isPriorityAlert
                ? 'bg-red-50/45 dark:bg-red-950/20'
                : idx % 2 === 1
                  ? 'bg-sky-50/85 dark:bg-slate-800/55'
                  : 'bg-white/95 dark:bg-slate-900/85';
            const borderClass = isUnread
              ? isPriorityAlert
                ? 'border-red-300/90 dark:border-red-800/80'
                : 'border-emerald-300/85 dark:border-emerald-800/75'
              : 'border-slate-200/85 dark:border-slate-800/85';
            return (
              <div
                key={group.id}
                className={`rounded-2xl border ring-1 ring-inset ring-white/60 dark:ring-white/5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] transition-colors ${borderClass} ${rowBgClass}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIds((prev) => ({
                      ...prev,
                      [group.id]: !prev[group.id],
                    }))
                  }
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Click to collapse' : 'Click to expand'}
                  className={`group/notif relative w-full p-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    isPriorityAlert && isUnread
                      ? 'hover:bg-red-50/80 dark:hover:bg-red-950/35'
                      : 'hover:bg-emerald-50/45 dark:hover:bg-slate-800/75'
                  } ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUnread && (
                        <NotificationBlinkMarker
                          variant={isPriorityAlert ? 'red' : 'emerald'}
                          size="md"
                          label={
                            isPriorityAlert
                              ? 'Unread meeting or notice board notification'
                              : 'Unread notification'
                          }
                        />
                      )}
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {group.title}
                      </h3>
                      {isUnread && (
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            isPriorityAlert
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          · {tNotif('bell.newLabel')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span
                        className={`font-medium ${
                          isPriorityAlert
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {getTypeLabel(group.type)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 break-all inline-flex items-center gap-1">
                        {group.isBroadcast ? (
                          <>
                            <Users className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{t('broadcastToCount', { count: group.items.length })}</span>
                          </>
                        ) : (
                          t('toPrefix', { name: item.recipientName, email: item.recipientEmail })
                        )}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(group.createdAt)}
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
                        <div className="space-y-2.5 min-w-0 flex-1">
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify max-w-3xl">
                            {group.body}
                          </p>

                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {t('deliveryPrefix')}{' '}
                            {group.isBroadcast
                              ? t('broadcastDeliverySummary', {
                                  sent: group.sentItems.length,
                                  queued: group.queuedIds.length,
                                  read: group.readCount,
                                  total: group.items.length,
                                })
                              : item.deliveryStatus === 'sent_via_gmail'
                                ? t('sentViaGmailAt', { date: formatDateTime(item.sentAt) })
                                : t('queuedOutbox')}
                          </div>

                          {group.isBroadcast && isStaff && (
                            <div className="pt-1 space-y-1.5">
                              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {t('recipientsBreakdown', { count: group.items.length })}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto scrollbar-subtle pr-1">
                                {group.items.map((rec) => (
                                  <div
                                    key={rec.id}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/55 flex items-center justify-between gap-2 text-[11px] min-w-0"
                                  >
                                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                                      {rec.recipientName || rec.recipientEmail}
                                    </span>
                                    <span className="font-mono shrink-0 text-slate-500 dark:text-slate-400">
                                      {rec.deliveryStatus === 'sent_via_gmail'
                                        ? t('statusSent')
                                        : t('statusQueued')}{' '}
                                      ·{' '}
                                      {rec.readByRecipient
                                        ? t('statusRead')
                                        : t('statusUnread')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:pt-2 shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center [&>button]:min-h-[44px] sm:[&>button]:min-h-0">
                          {(() => {
                            const subjLower = group.title.toLowerCase();
                            const deskLabel = user.role === 'admin' ? t('governanceDesk') : t('managerDesk');
                            if (
                              isStaff &&
                              group.type === 'loan_vote_requested' &&
                              (subjLower.includes('initiate vote') || subjLower.includes('ready to initiate')) &&
                              onOpenManagerDeskTab
                            ) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (group.viewerUnreadIds.length > 0) {
                                      void handleMarkGroupRead(group.viewerUnreadIds);
                                    }
                                    onOpenManagerDeskTab('qard-hasan');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>{t('reviewInDesk', { desk: deskLabel })}</span>
                                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              );
                            }
                            if (
                              isStaff &&
                              group.type === 'contribution_placed_manager' &&
                              onOpenManagerDeskTab
                            ) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (group.viewerUnreadIds.length > 0) {
                                      void handleMarkGroupRead(group.viewerUnreadIds);
                                    }
                                    onOpenManagerDeskTab('contributions');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>{t('openDesk', { desk: deskLabel })}</span>
                                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              );
                            }
                            if (
                              (group.type === 'loan_vote_requested' || group.type === 'decision_vote_requested') &&
                              onNavigate
                            ) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (group.viewerUnreadIds.length > 0) {
                                      void handleMarkGroupRead(group.viewerUnreadIds);
                                    }
                                    onNavigate('ballot');
                                  }}
                                  className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>{t('openVoting')}</span>
                                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              );
                            }
                            if (
                              (group.type === 'loan_guarantor_requested' ||
                                group.type === 'loan_approved_confirmation' ||
                                group.type === 'loan_rejected_notice' ||
                                group.type === 'loan_repayment_notice' ||
                                group.type === 'loan_repayment_rejected') &&
                              user.role !== 'admin' &&
                              onNavigate
                            ) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (group.viewerUnreadIds.length > 0) {
                                      void handleMarkGroupRead(group.viewerUnreadIds);
                                    }
                                    onNavigate('quard-hasan');
                                  }}
                                  className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>{t('openQardHasan')}</span>
                                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              );
                            }
                            return null;
                          })()}
                          {group.viewerUnreadIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleMarkGroupRead(group.viewerUnreadIds)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('markRead')}</span>
                            </button>
                          )}
                          {isStaff && group.queuedIds.length > 0 && workspace.connected && (
                            <button
                              type="button"
                              onClick={() => requestGmailSend(group.queuedIds.slice(0, 15))}
                              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {group.queuedIds.length > 1
                                  ? t('sendGmailBatch', {
                                      count: Math.min(group.queuedIds.length, 15),
                                    })
                                  : t('sendGmail')}
                              </span>
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
