'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
import {
  buildBellAlerts,
  type AlertIconKey,
  type AlertTone,
  type BellAlertItem,
} from '../utils/notificationAlerts.ts';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
import {
  NotificationBlinkMarker,
  isMeetingOrNoticeBoardNotification,
  isNotificationForUser,
} from './NotificationBlinkMarker.tsx';

interface HeaderNotificationBellProps {
  user: PublicUser;
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  notifications: EmailNotification[];
  notificationsLoading?: boolean;
  onNavigate: (tab: DashboardSectionId) => void;
  onOpenManagerDeskTab?: (tab: ManagerDeskTab) => void;
  onOpenContributionMonth: (billingMonth: string) => void;
  onMarkRead: (notificationId: string) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
}

type BellFilterTab = 'all' | 'treasury' | 'governance';

const TONE_ICON_SURFACE: Record<AlertTone, string> = {
  emerald:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber:
    'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  rose:
    'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
  red:
    'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
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
  notificationsLoading = false,
  onNavigate,
  onOpenManagerDeskTab,
  onOpenContributionMonth,
  onMarkRead,
  onOpenChange,
}: HeaderNotificationBellProps) {
  const tNotif = useTranslations('Notifications');
  const tCommon = useTranslations('Common');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<BellFilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const modalTokenRef = useRef<symbol | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open);

  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) {
        onOpenChange?.(false);
      }
    };
  }, [open, onOpenChange]);

  const closeModal = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
      });
    }
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const root = document.documentElement;
    const syncPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.max(56, Math.round(rect.bottom + 10));
      const right = Math.max(12, Math.round(window.innerWidth - rect.right));
      root.style.setProperty('--notif-modal-top', `${top}px`);
      root.style.setProperty('--notif-modal-right', `${right}px`);
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);

    const token = modalTokenRef.current ?? (modalTokenRef.current = Symbol('notification-modal'));
    const unregister = registerTopModal(token);

    const rafId = window.requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
    });

    function handleKeyDown(evt: KeyboardEvent) {
      if (evt.key === 'Escape' && isTopModal(token)) {
        evt.preventDefault();
        evt.stopPropagation();
        closeModal(true);
        return;
      }

      if (evt.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) {
          evt.preventDefault();
          dialogRef.current.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (evt.shiftKey) {
          if (!active || active === first || !dialogRef.current.contains(active)) {
            evt.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !dialogRef.current.contains(active)) {
          evt.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncPosition);
      document.removeEventListener('keydown', handleKeyDown);
      unregister();
      root.style.removeProperty('--notif-modal-top');
      root.style.removeProperty('--notif-modal-right');
    };
  }, [open, closeModal]);

  const userUnread = useMemo(
    () =>
      notifications.filter(
        (n) => !n.readByRecipient && isNotificationForUser(n, user)
      ),
    [notifications, user]
  );

  const hasUnreadPriority = useMemo(
    () => userUnread.some((n) => isMeetingOrNoticeBoardNotification(n)),
    [userUnread]
  );

  const alerts = useMemo<BellAlertItem[]>(
    () =>
      buildBellAlerts({
        user,
        userUnread,
        overview,
        contributions,
        loans,
        tNotif,
      }),
    [user, userUnread, overview, contributions, loans, tNotif]
  );

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

  const serverUnreadCount = overview?.treasury.unreadNotificationsCount || 0;
  const unreadInboxCount = notificationsLoading ? serverUnreadCount : userUnread.length;
  const hasUnreadNotifications =
    userUnread.length > 0 || (notificationsLoading && serverUnreadCount > 0);
  const badgeCount =
    alerts.length > 0 ? alerts.length : notificationsLoading ? serverUnreadCount : 0;

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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) setActiveFilter('all');
            return next;
          });
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={tNotif('bellAria')}
        aria-label={tNotif('bellAria')}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg border transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
          open
            ? 'border-emerald-500/60 dark:border-emerald-500/50 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
            : hasUnreadPriority
              ? 'border-red-200 dark:border-red-900/70 bg-red-50/75 dark:bg-red-950/35 text-red-600 dark:text-red-400 hover:bg-red-100/80 dark:hover:bg-red-950/55'
              : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center">
            {hasUnreadNotifications && (
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full pointer-events-none ${
                  hasUnreadPriority
                    ? 'bg-red-500 amanah-blink-ring-urgent'
                    : 'bg-amber-500 amanah-blink-ring'
                }`}
              />
            )}
            <span
              className={`relative min-w-[16px] h-4 px-1 rounded-full font-mono tabular-nums text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900 ${
                hasUnreadPriority
                  ? 'bg-red-600 dark:bg-red-500 text-white'
                  : 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950'
              }`}
            >
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="notification-modal-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="fixed inset-0 z-[60]"
                data-no-drawer-swipe="true"
              >
                {/* Full-viewport blocking backdrop disabling all content underneath */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    closeModal(true);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  aria-hidden="true"
                  className="fixed inset-0 bg-slate-950/45 dark:bg-slate-950/65 backdrop-blur-[3px] touch-none select-none cursor-default"
                />

                <motion.div
                  ref={dialogRef}
                  tabIndex={-1}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={tNotif('panelAria')}
                  onClick={(e) => e.stopPropagation()}
                  className="fixed inset-x-3 sm:inset-x-auto top-[60px] sm:top-[var(--notif-modal-top,68px)] sm:right-[var(--notif-modal-right,20px)] sm:w-[420px] max-h-[min(560px,calc(100dvh-76px))] flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.72)] z-[61] overflow-hidden focus:outline-none"
                >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800/90 shrink-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {hasUnreadNotifications && (
                        <NotificationBlinkMarker
                          variant={hasUnreadPriority ? 'red' : 'emerald'}
                          size="sm"
                        />
                      )}
                      <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                        {tNotif('title')}
                      </h2>
                      {badgeCount > 0 && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span
                            className={`font-mono text-xs tabular-nums font-semibold whitespace-nowrap shrink-0 ${
                              hasUnreadPriority
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
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
                      onClick={() => closeModal(true)}
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
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-subtle">
                {alerts.length === 0 ? (
                  notificationsLoading ? (
                    <div className="px-4 py-6 space-y-3" aria-busy="true">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
                        {tNotif('bell.loadingAlerts')}
                      </p>
                      {[0, 1, 2].map((idx) => (
                        <div
                          key={idx}
                          className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/70 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
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
                  )
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
                      const isPriorityBlink = Boolean(alert.isPriorityBlink);
                      const isBusy = markingId === alert.notificationId || markingAll;
                      return (
                        <li
                          key={alert.id}
                          className={`group flex items-stretch transition-colors duration-150 ${
                            isUnreadNotif
                              ? isPriorityBlink
                                ? 'bg-red-50/45 dark:bg-red-950/20 hover:bg-red-50/75 dark:hover:bg-red-950/35'
                                : 'bg-emerald-50/25 dark:bg-emerald-950/15 hover:bg-slate-50 dark:hover:bg-slate-800/55'
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
                                {isUnreadNotif && (
                                  <NotificationBlinkMarker
                                    variant={isPriorityBlink ? 'red' : 'emerald'}
                                    size="sm"
                                    label={
                                      isPriorityBlink
                                        ? 'Unread meeting or notice board alert'
                                        : 'Unread notification'
                                    }
                                  />
                                )}
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug truncate">
                                  {alert.title}
                                </span>
                                {isUnreadNotif && (
                                  <span
                                    className={`text-[10.5px] font-semibold shrink-0 ${
                                      isPriorityBlink
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                    }`}
                                  >
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
                    closeModal(false);
                    onNavigate('notification');
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-emerald-700 dark:hover:bg-emerald-100 text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>{tNotif('openNotifications')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
