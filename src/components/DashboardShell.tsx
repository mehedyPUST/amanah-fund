'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BellRing,
  BriefcaseBusiness,
  CalendarRange,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  HandCoins,
  Home,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  RefreshCw,
  Settings2,
  Sun,
  UserRound,
  UsersRound,
  Vote,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { ActiveMembersView } from './ActiveMembersView.tsx';
import { AdminAuditLog } from './AdminAuditLog.tsx';
import { AdminSiteSettingsView, type SettingsTabId } from './AdminSiteSettingsView.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { CommunityView } from './CommunityView.tsx';
import { ContributionsView } from './ContributionsView.tsx';
import { MobileDashboardShellSkeleton } from './DashboardSkeletons.tsx';
import { HeaderNotificationBell } from './HeaderNotificationBell.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { LoansView } from './LoansView.tsx';
import { ManagerCycleView } from './ManagerCycleView.tsx';
import { ManagerDeskView, type ManagerDeskTab } from './ManagerDeskView.tsx';
import { MemberProfile } from './MemberProfile.tsx';
import { MemberPublicProfileView } from './MemberPublicProfileView.tsx';
import { MemberRegistrySection } from './MemberRegistrySection.tsx';
import { BalanceSheetView } from './BalanceSheetView.tsx';
import { MobileMfsHome } from './MobileMfsHome.tsx';
import {
  CommunityIcon,
  HomeTabIcon,
  MyAmanahIcon,
  NotificationBellIcon,
  TransactionHistoryIcon,
} from './MobileTileIcons.tsx';
import { MyAmanahView } from './MyAmanahView.tsx';
import {
  NotificationBlinkMarker,
  isMeetingOrNoticeBoardNotification,
  isNotificationForUser,
} from './NotificationBlinkMarker.tsx';
import { NotificationsView } from './NotificationsView.tsx';
import { OverviewView } from './OverviewView.tsx';
import { PullToRefreshIndicator, usePullToRefresh } from './PullToRefresh.tsx';
import { ActionModal } from './ActionModal.tsx';
import { PWAUpdateButton } from './PWAUpdateButton.tsx';
import { RequestQardHasanModal } from './RequestQardHasanModal.tsx';
import { StatisticsView } from './StatisticsView.tsx';
import { TransactionHistory } from './TransactionHistory.tsx';
import { VotingView } from './VotingView.tsx';
import { translateRoleLabel } from '../i18n/messages.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { api } from '../utils/api.ts';
import type {
  Contribution,
  CoopMeeting,
  DashboardOverview,
  DashboardSectionId,
  DecisionPoll,
  EmailNotification,
  HalalProject,
  LoanRequest,
  ProfileChangeRequest,
  UserRole,
} from '../types/coop.ts';
import { formatDateTime, formatMoney } from '../utils/format.ts';
import { getWorkspaceToken } from '../utils/googleWorkspace.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { getDashboardSectionLabel } from '../utils/navigation.ts';
import { subscribeRealtimeEvents } from '../utils/realtimeClient.ts';

const EMPTY_CONTRIBUTIONS: Contribution[] = [];
const EMPTY_LOANS: LoanRequest[] = [];
const EMPTY_HALAL_PROJECTS: HalalProject[] = [];
const EMPTY_POLLS: DecisionPoll[] = [];
const EMPTY_MEETINGS: CoopMeeting[] = [];
const EMPTY_PROFILE_REQUESTS: ProfileChangeRequest[] = [];
const EMPTY_NOTIFICATIONS: EmailNotification[] = [];

interface NavItemConfig {
  id: DashboardSectionId;
  label: string;
  Icon: typeof ChartColumn;
  group: 'member' | 'manager' | 'admin';
}

const MEMBER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Overview', Icon: ChartColumn, group: 'member' },
  { id: 'my-amanah', label: 'My Amanah', Icon: WalletCards, group: 'member' },
  { id: 'monthly-contribution', label: 'Contributions', Icon: Banknote, group: 'member' },
  { id: 'quard-hasan', label: 'Qard Hasan', Icon: HandCoins, group: 'member' },
  { id: 'transaction-history', label: 'Transactions', Icon: ReceiptText, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: ChartColumn, group: 'member' },
  { id: 'ballot', label: 'Voting', Icon: Vote, group: 'member' },
  { id: 'notification', label: 'Notifications', Icon: BellRing, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessagesSquare, group: 'member' },
  { id: 'members', label: 'Members', Icon: UsersRound, group: 'member' },
  { id: 'balance-sheet', label: 'Balance Sheet', Icon: FileSpreadsheet, group: 'member' },
  { id: 'manager-cycle', label: 'Manager Cycle', Icon: CalendarRange, group: 'member' },
  { id: 'my-profile', label: 'Profile', Icon: UserRound, group: 'member' },
];

const MANAGER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'manager-desk', label: 'Manager Desk', Icon: BriefcaseBusiness, group: 'manager' },
  { id: 'member-registry', label: 'Member Registry', Icon: UsersRound, group: 'manager' },
];

const ADMIN_PRIMARY_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Overview', Icon: ChartColumn, group: 'member' },
  { id: 'transaction-history', label: 'Transactions', Icon: ReceiptText, group: 'member' },
  { id: 'ballot', label: 'Voting', Icon: Vote, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: ChartColumn, group: 'member' },
  { id: 'members', label: 'Members', Icon: UsersRound, group: 'member' },
  { id: 'balance-sheet', label: 'Balance Sheet', Icon: FileSpreadsheet, group: 'member' },
  { id: 'manager-cycle', label: 'Manager Cycle', Icon: CalendarRange, group: 'member' },
  { id: 'notification', label: 'Notifications', Icon: BellRing, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessagesSquare, group: 'member' },
  { id: 'my-profile', label: 'Profile', Icon: UserRound, group: 'member' },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'member-registry', label: 'Users & Roles', Icon: UsersRound, group: 'admin' },
  { id: 'manager-desk', label: 'Governance Desk', Icon: BriefcaseBusiness, group: 'admin' },
  { id: 'site-settings', label: 'Site Settings', Icon: Settings2, group: 'admin' },
  { id: 'site-activity', label: 'Site Activity', Icon: Activity, group: 'admin' },
];

type SectionAccentTone = 'emerald' | 'amber';

const SECTION_TONE_MAP: Record<DashboardSectionId, SectionAccentTone> = {
  'fund-overview': 'emerald',
  'monthly-contribution': 'emerald',
  'my-amanah': 'emerald',
  'quard-hasan': 'emerald',
  statistics: 'emerald',
  'transaction-history': 'emerald',
  ballot: 'amber',
  notification: 'amber',
  'manager-cycle': 'amber',
  'manager-desk': 'amber',
  'my-profile': 'emerald',
  members: 'emerald',
  'balance-sheet': 'emerald',
  'member-profile': 'emerald',
  community: 'emerald',
  'member-registry': 'emerald',
  'site-settings': 'emerald',
  'site-activity': 'emerald',
};

const SIDEBAR_TONE_STYLES: Record<
  SectionAccentTone,
  {
    pillBg: string;
    activeText: string;
    activeIcon: string;
    activeIconBox: string;
  }
> = {
  emerald: {
    pillBg:
      'bg-emerald-500/12 dark:bg-emerald-400/15 border border-emerald-500/25 dark:border-emerald-400/30',
    activeText: 'text-emerald-800 dark:text-emerald-200 font-semibold',
    activeIcon: 'text-emerald-600 dark:text-emerald-300',
    activeIconBox:
      'bg-emerald-500/15 dark:bg-emerald-400/20 border-emerald-500/30 dark:border-emerald-400/35',
  },
  amber: {
    pillBg:
      'bg-amber-500/12 dark:bg-amber-400/15 border border-amber-500/25 dark:border-amber-400/30',
    activeText: 'text-amber-800 dark:text-amber-200 font-semibold',
    activeIcon: 'text-amber-600 dark:text-amber-300',
    activeIconBox:
      'bg-amber-500/15 dark:bg-amber-400/20 border-amber-500/30 dark:border-amber-400/35',
  },
};

function playSubtleAlertChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.26);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => { });
    }, 500);
  } catch {
    // Web Audio may be blocked prior to user gesture
  }
}

const DASHBOARD_VIEW_VARIANTS = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir !== 0 ? dir * 10 : 0,
    y: dir === 0 ? 5 : 0,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.18,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir !== 0 ? dir * -8 : 0,
    y: dir === 0 ? -4 : 0,
    transition: {
      duration: 0.11,
      ease: [0.4, 0, 1, 1] as const,
    },
  }),
};

const DASHBOARD_HEADER_TITLE_VARIANTS = {
  enter: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? 5 : -5,
  }),
  center: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? -4 : 4,
    transition: {
      duration: 0.09,
      ease: [0.4, 0, 1, 1] as const,
    },
  }),
};

export function DashboardShell() {
  const router = useRouter();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const tDash = useTranslations('Dashboard');
  const {
    user,
    authChecking,
    refreshUser,
    logout,
    darkMode,
    toggleDarkMode,
    locale,
    workspace,
    connectingGoogle,
    googleAuthError,
    clearGoogleAuthError,
    handleConnectGoogle,
    handleDisconnectGoogle,
  } = useCoopSession();

  const [activeSection, setActiveSection] = useState<DashboardSectionId>('fund-overview');
  const [navDirection, setNavDirection] = useState(0);
  const activeSectionRef = useRef<DashboardSectionId>('fund-overview');
  activeSectionRef.current = activeSection;
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [profileReturnSection, setProfileReturnSection] =
    useState<DashboardSectionId>('fund-overview');
  const [preselectedBillingMonth, setPreselectedBillingMonth] = useState<string | null>(null);
  const [managerDeskTabRequest, setManagerDeskTabRequest] = useState<{
    tab: ManagerDeskTab;
    key: number;
  } | null>(null);
  const [settingsTabRequest, setSettingsTabRequest] = useState<{
    tab: SettingsTabId;
    key: number;
  } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [failedDrawerPhotoUrl, setFailedDrawerPhotoUrl] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const drawerHistoryPushedRef = useRef(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem('amanah.dashboard.sidebarCollapsed') === '1') {
        setSidebarCollapsed(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('amanah.dashboard.sidebarCollapsed', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const openMobileDrawer = useCallback(() => {
    triggerHaptic('drawer');
    setMobileNavOpen(true);
    if (typeof window !== 'undefined' && !drawerHistoryPushedRef.current) {
      window.history.pushState(
        { ...(window.history.state || {}), mobileDrawer: true },
        '',
        window.location.href
      );
      drawerHistoryPushedRef.current = true;
    }
  }, []);

  const closeMobileDrawer = useCallback(() => {
    triggerHaptic('drawer');
    setMobileNavOpen(false);
    if (typeof window !== 'undefined' && drawerHistoryPushedRef.current) {
      drawerHistoryPushedRef.current = false;
      window.history.back();
    }
  }, []);

  // Allow mobile users to open the hamburger menu by sliding left-to-right (and close right-to-left)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let startX = 0;
    let startY = 0;
    let tracking: 'open' | 'close' | null = null;
    let isEdgeStart = false;
    let triggered = false;

    const isInsideBlockedOrHorizontalScroller = (target: EventTarget | null): boolean => {
      let el = target instanceof HTMLElement ? target : null;
      while (el && el !== document.body) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
          return true;
        }
        if (
          el.getAttribute('role') === 'dialog' ||
          el.getAttribute('aria-modal') === 'true' ||
          el.hasAttribute('data-no-drawer-swipe')
        ) {
          return true;
        }
        const style = window.getComputedStyle(el);
        const overflowX = style.overflowX;
        if (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          el.scrollWidth > el.clientWidth + 4
        ) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || e.touches.length !== 1) {
        tracking = null;
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      triggered = false;

      if (mobileNavOpen) {
        tracking = 'close';
        return;
      }

      if (document.querySelector('[data-no-drawer-swipe], [role="dialog"]')) {
        tracking = null;
        return;
      }

      const vw = window.innerWidth;
      isEdgeStart = startX <= 36;
      if (isEdgeStart) {
        tracking = 'open';
        return;
      }

      if (startX <= vw * 0.5 && !isInsideBlockedOrHorizontalScroller(e.target)) {
        tracking = 'open';
        return;
      }

      tracking = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking || triggered || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Abort gesture if user is scrolling vertically
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx) * 0.85) {
        tracking = null;
        return;
      }

      if (tracking === 'open') {
        const minDistance = isEdgeStart ? 32 : 52;
        const horizontalRatio = isEdgeStart ? 1.25 : 1.5;
        if (dx >= minDistance && Math.abs(dx) > Math.abs(dy) * horizontalRatio) {
          triggered = true;
          tracking = null;
          openMobileDrawer();
        }
      } else if (tracking === 'close') {
        if (dx <= -40 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          triggered = true;
          tracking = null;
          closeMobileDrawer();
        }
      }
    };

    const handleTouchEnd = () => {
      tracking = null;
      triggered = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [mobileNavOpen, openMobileDrawer, closeMobileDrawer]);

  const queryClient = useQueryClient();
  const activeUserId = user?.id ?? null;
  const workspaceEnabled = Boolean(activeUserId);

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: () => api.getDashboard(),
    enabled: workspaceEnabled,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
  const contributionsQuery = useQuery({
    queryKey: queryKeys.dashboard.contributions(),
    queryFn: () => api.getContributions(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'monthly-contribution' ||
      activeSection === 'my-amanah' ||
      activeSection === 'manager-desk' ||
      activeSection === 'transaction-history' ||
      activeSection === 'fund-overview'
        ? 120_000
        : false,
    refetchIntervalInBackground: false,
  });
  const loansQuery = useQuery({
    queryKey: queryKeys.dashboard.loans(),
    queryFn: () => api.getLoans(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'quard-hasan' ||
      activeSection === 'ballot' ||
      activeSection === 'manager-desk' ||
      activeSection === 'my-amanah' ||
      activeSection === 'fund-overview'
        ? 120_000
        : false,
    refetchIntervalInBackground: false,
  });
  const halalProjectsQuery = useQuery({
    queryKey: queryKeys.dashboard.halalProjects(),
    queryFn: () => api.getHalalProjects(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'ballot' ||
      activeSection === 'manager-desk' ||
      activeSection === 'fund-overview'
        ? 180_000
        : false,
    refetchIntervalInBackground: false,
  });
  const notificationsQuery = useQuery({
    queryKey: queryKeys.dashboard.notifications(),
    queryFn: () => api.getNotifications(),
    enabled: workspaceEnabled,
    refetchInterval: activeSection === 'notification' ? 60_000 : 180_000,
    refetchIntervalInBackground: false,
  });
  const pollsQuery = useQuery({
    queryKey: queryKeys.dashboard.polls(),
    queryFn: () => api.getPolls(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'ballot' || activeSection === 'manager-desk' ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
  const meetingsQuery = useQuery({
    queryKey: queryKeys.dashboard.meetings(),
    queryFn: () => api.getMeetings(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'manager-desk' || activeSection === 'notification' ? 180_000 : false,
    refetchIntervalInBackground: false,
  });
  const profileChangeRequestsQuery = useQuery({
    queryKey: queryKeys.dashboard.profileChangeRequests(),
    queryFn: () => api.getProfileChangeRequests(),
    enabled: workspaceEnabled,
    refetchInterval:
      activeSection === 'my-profile' ||
      activeSection === 'manager-desk' ||
      activeSection === 'member-registry'
        ? 180_000
        : false,
    refetchIntervalInBackground: false,
  });

  const overview = overviewQuery.data ?? null;
  const contributions = contributionsQuery.data?.contributions ?? EMPTY_CONTRIBUTIONS;
  const loans = loansQuery.data?.loans ?? EMPTY_LOANS;
  const halalProjects = halalProjectsQuery.data?.projects ?? EMPTY_HALAL_PROJECTS;
  const polls = pollsQuery.data?.polls ?? EMPTY_POLLS;
  const meetings = meetingsQuery.data?.meetings ?? EMPTY_MEETINGS;
  const profileChangeRequests =
    profileChangeRequestsQuery.data?.requests ?? EMPTY_PROFILE_REQUESTS;
  const notifications = notificationsQuery.data?.notifications ?? EMPTY_NOTIFICATIONS;
  const notificationsLoaded = notificationsQuery.data !== undefined;
  const notificationsLoading = workspaceEnabled && notificationsQuery.isPending && !notificationsLoaded;
  const userUnreadCount = useMemo(() => {
    if (!user) return 0;
    return notifications.filter(
      (n) => !n.readByRecipient && isNotificationForUser(n, user)
    ).length;
  }, [notifications, user]);
  const hasUnreadPriorityNotification = useMemo(() => {
    if (!user) return false;
    return notifications.some(
      (n) =>
        !n.readByRecipient &&
        isNotificationForUser(n, user) &&
        isMeetingOrNoticeBoardNotification(n)
    );
  }, [notifications, user]);

  const overviewLoading = workspaceEnabled && overviewQuery.isPending && !overview;
  const contributionsLoading =
    workspaceEnabled && contributionsQuery.isPending && contributionsQuery.data === undefined;
  const loansLoading = workspaceEnabled && loansQuery.isPending && loansQuery.data === undefined;
  const halalProjectsLoading =
    workspaceEnabled && halalProjectsQuery.isPending && halalProjectsQuery.data === undefined;
  const pollsLoading = workspaceEnabled && pollsQuery.isPending && pollsQuery.data === undefined;
  const meetingsLoading =
    workspaceEnabled && meetingsQuery.isPending && meetingsQuery.data === undefined;
  const profileChangeRequestsLoading =
    workspaceEnabled &&
    profileChangeRequestsQuery.isPending &&
    profileChangeRequestsQuery.data === undefined;

  const [manualRefreshing, setManualRefreshing] = useState(false);
  const dataLoading =
    manualRefreshing || overviewLoading || contributionsLoading || loansLoading;

  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [loanGateNotice, setLoanGateNotice] = useState<{
    title: string;
    description: string;
    /** When set, confirm button withdraws this pending loan then opens the form */
    withdrawLoanId?: string;
  } | null>(null);
  const [loanGateChecking, setLoanGateChecking] = useState(false);
  const [loanGateBusy, setLoanGateBusy] = useState(false);
  const [dismissedLoanAlertIds, setDismissedLoanAlertIds] = useState<string[]>([]);
  const [liveLoanPulseId, setLiveLoanPulseId] = useState<string | null>(null);
  const autoSyncBusyRef = useRef(false);
  const signingOutRef = useRef(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const soundEnabledRef = useRef(false);
  soundEnabledRef.current = Boolean(user?.notificationPreferences?.soundEnabled);

  useEffect(() => {
    if (signingOutRef.current) return;
    if (!authChecking && !user) {
      setMobileBrowseMode(false);
      const target = isMobileViewport() ? '/' : '/login';
      if (typeof window !== 'undefined') {
        window.location.replace(target);
      } else {
        router.replace(target);
      }
    } else if (!authChecking && user) {
      setMobileBrowseMode(false);
    }
  }, [authChecking, user, router]);

  const refreshWorkspace = useCallback(
    async (silent = false): Promise<DashboardOverview | null> => {
      if (!silent) setManualRefreshing(true);
      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        const freshOverview = await queryClient.fetchQuery({
          queryKey: queryKeys.dashboard.overview(),
          queryFn: () => api.getDashboard(),
          staleTime: 0,
        });
        return freshOverview;
      } catch (err) {
        console.error('Workspace sync error:', err);
        return queryClient.getQueryData<DashboardOverview>(queryKeys.dashboard.overview()) ?? null;
      } finally {
        if (!silent) setManualRefreshing(false);
      }
    },
    [queryClient]
  );

  const triggerAutoSheetSyncIfEnabled = useCallback(
    async (ov: DashboardOverview | null) => {
      if (autoSyncBusyRef.current) return;
      if (!ov?.config.autoSyncSheet || !ov.config.googleSheetId) return;
      if (!user || (user.role !== 'admin' && user.role !== 'manager')) return;
      const token = getWorkspaceToken();
      if (!token) return;

      autoSyncBusyRef.current = true;
      try {
        await api.syncGoogleSheet(token);
      } catch {
        // fail silently on background auto-sync; manual sync reports explicit errors
      } finally {
        autoSyncBusyRef.current = false;
      }
    },
    [user]
  );

  useEffect(() => {
    if (!activeUserId) return;

    const invalidateDashboardKeys = (keys: ReadonlyArray<readonly unknown[]>) => {
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    const handleSyncAll = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    };
    const handleLoanSync = () => {
      invalidateDashboardKeys([
        queryKeys.dashboard.overview(),
        queryKeys.dashboard.loans(),
        queryKeys.dashboard.notifications(),
      ]);
    };
    const handleContributionSync = () => {
      invalidateDashboardKeys([
        queryKeys.dashboard.overview(),
        queryKeys.dashboard.contributions(),
        queryKeys.dashboard.notifications(),
      ]);
    };
    const handleInvestmentSync = () => {
      invalidateDashboardKeys([
        queryKeys.dashboard.overview(),
        queryKeys.dashboard.halalProjects(),
        queryKeys.dashboard.notifications(),
      ]);
    };
    const handlePollSync = () => {
      invalidateDashboardKeys([queryKeys.dashboard.polls(), queryKeys.dashboard.overview()]);
    };
    const handleMeetingSync = () => {
      invalidateDashboardKeys([queryKeys.dashboard.meetings(), queryKeys.dashboard.notifications()]);
    };
    const handleProfileRequestSync = () => {
      invalidateDashboardKeys([
        queryKeys.dashboard.profileChangeRequests(),
        queryKeys.dashboard.overview(),
      ]);
    };
    const handleLoanCreated = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data) as { loanId?: string; borrowerId?: string };
        if (data.loanId && data.borrowerId !== activeUserId) {
          setLiveLoanPulseId(data.loanId);
          setDismissedLoanAlertIds((prev) => prev.filter((id) => id !== data.loanId));
        }
      } catch {
        // ignore malformed payload
      }
      handleLoanSync();
    };
    const playAlertIfEnabled = (evt: MessageEvent) => {
      if (soundEnabledRef.current) {
        try {
          const payload = JSON.parse(evt.data || '{}') as { senderId?: string };
          if (!payload.senderId || payload.senderId !== activeUserId) {
            playSubtleAlertChime();
          }
        } catch {
          playSubtleAlertChime();
        }
      }
    };
    const handleMeetingAlert = (evt: MessageEvent) => {
      playAlertIfEnabled(evt);
      handleMeetingSync();
    };
    const handleNotificationAlert = (evt: MessageEvent) => {
      playAlertIfEnabled(evt);
      invalidateDashboardKeys([
        queryKeys.dashboard.notifications(),
        queryKeys.dashboard.overview(),
      ]);
    };
    return subscribeRealtimeEvents({
      'investment:voted': handleInvestmentSync,
      'investment:created': handleInvestmentSync,
      'investment:distributed': handleInvestmentSync,
      'investment:revealed': handleInvestmentSync,
      'loan:created': handleLoanCreated,
      'loan:updated': handleLoanSync,
      'loan:reviewed': handleLoanSync,
      'loan:voted': handleLoanSync,
      'loan:vote_initiated': handleLoanSync,
      'loan:vote_revealed': handleLoanSync,
      'loan:guarantor': handleLoanSync,
      'poll:created': handlePollSync,
      'poll:voted': handlePollSync,
      'poll:revealed': handlePollSync,
      'meeting:scheduled': handleMeetingAlert,
      'meeting:updated': handleMeetingSync,
      'profile:update_requested': handleProfileRequestSync,
      'profile:update_reviewed': handleProfileRequestSync,
      'contribution:submitted': handleContributionSync,
      'contribution:reviewed': handleContributionSync,
      'repayment:submitted': handleLoanSync,
      'repayment:verified': handleLoanSync,
      'repayment:overdue': handleLoanSync,
      'config:updated': handleSyncAll,
      'notification:created': handleNotificationAlert,
      'email-queue:updated': handleSyncAll,
      'members:updated': handleSyncAll,
      'sheet:synced': handleSyncAll,
    });
  }, [activeUserId, queryClient]);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isStaff = Boolean(user && (isAdmin || isManager));

  const visibleNav = useMemo(() => {
    if (isAdmin) {
      return [...ADMIN_PRIMARY_ITEMS, ...ADMIN_NAV_ITEMS];
    }
    if (isManager) {
      return [...MEMBER_NAV_ITEMS, ...MANAGER_NAV_ITEMS];
    }
    return MEMBER_NAV_ITEMS;
  }, [isAdmin, isManager]);

  const resolveNavDirection = useCallback(
    (fromId: DashboardSectionId, toId: DashboardSectionId): number => {
      if (fromId === toId) return 0;
      if (toId === 'member-profile') return 1;
      if (fromId === 'member-profile') return -1;

      const mobileOrder: DashboardSectionId[] = [
        'fund-overview',
        user?.role === 'member' ? 'my-amanah' : 'transaction-history',
        'community',
        'notification',
      ];
      const fromMobileIdx = mobileOrder.indexOf(fromId);
      const toMobileIdx = mobileOrder.indexOf(toId);
      if (isMobileViewport() && fromMobileIdx !== -1 && toMobileIdx !== -1) {
        return toMobileIdx > fromMobileIdx ? 1 : -1;
      }

      const fromIdx = visibleNav.findIndex((item) => item.id === fromId);
      const toIdx = visibleNav.findIndex((item) => item.id === toId);
      if (fromIdx !== -1 && toIdx !== -1) {
        return toIdx > fromIdx ? 1 : -1;
      }
      return 0;
    },
    [user?.role, visibleNav]
  );

  const navigateToPage = useCallback(
    (
      sectionId: DashboardSectionId,
      closeMobile = true,
      pushHistory = true,
      preserveBillingMonth = false
    ) => {
      const targetId = visibleNav.some((item) => item.id === sectionId)
        ? sectionId
        : 'fund-overview';

      triggerHaptic('nav');
      setNavDirection(resolveNavDirection(activeSectionRef.current, targetId));
      setActiveSection(targetId);
      if (!preserveBillingMonth && targetId !== 'monthly-contribution') {
        setPreselectedBillingMonth(null);
      }
      if (closeMobile) {
        setMobileNavOpen(false);
      }
      if (pushHistory && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const alreadyOnTarget =
          url.searchParams.get('page') === targetId &&
          !url.searchParams.has('memberId') &&
          !url.searchParams.has('dm');

        if (drawerHistoryPushedRef.current) {
          drawerHistoryPushedRef.current = false;
          if (alreadyOnTarget || (targetId === 'fund-overview' && !url.searchParams.get('page') && !url.searchParams.has('memberId') && !url.searchParams.has('dm'))) {
            window.history.back();
          } else {
            url.searchParams.set('page', targetId);
            url.searchParams.delete('memberId');
            url.searchParams.delete('dm');
            window.history.replaceState({ page: targetId }, '', url);
          }
        } else if (!alreadyOnTarget) {
          url.searchParams.set('page', targetId);
          url.searchParams.delete('memberId');
          url.searchParams.delete('dm');
          window.history.pushState({ page: targetId }, '', url);
        }
      } else if (closeMobile && drawerHistoryPushedRef.current && typeof window !== 'undefined') {
        drawerHistoryPushedRef.current = false;
        window.history.back();
      }
      if (typeof window !== 'undefined') {
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [visibleNav, resolveNavDirection]
  );

  /** Gate the loan application modal on eligibility BEFORE open.
   *  Once open, the form submits without re-checking eligibility client-side. */
  const openLoanRequestModal = useCallback(async () => {
    if (loanGateChecking) return;
    if (!user || user.role === 'admin') {
      setLoanGateNotice({
        title: tDash('alerts.adminsCannotBorrow'),
        description: tDash('alerts.adminsCannotBorrowDesc'),
      });
      return;
    }
    if (user.status !== 'active') {
      setLoanGateNotice({
        title: tDash('alerts.verificationRequired'),
        description: tDash('alerts.verificationRequiredDesc'),
      });
      return;
    }

    setLoanGateChecking(true);
    try {
      let eligibility = overview?.personal.eligibility ?? null;
      if (!eligibility) {
        const res = await api.getEligibility();
        eligibility = res.eligibility;
      }
      if (!eligibility.eligible) {
        const reason =
          eligibility.reasons?.[0] || tDash('alerts.eligibilityDefaultReason');
        const pendingLoan =
          loans.find(
            (l) =>
              (l.borrowerId === user.id || (Boolean(user.memberCode) && l.borrowerCode === user.memberCode)) &&
              (l.status === 'pending_manager_review' || l.status === 'pending_guarantor')
          ) || null;
        const withdrawId =
          pendingLoan?.id ||
          eligibility.activeLoanId ||
          undefined;
        const canWithdraw =
          Boolean(withdrawId) &&
          (!eligibility.noActiveLoan ||
            /existing loan/i.test(reason) ||
            /pending/i.test(reason));

        setLoanGateNotice({
          title: tDash('alerts.eligibilityNotMet'),
          description: canWithdraw
            ? tDash('alerts.withdrawHint', { reason })
            : reason,
          withdrawLoanId: canWithdraw ? withdrawId : undefined,
        });
        return;
      }
      setLoanModalOpen(true);
    } catch (err) {
      setLoanGateNotice({
        title: tDash('alerts.eligibilityFailed'),
        description:
          err instanceof Error
            ? err.message
            : tDash('alerts.eligibilityFailed'),
      });
    } finally {
      setLoanGateChecking(false);
    }
  }, [loanGateChecking, user, overview, loans, tDash]);

  const openManagerDeskTab = useCallback(
    (tab: ManagerDeskTab) => {
      setManagerDeskTabRequest({ tab, key: Date.now() });
      navigateToPage('manager-desk', true);
    },
    [navigateToPage]
  );

  const handleViewMemberProfile = useCallback(
    (memberId: string) => {
      if (!memberId) return;
      setProfileReturnSection((prev) =>
        activeSection !== 'member-profile' ? activeSection : prev
      );
      setNavDirection(
        activeSectionRef.current === 'member-profile' && viewingMemberId !== memberId
          ? 1
          : resolveNavDirection(activeSectionRef.current, 'member-profile')
      );
      setViewingMemberId(memberId);
      setActiveSection('member-profile');
      setMobileNavOpen(false);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (
          url.searchParams.get('page') !== 'member-profile' ||
          url.searchParams.get('memberId') !== memberId
        ) {
          url.searchParams.set('page', 'member-profile');
          url.searchParams.set('memberId', memberId);
          url.searchParams.delete('dm');
          if (drawerHistoryPushedRef.current) {
            drawerHistoryPushedRef.current = false;
            window.history.replaceState({ page: 'member-profile', memberId }, '', url);
          } else {
            window.history.pushState({ page: 'member-profile', memberId }, '', url);
          }
        }
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [activeSection, viewingMemberId, resolveNavDirection]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromUrl = () => {
      const isDrawerState = Boolean(
        (window.history.state as { mobileDrawer?: boolean } | null)?.mobileDrawer
      );
      if (!isDrawerState) {
        drawerHistoryPushedRef.current = false;
        setMobileNavOpen(false);
      }

      const params = new URLSearchParams(window.location.search);
      const rawRequested = params.get('page');
      const normalizedPage =
        rawRequested === 'monthly-sheet'
          ? 'balance-sheet'
          : rawRequested === 'system-audit-logs'
            ? 'site-activity'
            : rawRequested === 'email-queue'
              ? 'site-settings'
              : rawRequested;
      const requested = normalizedPage as DashboardSectionId | null;
      const requestedMemberId = params.get('memberId');

      if (normalizedPage && rawRequested !== normalizedPage) {
        const canonicalUrl = new URL(window.location.href);
        canonicalUrl.searchParams.set('page', normalizedPage);
        window.history.replaceState({ page: normalizedPage }, '', canonicalUrl);
      }

      if (requested === 'member-profile' && requestedMemberId) {
        setNavDirection(resolveNavDirection(activeSectionRef.current, 'member-profile'));
        setViewingMemberId(requestedMemberId);
        setActiveSection('member-profile');
        setPreselectedBillingMonth(null);
        return;
      }

      setViewingMemberId(null);
      const valid =
        requested && visibleNav.some((item) => item.id === requested)
          ? requested
          : 'fund-overview';
      setNavDirection(resolveNavDirection(activeSectionRef.current, valid));
      setActiveSection(valid);
      if (rawRequested === 'email-queue' && valid === 'site-settings') {
        setSettingsTabRequest({ tab: 'email', key: Date.now() });
      }
      if (valid !== 'monthly-contribution') {
        setPreselectedBillingMonth(null);
      }
    };

    syncFromUrl();
    const handlePushNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      if (!detail?.url) return;
      try {
        const parsed = new URL(detail.url, window.location.origin);
        if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/dashboard')) {
          return;
        }
        const currentUrl = new URL(window.location.href);
        if (currentUrl.pathname + currentUrl.search !== parsed.pathname + parsed.search) {
          window.history.pushState(
            { page: parsed.searchParams.get('page') || 'fund-overview' },
            '',
            parsed.pathname + parsed.search + parsed.hash
          );
        }
        syncFromUrl();
      } catch {
        // ignore malformed push URL
      }
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('amanah:push-navigate', handlePushNavigate);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('amanah:push-navigate', handlePushNavigate);
    };
  }, [visibleNav, resolveNavDirection]);

  async function handleSignOut() {
    if (signingOutRef.current) return;
    triggerHaptic('warning');
    signingOutRef.current = true;
    drawerHistoryPushedRef.current = false;
    setMobileNavOpen(false);
    setMobileBrowseMode(false);
    await logout();
    if (typeof window !== 'undefined') {
      window.location.replace('/');
    } else {
      router.replace('/');
    }
  }

  const handleRefreshWithAutoSync = useCallback(async () => {
    const [, freshOverview] = await Promise.all([
      refreshUser(),
      refreshWorkspace(false),
    ]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.community.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.public.all }),
    ]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('amanah:refresh'));
    }
    await triggerAutoSheetSyncIfEnabled(freshOverview);
  }, [queryClient, refreshUser, refreshWorkspace, triggerAutoSheetSyncIfEnabled]);

  const pullToRefresh = usePullToRefresh({
    scrollRef: mainScrollRef,
    onRefresh: handleRefreshWithAutoSync,
  });

  const handleLoanCreatedOptimistic = useCallback(
    (createdLoan: LoanRequest) => {
      queryClient.setQueryData<{ loans: LoanRequest[] }>(queryKeys.dashboard.loans(), (prev) => {
        const list = prev?.loans ?? [];
        const idx = list.findIndex((l) => l.id === createdLoan.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = createdLoan;
          return { loans: next };
        }
        return { loans: [createdLoan, ...list] };
      });
      queryClient.setQueryData<DashboardOverview>(queryKeys.dashboard.overview(), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          personal: {
            ...prev.personal,
            eligibility: {
              ...prev.personal.eligibility,
              eligible: false,
              noActiveLoan: false,
              activeLoanId: createdLoan.id,
              loansUsedThisYear: (prev.personal.eligibility.loansUsedThisYear || 0) + 1,
              reasons: [
                `Existing loan (${createdLoan.id}) is currently "${createdLoan.status.replace(/_/g, ' ')}". Only one active or pending Qard Hasan loan is permitted at a time.`,
                ...(prev.personal.eligibility.reasons || []).filter(
                  (r) => !r.startsWith('Existing loan') && !r.startsWith('No active')
                ),
              ],
            },
          },
          treasury: {
            ...prev.treasury,
            pendingLoansReviewCount:
              createdLoan.status === 'pending_manager_review'
                ? (prev.treasury.pendingLoansReviewCount || 0) + 1
                : prev.treasury.pendingLoansReviewCount,
          },
        };
      });
    },
    [queryClient]
  );

  async function handleDismissLoanDecisionAlert(notificationId: string) {
    let wasUnread = false;
    queryClient.setQueryData<{ notifications: EmailNotification[] }>(
      queryKeys.dashboard.notifications(),
      (prev) => {
        const list = prev?.notifications ?? [];
        const target = list.find((n) => n.id === notificationId);
        wasUnread = Boolean(target && !target.readByRecipient);
        return {
          notifications: list.map((n) =>
            n.id === notificationId ? { ...n, readByRecipient: true } : n
          ),
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('amanah:notification-read', { detail: { id: notificationId } })
      );
    }
    try {
      await api.markNotificationRead(notificationId);
    } catch {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.notifications() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview() });
    }
  }

  async function handleOpenLoanFromDecisionAlert(notificationId: string) {
    navigateToPage('quard-hasan');
    await handleDismissLoanDecisionAlert(notificationId);
  }

  if (authChecking || !user) {
    return (
      <div
        className="h-dvh overflow-hidden w-full amanah-ambient-canvas p-0 lg:p-3 flex flex-col gap-0 lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-3"
        role="status"
        aria-live="polite"
        aria-label={authChecking ? tCommon('verifyingSession') : tCommon('redirectingSignIn')}
      >
        <MobileDashboardShellSkeleton />

        <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] shrink-0 px-4 items-center gap-2.5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/85 dark:border-slate-800/85 shadow-2xs">
          <AmanahLogo size="sm" decorative />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton width={96} height={14} />
            <Skeleton width={72} height={10} />
          </div>
        </div>
        <div className="hidden lg:flex lg:col-start-2 lg:row-start-1 h-[60px] shrink-0 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/85 dark:border-slate-800/85 shadow-2xs px-4 sm:px-6 items-center justify-between gap-4">
          <Skeleton width={190} height={20} />
          <div className="flex items-center gap-2">
            <Skeleton width={76} height={32} borderRadius={8} />
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width={140} height={34} borderRadius={8} />
          </div>
        </div>
        <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col justify-between min-h-0 overflow-hidden bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/85 dark:border-slate-800/85 shadow-2xs p-3.5">
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, idx) => (
              <Skeleton key={idx} height={34} borderRadius={8} />
            ))}
          </div>
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <Skeleton width="75%" height={16} />
            <Skeleton width="60%" height={12} />
            <Skeleton height={34} borderRadius={8} />
          </div>
        </aside>
        <main className="hidden lg:block lg:col-start-2 lg:row-start-2 flex-1 min-h-0 overflow-hidden bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/85 dark:border-slate-800/85 shadow-2xs p-4 space-y-3">
          <Skeleton height={82} borderRadius={12} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={112} borderRadius={12} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <Skeleton height={220} borderRadius={12} />
            <Skeleton height={220} borderRadius={12} />
          </div>
          <Skeleton height={240} borderRadius={12} />
        </main>
      </div>
    );
  }

  const pendingBadgeCount = (sectionId: DashboardSectionId): number => {
    if (!overview) return 0;
    const openPlacementVotes = halalProjects.filter((p) => p.votingStatus === 'open').length;
    const openPollsCount = polls.filter((p) => p.status === 'open').length;
    if (sectionId === 'ballot') {
      const staffDisbursements = isStaff ? overview.treasury.pendingDisbursementsCount : 0;
      return (
        overview.treasury.pendingVotesCount +
        staffDisbursements +
        openPlacementVotes +
        openPollsCount
      );
    }
    if (sectionId === 'manager-desk' && isStaff) {
      return (
        overview.treasury.pendingContributionsCount +
        overview.treasury.pendingLoansReviewCount +
        overview.treasury.pendingDisbursementsCount +
        overview.treasury.pendingRepaymentsCount +
        (isAdmin ? overview.treasury.pendingProfileRequestsCount : 0)
      );
    }
    if (sectionId === 'monthly-contribution' && isManager) {
      return overview.treasury.pendingContributionsCount;
    }
    if (sectionId === 'notification') {
      return notificationsLoaded
        ? userUnreadCount
        : overview.treasury.unreadNotificationsCount;
    }
    if (sectionId === 'member-registry' && isStaff) {
      return (
        (isAdmin ? overview.treasury.pendingMembersCount : 0) +
        (isAdmin ? overview.treasury.pendingProfileRequestsCount : 0)
      );
    }
    if (sectionId === 'site-settings' && isAdmin) {
      return overview.treasury.emailQueueAttentionCount || 0;
    }
    return 0;
  };

  function renderNavButton(item: NavItemConfig, isMobile = false) {
    const Icon = item.Icon;
    const active = activeSection === item.id;
    const count = pendingBadgeCount(item.id);
    const toneStyle = SIDEBAR_TONE_STYLES[SECTION_TONE_MAP[item.id] || 'emerald'];
    const collapsed = !isMobile && sidebarCollapsed;
    const label = getDashboardSectionLabel(item.id, user?.role, locale);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigateToPage(item.id, isMobile)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        className={`relative group w-full rounded-xl flex items-center transition-colors duration-150 cursor-pointer whitespace-nowrap ${
          collapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2 justify-between gap-3 text-left'
        } text-sm ${active
          ? toneStyle.activeText
          : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/75 dark:hover:bg-slate-800/45'
          }`}
      >
        {active && (
          <motion.span
            layoutId={isMobile ? 'sidebar-active-mobile' : 'sidebar-active-desktop'}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={`absolute inset-0 rounded-xl ${toneStyle.pillBg}`}
            aria-hidden="true"
          />
        )}
        <span className={`relative z-10 flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
          <span
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${active
              ? toneStyle.activeIconBox
              : 'bg-slate-100/85 dark:bg-slate-800/75 border-slate-200/70 dark:border-slate-700/60 group-hover:bg-white dark:group-hover:bg-slate-800 group-hover:border-slate-300/80 dark:group-hover:border-slate-600/80'
              }`}
          >
            <Icon
              className={`w-[17px] h-[17px] shrink-0 transition-colors ${active
                ? toneStyle.activeIcon
                : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                }`}
              aria-hidden="true"
            />
          </span>
          {!collapsed && <span className="truncate">{label}</span>}
        </span>
        {count > 0 &&
          (collapsed ? (
            item.id === 'notification' ? (
              <NotificationBlinkMarker
                variant={hasUnreadPriorityNotification ? 'red' : 'amber'}
                size="sm"
                className="absolute top-1.5 right-2 z-10"
              />
            ) : (
              <span
                className="absolute top-1.5 right-2 z-10 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900"
                aria-hidden="true"
              />
            )
          ) : item.id === 'notification' ? (
            <span className="relative z-10 inline-flex items-center gap-1.5 shrink-0">
              <NotificationBlinkMarker
                variant={hasUnreadPriorityNotification ? 'red' : 'amber'}
                size="sm"
              />
              <span
                className={`font-mono text-xs tabular-nums font-semibold ${
                  hasUnreadPriorityNotification
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {count}
              </span>
            </span>
          ) : (
            <span className="relative z-10 font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
              {count}
            </span>
          ))}
      </button>
    );
  }

  function renderDashboardNavItems(isMobile = false) {
    const primaryItems = isAdmin ? ADMIN_PRIMARY_ITEMS : MEMBER_NAV_ITEMS;
    const collapsed = !isMobile && sidebarCollapsed;
    return (
      <div className="space-y-4">
        <div className="space-y-0.5">
          {primaryItems.map((item) => renderNavButton(item, isMobile))}
        </div>

        {isManager && (
          <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800/80 space-y-1">
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tNav('groups.manager')}
              </div>
            )}
            <div className="space-y-0.5">
              {MANAGER_NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800/80 space-y-1">
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tNav('groups.admin')}
              </div>
            )}
            <div className="space-y-0.5">
              {ADMIN_NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMobileDrawerSection(
    title: string,
    items: Array<{
      id: string;
      label: string;
      Icon: typeof Home;
      badge?: number;
      blink?: 'amber' | 'red';
      active?: boolean;
      accent?: 'emerald' | 'amber';
      onClick: () => void;
    }>
  ) {
    return (
      <div className="space-y-1">
        <div className="px-2.5 pb-0.5 text-[11.5px] font-semibold tracking-tight text-slate-500 dark:text-slate-400 truncate">
          {title}
        </div>
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.Icon;
            const toneStyle = SIDEBAR_TONE_STYLES[item.accent || 'emerald'];
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-current={item.active ? 'page' : undefined}
                className={`relative w-full min-h-[40px] px-2.5 py-2 text-[14px] leading-snug rounded-xl flex items-center justify-between gap-2 transition-colors cursor-pointer text-left ${
                  item.active
                    ? toneStyle.activeText
                    : 'text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                }`}
              >
                {item.active && (
                  <motion.span
                    layoutId="mobile-drawer-active-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className={`absolute inset-0 rounded-xl ${toneStyle.pillBg}`}
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      item.active
                        ? toneStyle.activeIconBox
                        : 'bg-gradient-to-b from-slate-50 to-slate-100/90 dark:from-slate-800/85 dark:to-slate-900/85 border-slate-200/85 dark:border-slate-700/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    }`}
                  >
                    <Icon
                      className={`w-[16px] h-[16px] shrink-0 ${
                        item.active ? toneStyle.activeIcon : 'text-slate-600 dark:text-slate-300'
                      }`}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  item.blink ? (
                    <span className="relative z-10 inline-flex items-center gap-1.5 shrink-0">
                      <NotificationBlinkMarker variant={item.blink} size="sm" />
                      <span
                        className={`font-mono text-xs tabular-nums font-semibold ${
                          item.blink === 'red'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    </span>
                  ) : (
                    <span className="relative z-10 font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                      {item.badge}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderMobileDrawerNav() {
    const moneyItems = isAdmin
      ? [
          {
            id: 'fund-overview',
            label: tNav('overview'),
            Icon: Home,
            active: activeSection === 'fund-overview',
            onClick: () => navigateToPage('fund-overview', true),
          },
          {
            id: 'transaction-history',
            label: tNav('transactions'),
            Icon: ReceiptText,
            active: activeSection === 'transaction-history',
            onClick: () => navigateToPage('transaction-history', true),
          },
          {
            id: 'statistics',
            label: tNav('statistics'),
            Icon: ChartColumn,
            active: activeSection === 'statistics',
            onClick: () => navigateToPage('statistics', true),
          },
          {
            id: 'balance-sheet',
            label: tNav('balanceSheet'),
            Icon: FileSpreadsheet,
            active: activeSection === 'balance-sheet',
            onClick: () => navigateToPage('balance-sheet', true),
          },
        ]
      : [
          {
            id: 'fund-overview',
            label: tNav('overview'),
            Icon: Home,
            active: activeSection === 'fund-overview',
            onClick: () => navigateToPage('fund-overview', true),
          },
          {
            id: 'monthly-contribution',
            label: tNav('contributions'),
            Icon: Banknote,
            badge: isManager ? pendingBadgeCount('monthly-contribution') : 0,
            active: activeSection === 'monthly-contribution',
            onClick: () => navigateToPage('monthly-contribution', true),
          },
          {
            id: 'quard-hasan',
            label: tNav('qardHasan'),
            Icon: HandCoins,
            active: activeSection === 'quard-hasan',
            onClick: () => navigateToPage('quard-hasan', true),
          },
          {
            id: 'my-amanah',
            label: tNav('myAmanah'),
            Icon: WalletCards,
            active: activeSection === 'my-amanah',
            onClick: () => navigateToPage('my-amanah', true),
          },
          {
            id: 'transaction-history',
            label: tNav('transactions'),
            Icon: ReceiptText,
            active: activeSection === 'transaction-history',
            onClick: () => navigateToPage('transaction-history', true),
          },
          {
            id: 'balance-sheet',
            label: tNav('balanceSheet'),
            Icon: FileSpreadsheet,
            active: activeSection === 'balance-sheet',
            onClick: () => navigateToPage('balance-sheet', true),
          },
        ];

    const communityItems = [
      {
        id: 'ballot',
        label: tNav('voting'),
        Icon: Vote,
        badge: pendingBadgeCount('ballot'),
        active: activeSection === 'ballot',
        accent: 'amber' as const,
        onClick: () => navigateToPage('ballot', true),
      },
      {
        id: 'community',
        label: tNav('community'),
        Icon: MessagesSquare,
        badge: pendingBadgeCount('community'),
        active: activeSection === 'community',
        onClick: () => navigateToPage('community', true),
      },
      {
        id: 'members',
        label: tNav('members'),
        Icon: UsersRound,
        active: activeSection === 'members',
        onClick: () => navigateToPage('members', true),
      },
      {
        id: 'manager-cycle',
        label: tNav('managerCycle'),
        Icon: CalendarRange,
        active: activeSection === 'manager-cycle',
        accent: 'amber' as const,
        onClick: () => navigateToPage('manager-cycle', true),
      },
      ...(!isAdmin
        ? [
            {
              id: 'statistics',
              label: tNav('statistics'),
              Icon: ChartColumn,
              active: activeSection === 'statistics',
              onClick: () => navigateToPage('statistics', true),
            },
          ]
        : []),
    ];

    const roleStaffItems = isAdmin
      ? ADMIN_NAV_ITEMS.map((item) => ({
          id: item.id,
          label: getDashboardSectionLabel(item.id, user?.role, locale),
          Icon: item.Icon,
          badge: pendingBadgeCount(item.id),
          active: activeSection === item.id,
          accent: SECTION_TONE_MAP[item.id] || 'emerald',
          onClick: () => navigateToPage(item.id, true),
        }))
      : isManager
        ? MANAGER_NAV_ITEMS.map((item) => ({
            id: item.id,
            label: getDashboardSectionLabel(item.id, user?.role, locale),
            Icon: item.Icon,
            badge: pendingBadgeCount(item.id),
            active: activeSection === item.id,
            accent: SECTION_TONE_MAP[item.id] || 'amber',
            onClick: () => navigateToPage(item.id, true),
          }))
        : [];

    const accountItems = [
      {
        id: 'notification',
        label: tNav('notifications'),
        Icon: BellRing,
        badge: pendingBadgeCount('notification'),
        blink:
          pendingBadgeCount('notification') > 0
            ? hasUnreadPriorityNotification
              ? ('red' as const)
              : ('amber' as const)
            : undefined,
        active: activeSection === 'notification',
        accent: 'amber' as const,
        onClick: () => navigateToPage('notification', true),
      },
      {
        id: 'my-profile',
        label: tNav('profile'),
        Icon: UserRound,
        active: activeSection === 'my-profile',
        onClick: () => navigateToPage('my-profile', true),
      },
    ];

    return (
      <div className="space-y-2.5">
        {renderMobileDrawerSection(tNav('groups.moneyTreasury'), moneyItems)}
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
          {renderMobileDrawerSection(tNav('groups.cooperativeShura'), communityItems)}
        </div>
        {roleStaffItems.length > 0 && (
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            {renderMobileDrawerSection(
              isAdmin ? tNav('groups.administration') : tNav('groups.managerOperations'),
              roleStaffItems
            )}
          </div>
        )}
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
          {renderMobileDrawerSection(tNav('groups.accountApp'), accountItems)}
        </div>
      </div>
    );
  }

  return (
    <div
      inert={notificationModalOpen}
      aria-hidden={notificationModalOpen || undefined}
      className={`h-dvh overflow-hidden amanah-ambient-canvas text-slate-900 dark:text-slate-100 p-0 lg:p-3 flex flex-col lg:grid ${
        sidebarCollapsed
          ? 'lg:grid-cols-[76px_minmax(0,1fr)]'
          : 'lg:grid-cols-[252px_minmax(0,1fr)]'
      } lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-3 lg:transition-[grid-template-columns] lg:duration-200 ${
        notificationModalOpen ? 'pointer-events-none select-none' : ''
      }`}
    >
      {/* GRID 1 */}
      <div
        className={`hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] shrink-0 items-center bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl rounded-2xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)] z-30 ${
          sidebarCollapsed ? 'px-2 justify-center' : 'px-4 justify-start gap-2.5'
        }`}
      >
        <AmanahLogo size="sm" decorative />
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              {tCommon('brandName')}
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
              {tCommon('dashboard')}
            </div>
          </div>
        )}
      </div>

      {/* GRID 2 */}
      <header className="lg:col-start-2 lg:row-start-1 h-[54px] sm:h-[56px] lg:h-[60px] shrink-0 bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl lg:rounded-2xl border-b lg:border border-slate-200/85 dark:border-slate-800/85 lg:ring-1 lg:ring-inset lg:ring-white/75 lg:dark:ring-white/5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)] px-3 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 z-[45] min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative hidden lg:flex items-center group/sidebar-toggle shrink-0">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-expanded={!sidebarCollapsed}
              aria-controls="dashboard-desktop-sidebar"
              aria-label={
                sidebarCollapsed
                  ? locale === 'bn'
                    ? 'সাইডবার প্রসারিত করুন'
                    : 'Expand sidebar'
                  : locale === 'bn'
                    ? 'সাইডবার সংকুচিত করুন (শুধু আইকন)'
                    : 'Collapse sidebar (icons only)'
              }
              className="w-9 h-9 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/75 dark:bg-slate-800/55 text-slate-600 dark:text-slate-300 hover:bg-emerald-50/85 dark:hover:bg-emerald-950/40 hover:border-emerald-300 dark:hover:border-emerald-700/80 hover:text-emerald-700 dark:hover:text-emerald-300 active:scale-[0.96] transition-all duration-150 flex items-center justify-center cursor-pointer shadow-2xs"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen
                  className="w-4 h-4 transition-transform duration-150 group-hover/sidebar-toggle:translate-x-0.5"
                  aria-hidden="true"
                />
              ) : (
                <PanelLeftClose
                  className="w-4 h-4 transition-transform duration-150 group-hover/sidebar-toggle:-translate-x-0.5"
                  aria-hidden="true"
                />
              )}
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full mt-2 z-50 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-medium whitespace-nowrap shadow-lg border border-slate-800 dark:border-slate-700 opacity-0 -translate-y-0.5 group-hover/sidebar-toggle:opacity-100 group-hover/sidebar-toggle:translate-y-0 group-focus-within/sidebar-toggle:opacity-100 group-focus-within/sidebar-toggle:translate-y-0 transition-all duration-150"
            >
              {sidebarCollapsed
                ? locale === 'bn'
                  ? 'সাইডবার প্রসারিত করুন'
                  : 'Expand sidebar'
                : locale === 'bn'
                  ? 'সাইডবার সংকুচিত করুন'
                  : 'Collapse sidebar'}
            </span>
          </div>
          <span
            aria-hidden="true"
            className="hidden lg:block h-5 w-px bg-slate-200/90 dark:bg-slate-800 shrink-0"
          />
          <button
            type="button"
            onClick={() => (mobileNavOpen ? closeMobileDrawer() : openMobileDrawer())}
            aria-label={mobileNavOpen ? tCommon('closeNavigationMenu') : tCommon('openNavigationMenu')}
            aria-expanded={mobileNavOpen}
            className="lg:hidden w-10 h-10 rounded-xl border border-slate-200/85 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:bg-emerald-50/70 dark:hover:bg-slate-800 active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            {mobileNavOpen ? (
              <X className="w-[18px] h-[18px]" aria-hidden="true" />
            ) : (
              <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
            )}
          </button>
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-2 min-w-0">
            <span className="text-slate-500 dark:text-slate-400 hidden lg:inline text-sm">
              {tCommon('brandName')}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">/</span>
            <div className="relative overflow-hidden min-w-0">
              <AnimatePresence mode="wait" initial={false} custom={navDirection}>
                <motion.h1
                  key={activeSection}
                  custom={navDirection}
                  variants={DASHBOARD_HEADER_TITLE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="font-display font-bold lg:font-semibold text-slate-900 dark:text-white truncate text-[15px] sm:text-base lg:text-sm tracking-tight"
                >
                  {getDashboardSectionLabel(activeSection, user.role, locale)}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Link
            href="/"
            onClick={() => {
              if (isMobileViewport()) setMobileBrowseMode(true);
            }}
            title={tNav('publicWebsite')}
            className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200/85 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/75 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tNav('home')}</span>
          </Link>

          <LanguageSwitcher
            variant="segmented"
            layoutId="dash-header-lang-pill"
            className="hidden xl:inline-flex"
          />
          <LanguageSwitcher variant="compact" className="hidden lg:inline-flex xl:hidden" />

          <div className="hidden lg:block">
            <HeaderNotificationBell
              user={user}
              overview={overview}
              contributions={contributions}
              loans={loans}
              notifications={notifications}
              notificationsLoading={notificationsLoading}
              onNavigate={(section) => navigateToPage(section, false)}
              onOpenManagerDeskTab={openManagerDeskTab}
              onOpenContributionMonth={(month) => {
                setPreselectedBillingMonth(month);
                navigateToPage('monthly-contribution', false, true, true);
              }}
              onMarkRead={handleDismissLoanDecisionAlert}
              onOpenChange={(open) => {
                setNotificationModalOpen(open);
                if (open && mobileNavOpen) closeMobileDrawer();
              }}
            />
          </div>

          <PWAUpdateButton compact className="hidden lg:inline-flex" />

          <button
            type="button"
            onClick={toggleDarkMode}
            aria-pressed={darkMode}
            title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            className="flex w-9 h-9 rounded-xl border border-slate-200/85 dark:border-[#163948] bg-white/85 dark:bg-[#032330]/85 text-slate-600 dark:text-slate-200 hover:bg-emerald-50/75 dark:hover:bg-[#063235] hover:border-emerald-300/80 dark:hover:border-[#00ED64]/45 active:scale-95 shadow-2xs transition-all items-center justify-center cursor-pointer shrink-0"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              void handleRefreshWithAutoSync();
            }}
            disabled={dataLoading}
            title={tCommon('refreshDashboardTitle')}
            aria-label={tCommon('refreshDashboard')}
            className="w-9 h-9 rounded-xl border border-slate-200/85 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-300 active:scale-95 shadow-2xs transition-all flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-70"
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 ${dataLoading ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={() => navigateToPage('fund-overview', false)}
            aria-label={tCommon('brandName')}
            className="lg:hidden ml-0.5 inline-flex items-center justify-center rounded-xl active:scale-95 transition-transform cursor-pointer shrink-0"
          >
            <AmanahLogo size="xs" decorative />
          </button>
        </div>
      </header>

      {/* GRID 3 */}
      <aside
        id="dashboard-desktop-sidebar"
        className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col min-h-0 h-full overflow-hidden bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl rounded-2xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)]"
      >
        <nav
          className={`flex-1 min-h-0 py-3.5 overflow-y-auto overflow-x-hidden scrollbar-subtle ${
            sidebarCollapsed ? 'px-2' : 'px-2.5'
          }`}
          aria-label={tNav('primaryNav')}
        >
          {renderDashboardNavItems(false)}
        </nav>

        <div
          className={`border-t border-slate-200/75 dark:border-slate-800/80 ${
            sidebarCollapsed ? 'p-2.5 flex flex-col items-center gap-2' : 'p-3 space-y-2.5'
          }`}
        >
          {sidebarCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => navigateToPage('my-profile', false)}
                title={`${user.name} · ${user.memberCode}`}
                aria-label={user.name}
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-700 dark:from-emerald-600 dark:to-teal-600 text-white text-xs font-semibold flex items-center justify-center shadow-xs hover:brightness-105 transition-all cursor-pointer shrink-0"
              >
                {(user.name || 'AM')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('')}
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                aria-pressed={darkMode}
                title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                className="w-full h-9 rounded-xl border border-slate-200/85 dark:border-[#163948] bg-slate-50/85 dark:bg-[#032330]/90 hover:bg-emerald-50/75 dark:hover:bg-[#063235] hover:border-emerald-300/80 dark:hover:border-[#00ED64]/45 text-slate-600 dark:text-slate-200 transition-colors flex items-center justify-center cursor-pointer"
              >
                {darkMode ? (
                  <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title={tNav('signOut')}
                aria-label={tNav('signOut')}
                className="w-full h-9 rounded-xl border border-red-200/90 dark:border-red-900/70 bg-red-50/75 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigateToPage('my-profile', false)}
                className="w-full text-left min-w-0 rounded-xl border border-slate-200/75 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/45 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 p-2.5 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-700 dark:from-emerald-600 dark:to-teal-600 text-white text-[11px] font-bold flex items-center justify-center shadow-2xs shrink-0">
                  {(user.name || 'AM')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() || '')
                    .join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                      {user.name}
                    </span>
                    {user.status === 'active' && (
                      <BadgeCheck
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                        aria-label={tCommon('verified')}
                      />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {translateRoleLabel(user.role, locale)} · <span className="font-mono">{user.memberCode}</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                role="switch"
                aria-checked={darkMode}
                title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                className="w-full py-2 px-3 rounded-xl border border-slate-200/85 dark:border-[#163948] bg-slate-50/85 dark:bg-[#032330]/90 hover:bg-emerald-50/75 dark:hover:bg-[#063235] hover:border-emerald-300/80 dark:hover:border-[#00ED64]/45 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all duration-150 flex items-center justify-between gap-2 cursor-pointer whitespace-nowrap"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {darkMode ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {darkMode ? tCommon('lightMode') : tCommon('darkMode')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    darkMode
                      ? 'bg-[#00ED64]/25 border border-[#00ED64]/50'
                      : 'bg-slate-200 border border-slate-300/80'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full transition-transform duration-150 ${
                      darkMode
                        ? 'translate-x-3.5 bg-[#00ED64]'
                        : 'translate-x-0.5 bg-slate-500'
                    }`}
                  />
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full py-2 px-3 rounded-xl border border-red-200/90 dark:border-red-900/70 bg-red-50/75 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tNav('signOut')}</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Floating Navigation Drawer (matches homepage glassmorphic emerald menu card) */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-slate-950/25 dark:bg-slate-950/45 backdrop-blur-xs"
              onClick={closeMobileDrawer}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              aria-label={tCommon('dashboardMenuAria')}
              className="fixed left-2 top-[60px] sm:top-[64px] w-[72vw] max-w-[300px] max-h-[calc(100dvh-70px)] sm:max-h-[calc(100dvh-76px)] z-10 amanah-card-emerald backdrop-blur-xl rounded-2xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 p-2.5 flex flex-col gap-1.5 shadow-2xl"
            >
              {/* Compact User Profile Header */}
              <button
                type="button"
                onClick={() => navigateToPage('my-profile', true)}
                className="w-full text-left flex items-center gap-2.5 px-1.5 pb-2.5 pt-0.5 border-b border-slate-200/80 dark:border-slate-800 min-w-0 shrink-0 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
              >
                {(() => {
                  const drawerPhotoUrl = user.registrationDetails?.photoUrl || user.photoUrl;
                  const showPhoto = Boolean(
                    drawerPhotoUrl && failedDrawerPhotoUrl !== drawerPhotoUrl
                  );
                  return showPhoto ? (
                    <img
                      src={drawerPhotoUrl}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedDrawerPhotoUrl(drawerPhotoUrl || null)}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30 shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-700 to-teal-700 dark:from-emerald-600 dark:to-teal-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {(user.name || 'AM')
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() || '')
                        .join('')}
                    </span>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-slate-900 dark:text-white truncate leading-snug">
                    {user.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 min-w-0 text-[11.5px] text-slate-600 dark:text-slate-400">
                    <span className="truncate">{translateRoleLabel(user.role, locale)}</span>
                    {user.status === 'active' ? (
                      <BadgeCheck
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                        aria-label={tCommon('verified')}
                      />
                    ) : (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium shrink-0">
                          {tCommon('pending')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"
                  aria-hidden="true"
                />
              </button>

              <nav
                className="flex-1 min-h-0 py-0.5 pr-1 -mr-1 overflow-y-auto overscroll-contain scrollbar-subtle"
                aria-label={tNav('primaryNav')}
              >
                {renderMobileDrawerNav()}
              </nav>

              <div className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-1.5 shrink-0">
                <Link
                  href="/?browse=1"
                  onClick={() => {
                    triggerHaptic('nav');
                    drawerHistoryPushedRef.current = false;
                    setMobileBrowseMode(true);
                    setMobileNavOpen(false);
                  }}
                  className="w-full min-h-[40px] py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-[13.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-start gap-2 whitespace-nowrap"
                >
                  <Home className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tNav('home')}</span>
                </Link>
                <PWAUpdateButton
                  fullWidth
                  align="start"
                  popoverPlacement="top"
                  popoverAlign="left"
                />
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full min-h-[40px] py-2 px-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-colors text-[13.5px] font-medium flex items-center justify-start gap-2 cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tNav('signOut')}</span>
                </button>
                <div className="pt-2 mt-0.5 border-t border-slate-200/75 dark:border-slate-800/80 flex items-center gap-1.5">
                  <LanguageSwitcher variant="compact" className="h-9 px-2.5 text-[12.5px] gap-1.5" />
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    aria-pressed={darkMode}
                    title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                    aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                    className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-200/80 dark:border-[#163948] bg-white/85 dark:bg-[#032330]/90 text-slate-700 dark:text-slate-200 hover:bg-emerald-50/75 dark:hover:bg-[#063235] hover:border-emerald-300/80 dark:hover:border-[#00ED64]/45 transition-colors text-[12.5px] font-medium cursor-pointer whitespace-nowrap"
                  >
                    {darkMode ? (
                      <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Moon className="w-3.5 h-3.5 text-emerald-700 dark:text-[#00ED64] shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{darkMode ? tCommon('lightMode') : tCommon('darkMode')}</span>
                  </button>
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* GRID 4: Multi-Page Dashboard Content */}
      <main
        data-surface="app"
        className="lg:col-start-2 lg:row-start-2 min-w-0 min-h-0 w-full flex-1 flex flex-col lg:pl-3 lg:pr-1 lg:bg-white/95 lg:dark:bg-slate-900/92 lg:backdrop-blur-xl lg:rounded-2xl lg:border lg:border-slate-200/85 lg:dark:border-slate-800/85 lg:ring-1 lg:ring-inset lg:ring-white/75 lg:dark:ring-white/5 lg:shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:lg:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)] overflow-hidden"
      >
        <div
          ref={mainScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-subtle pl-2 pr-1 pt-3 pb-6 sm:pl-2.5 sm:pr-1.5 sm:pt-4 sm:pb-6 lg:pl-0 lg:pr-1 lg:pt-4 lg:pb-5"
        >
          <PullToRefreshIndicator {...pullToRefresh} />
          <div className="w-full space-y-3 sm:space-y-4 overflow-x-clip">
          {/* Top Alerts: Loan Decisions & Live Pending Ballots */}
          {(() => {
            const loanDecisionAlerts = notifications.filter(
              (n) =>
                !n.readByRecipient &&
                (n.type === 'loan_approved_confirmation' || n.type === 'loan_rejected_notice') &&
                (n.recipientUserId === user.id ||
                  n.recipientEmail.toLowerCase() === user.email.toLowerCase())
            );
            if (loanDecisionAlerts.length === 0) return null;

            return (
              <div className="space-y-3" aria-live="polite">
                {loanDecisionAlerts.map((alert) => {
                  const isApproved = alert.type === 'loan_approved_confirmation';
                  return (
                    <motion.section
                      key={alert.id}
                      role="alert"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`rounded-xl border backdrop-blur-md p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs transition-all duration-200 hover:shadow-md ${isApproved
                        ? 'bg-emerald-50/75 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-900/60'
                        : 'bg-red-50/75 dark:bg-red-950/40 border-red-200/80 dark:border-red-900/60'
                        }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isApproved
                            ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-600/15 text-red-700 dark:text-red-400'
                            }`}
                        >
                          {isApproved ? (
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <XCircle className="w-4 h-4" aria-hidden="true" />
                          )}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div
                            className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${isApproved
                              ? 'text-emerald-900 dark:text-emerald-200'
                              : 'text-red-900 dark:text-red-200'
                              }`}
                          >
                            <span>
                              {isApproved
                                ? tDash('alerts.loanApproved')
                                : tDash('alerts.loanDeclined')}
                            </span>
                            <span aria-hidden="true" className="opacity-50">
                              ·
                            </span>
                            <span className="font-mono font-normal">
                              {formatDateTime(alert.createdAt)}
                            </span>
                          </div>
                          <p
                            className={`text-xs font-medium ${isApproved
                              ? 'text-emerald-900 dark:text-emerald-100'
                              : 'text-red-900 dark:text-red-100'
                              }`}
                          >
                            {alert.subject}
                          </p>
                          <p
                            className={`text-xs leading-relaxed ${isApproved
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-red-800 dark:text-red-300'
                              }`}
                          >
                            {alert.body}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleOpenLoanFromDecisionAlert(alert.id)}
                          className={`px-3.5 py-2 rounded-lg text-white text-xs font-medium transition-all duration-200 hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${isApproved
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                          <span>{tDash('alerts.openQardHasan')}</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateToPage('notification', false)}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {tNav('notifications')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismissLoanDecisionAlert(alert.id)}
                          aria-label={tDash('alerts.markReadDismiss')}
                          title={tDash('alerts.markReadDismiss')}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.section>
                  );
                })}
              </div>
            );
          })()}

          {(() => {
            if (isAdmin) return null;
            const unvotedLoanProposals = loans.filter(
              (l) =>
                l.status === 'pending_vote' &&
                !l.voteResultRevealed &&
                !l.votes.some((v) => v.isSelf || v.voterId === user.id) &&
                !dismissedLoanAlertIds.includes(l.id)
            );
            if (activeSection === 'ballot' || unvotedLoanProposals.length === 0) {
              return null;
            }
            const featuredLoan =
              unvotedLoanProposals.find((l) => l.id === liveLoanPulseId) || unvotedLoanProposals[0];
            const totalBallotsCast = featuredLoan.totalVotesCast ?? featuredLoan.votes.length;
            const ccy = overview?.config.currency || 'BDT';

            return (
              <motion.section
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="bg-amber-50/75 dark:bg-amber-950/40 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-600/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Vote className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                      <span>
                        {unvotedLoanProposals.length === 1
                          ? tDash('alerts.singleProposalOpen')
                          : tDash('alerts.multiProposalsOpen', { count: unvotedLoanProposals.length })}
                      </span>
                      <span aria-hidden="true" className="text-amber-400 dark:text-amber-700">
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        {tDash('alerts.pollOngoing', { count: totalBallotsCast })}
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <strong className="font-semibold">{featuredLoan.borrowerName}</strong> (
                      <span className="font-mono">{featuredLoan.id}</span>) ·{' '}
                      <strong className="font-mono tabular-nums">
                        {formatMoney(featuredLoan.amount, ccy)}
                      </strong>{' '}
                      / {featuredLoan.installmentMonths} {tCommon('monthsShort')} — &ldquo;{featuredLoan.purpose}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigateToPage('ballot', false);
                      setLiveLoanPulseId(null);
                    }}
                    className="group px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <span>{tDash('alerts.openVoting')}</span>
                    <ArrowRight
                      className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDismissedLoanAlertIds((prev) => [
                        ...prev,
                        ...unvotedLoanProposals.map((l) => l.id),
                      ])
                    }
                    aria-label={tDash('alerts.dismissVoteAlert')}
                    title={tDash('alerts.dismissVoteAlert')}
                    className="p-2 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.section>
            );
          })()}

          <AnimatePresence mode="wait" initial={false} custom={navDirection}>
            <motion.div
              key={
                activeSection === 'member-profile' && viewingMemberId
                  ? `member-profile:${viewingMemberId}`
                  : activeSection
              }
              custom={navDirection}
              variants={DASHBOARD_VIEW_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full"
            >
              {activeSection === 'fund-overview' && (
                <section id="fund-overview" className="space-y-4">
                  <div className="lg:hidden">
                    <MobileMfsHome
                      overview={overview}
                      contributions={contributions}
                      loans={loans}
                      user={user}
                      loading={overviewLoading}
                      activityLoading={contributionsLoading || loansLoading}
                      pendingBadgeCount={pendingBadgeCount}
                      hasUnreadPriorityNotification={hasUnreadPriorityNotification}
                      onNavigate={(sec) => navigateToPage(sec, false)}
                      onOpenManagerDeskTab={openManagerDeskTab}
                      onOpenLoanModal={() => void openLoanRequestModal()}
                      onViewMemberProfile={handleViewMemberProfile}
                      onRefresh={handleRefreshWithAutoSync}
                    />
                  </div>
                  <div className="hidden lg:block space-y-4">
                    <OverviewView
                      overview={overview}
                      loans={loans}
                      user={user}
                      loading={overviewLoading}
                      onNavigate={(sec) => navigateToPage(sec, false)}
                      onOpenManagerDeskTab={openManagerDeskTab}
                      onViewMemberProfile={handleViewMemberProfile}
                    />
                  </div>
                </section>
              )}

              {!isAdmin && activeSection === 'monthly-contribution' && (
                <section id="monthly-contribution" className="space-y-4">
                  <ContributionsView
                    contributions={contributions}
                    config={overview?.config || null}
                    user={user}
                    loading={contributionsLoading}
                    initialBillingMonth={preselectedBillingMonth}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'quard-hasan' && (
                <section id="quard-hasan" className="space-y-4">
                  <LoansView
                    loans={loans}
                    eligibility={overview?.personal.eligibility || null}
                    config={overview?.config || null}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    user={user}
                    loading={loansLoading || overviewLoading}
                    onOpenLoanModal={() => void openLoanRequestModal()}
                    onLoanCreated={handleLoanCreatedOptimistic}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'my-amanah' && (
                <section id="my-amanah" className="space-y-4">
                  <MyAmanahView
                    overview={overview}
                    loans={loans}
                    user={user}
                    loading={overviewLoading || loansLoading}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onOpenLoanModal={() => void openLoanRequestModal()}
                  />
                </section>
              )}

              {activeSection === 'my-profile' && (
                <section id="my-profile" className="space-y-4">
                  <MemberProfile user={user} onRefresh={handleRefreshWithAutoSync} />
                </section>
              )}

              {activeSection === 'notification' && (
                <section id="notification" className="space-y-4">
                  <NotificationsView
                    user={user}
                    workspace={workspace}
                    meetings={meetings}
                    connectingGoogle={connectingGoogle}
                    onConnectGoogle={handleConnectGoogle}
                    onDisconnectGoogle={handleDisconnectGoogle}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onOpenManagerDeskTab={openManagerDeskTab}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {activeSection === 'statistics' && (
                <section id="statistics" className="space-y-4">
                  <StatisticsView
                    overview={overview}
                    contributions={contributions}
                    loans={loans}
                    user={user}
                    loading={overviewLoading || contributionsLoading || loansLoading}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'ballot' && (
                <section id="ballot" className="space-y-4">
                  <VotingView
                    loans={loans}
                    projects={halalProjects}
                    polls={polls}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    config={overview?.config || null}
                    user={user}
                    loading={loansLoading || halalProjectsLoading || pollsLoading}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'transaction-history' && (
                <section id="transaction-history" className="space-y-4">
                  <TransactionHistory
                    contributions={contributions}
                    loans={loans}
                    config={overview?.config || null}
                    user={user}
                    loading={contributionsLoading || loansLoading}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'members' && (
                <section id="members" className="space-y-4 pb-8">
                  <ActiveMembersView
                    user={user}
                    config={overview?.config || null}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'balance-sheet' && (
                <section id="balance-sheet" className="space-y-4 pb-8">
                  <BalanceSheetView
                    user={user}
                    config={overview?.config || null}
                    onViewMemberProfile={handleViewMemberProfile}
                    workspace={workspace}
                    connectingGoogle={connectingGoogle}
                    googleAuthError={googleAuthError}
                    onClearGoogleAuthError={clearGoogleAuthError}
                    onConnectGoogle={handleConnectGoogle}
                    onDisconnectGoogle={handleDisconnectGoogle}
                    onConfigUpdated={async () => {
                      await refreshWorkspace(true);
                    }}
                  />
                </section>
              )}

              {activeSection === 'manager-cycle' && (
                <section id="manager-cycle" className="space-y-4 pb-8">
                  <ManagerCycleView
                    user={user}
                    config={overview?.config || null}
                    onViewMemberProfile={handleViewMemberProfile}
                    onOpenConfig={isAdmin ? () => navigateToPage('site-settings', false) : undefined}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {activeSection === 'community' && (
                <section id="community" className="space-y-4 pb-8">
                  <CommunityView
                    user={user}
                    onRefreshWorkspace={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'member-profile' && viewingMemberId && (
                <section id="member-profile" className="space-y-4 pb-8">
                  <MemberPublicProfileView
                    memberId={viewingMemberId}
                    currentUser={user}
                    onBack={() => navigateToPage(profileReturnSection, false)}
                    onOpenOwnProfile={() => navigateToPage('my-profile', false)}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {isStaff && activeSection === 'manager-desk' && (
                <section id="manager-desk" className="space-y-4 pb-8">
                  <ManagerDeskView
                    user={user}
                    config={overview?.config || null}
                    treasury={overview?.treasury || null}
                    loading={
                      overviewLoading ||
                      contributionsLoading ||
                      loansLoading ||
                      halalProjectsLoading ||
                      pollsLoading ||
                      meetingsLoading ||
                      profileChangeRequestsLoading
                    }
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    contributions={contributions}
                    loans={loans}
                    halalProjects={halalProjects}
                    polls={polls}
                    meetings={meetings}
                    profileChangeRequests={profileChangeRequests}
                    requestedTab={managerDeskTabRequest}
                    onViewMemberProfile={handleViewMemberProfile}
                    onOpenManagerCycle={() => navigateToPage('manager-cycle', false)}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {isAdmin && activeSection === 'site-activity' && (
                <section id="site-activity" className="space-y-4">
                  <AdminAuditLog user={user} />
                </section>
              )}

              {isStaff && activeSection === 'member-registry' && (
                <section id="member-registry" className="space-y-4">
                  <MemberRegistrySection
                    user={user}
                    config={overview?.config || null}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {isAdmin && activeSection === 'site-settings' && (
                <section id="site-settings" className="space-y-4 pb-8">
                  <AdminSiteSettingsView
                    overview={overview}
                    config={overview?.config || null}
                    user={user}
                    loans={loans}
                    projects={halalProjects}
                    loading={overviewLoading || halalProjectsLoading}
                    workspace={workspace}
                    connectingGoogle={connectingGoogle}
                    onConnectGoogle={handleConnectGoogle}
                    onDisconnectGoogle={handleDisconnectGoogle}
                    onRefresh={handleRefreshWithAutoSync}
                    onNavigateSection={(sectionId) => navigateToPage(sectionId, false)}
                    requestedTab={settingsTabRequest}
                  />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Sticky Mobile Footer Navigation Bar */}
      <nav
        aria-label={tNav('primaryNav')}
        className="lg:hidden shrink-0 z-30 bg-white/95 dark:bg-slate-900/94 backdrop-blur-xl border-t border-slate-200/85 dark:border-slate-800/85 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.1)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4 h-[60px] items-stretch">
          {(
            [
              {
                id: 'overview',
                label: tNav('overview'),
                Icon: HomeTabIcon,
                target: 'fund-overview' as DashboardSectionId,
                active: activeSection === 'fund-overview',
                badge: 0,
                priorityBlink: false,
              },
              user.role === 'member'
                ? {
                    id: 'my-amanah',
                    label: tNav('myAmanah'),
                    Icon: MyAmanahIcon,
                    target: 'my-amanah' as DashboardSectionId,
                    active: activeSection === 'my-amanah',
                    badge: 0,
                    priorityBlink: false,
                  }
                : {
                    id: 'transactions',
                    label: tNav('transactions'),
                    Icon: TransactionHistoryIcon,
                    target: 'transaction-history' as DashboardSectionId,
                    active: activeSection === 'transaction-history',
                    badge: 0,
                    priorityBlink: false,
                  },
              {
                id: 'community',
                label: tNav('community'),
                Icon: CommunityIcon,
                target: 'community' as DashboardSectionId,
                active: activeSection === 'community',
                badge: pendingBadgeCount('community'),
                priorityBlink: false,
              },
              {
                id: 'notification',
                label: tNav('notifications'),
                Icon: NotificationBellIcon,
                target: 'notification' as DashboardSectionId,
                active: activeSection === 'notification',
                badge: pendingBadgeCount('notification'),
                priorityBlink:
                  pendingBadgeCount('notification') > 0 && hasUnreadPriorityNotification,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateToPage(tab.target, false)}
                aria-current={tab.active ? 'page' : undefined}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer active:scale-95 ${
                  tab.active
                    ? 'text-emerald-700 dark:text-[#00ED64]'
                    : 'text-slate-500 dark:text-slate-300/75 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {tab.active && (
                  <motion.span
                    layoutId="mobile-footer-active-line"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-4 right-4 h-[2.5px] bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 dark:from-[#00ED64] dark:via-[#18E299] dark:to-[#00ED64] shadow-[0_1px_6px_rgba(16,185,129,0.4)] dark:shadow-[0_1px_10px_rgba(0,237,100,0.65)]"
                  />
                )}
                <span className="relative inline-flex items-center justify-center px-3.5 py-0.5 transition-transform duration-150">
                  {tab.active && (
                    <motion.span
                      layoutId="mobile-footer-active-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-full bg-emerald-600/12 dark:bg-[#00ED64]/15"
                    />
                  )}
                  <Icon
                    strokeWidth={tab.active ? 2 : 1.65}
                    className={`relative w-[20px] h-[20px] transition-transform duration-150 ${
                      tab.active ? 'mdb-icon-emerald scale-[1.06]' : ''
                    }`}
                    aria-hidden="true"
                  />
                  {tab.badge > 0 && (
                    <span className="absolute -top-0.5 right-0.5 flex items-center justify-center">
                      {tab.id === 'notification' && (
                        <span
                          aria-hidden="true"
                          className={`absolute inset-0 rounded-full pointer-events-none ${
                            tab.priorityBlink
                              ? 'bg-red-500 amanah-blink-ring-urgent'
                              : 'bg-amber-500 amanah-blink-ring'
                          }`}
                        />
                      )}
                      <span
                        className={`relative min-w-[16px] h-[16px] px-1 rounded-full font-mono text-[9px] font-bold tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs ${
                          tab.priorityBlink
                            ? 'bg-red-600 dark:bg-red-500 text-white'
                            : 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950'
                        }`}
                      >
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    </span>
                  )}
                </span>
                <span
                  className={`max-w-full truncate text-[10px] leading-tight tracking-tight whitespace-nowrap ${
                    tab.active ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {!isAdmin && (
        <ActionModal
          open={Boolean(loanGateNotice)}
          mode={loanGateNotice?.withdrawLoanId ? 'confirm' : 'notice'}
          tone="amber"
          title={loanGateNotice?.title || ''}
          description={loanGateNotice?.description || ''}
          confirmLabel={
            loanGateNotice?.withdrawLoanId
              ? tDash('alerts.withdrawPendingApp')
              : tDash('alerts.understood')
          }
          cancelLabel={tCommon('close')}
          busy={loanGateBusy}
          onConfirm={
            loanGateNotice?.withdrawLoanId
              ? async () => {
                  const id = loanGateNotice.withdrawLoanId!;
                  setLoanGateBusy(true);
                  try {
                    await api.withdrawLoan(id);
                    queryClient.setQueryData<{ loans: LoanRequest[] }>(
                      queryKeys.dashboard.loans(),
                      (prev) => ({
                        loans: (prev?.loans ?? []).map((l) =>
                          l.id === id
                            ? {
                                ...l,
                                status: 'rejected',
                                adminReviewNote:
                                  'Withdrawn by borrower before manager vote initiation.',
                              }
                            : l
                        ),
                      })
                    );
                    queryClient.setQueryData<DashboardOverview>(
                      queryKeys.dashboard.overview(),
                      (prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          personal: {
                            ...prev.personal,
                            eligibility: {
                              ...prev.personal.eligibility,
                              eligible: true,
                              noActiveLoan: true,
                              activeLoanId: undefined,
                              reasons: [
                                'No active or pending Qard Hasan loan.',
                                ...(prev.personal.eligibility.reasons || []).filter(
                                  (r) => !r.startsWith('Existing loan')
                                ),
                              ],
                            },
                          },
                        };
                      }
                    );
                    setLoanGateNotice(null);
                    setLoanModalOpen(true);
                    try {
                      await handleRefreshWithAutoSync();
                    } catch {
                      /* optimistic state already applied */
                    }
                  } catch (err) {
                    setLoanGateNotice({
                      title: tDash('alerts.couldNotWithdraw'),
                      description:
                        err instanceof Error
                          ? err.message
                          : tDash('alerts.withdrawFailed'),
                    });
                  } finally {
                    setLoanGateBusy(false);
                  }
                }
              : undefined
          }
          onClose={() => {
            if (!loanGateBusy) setLoanGateNotice(null);
          }}
        />
      )}

      {!isAdmin && (
        <RequestQardHasanModal
          open={loanModalOpen}
          onClose={() => setLoanModalOpen(false)}
          user={user}
          eligibility={overview?.personal.eligibility || null}
          config={overview?.config || null}
          availableLiquidity={overview?.treasury.availableLiquidity || 0}
          onSubmitted={async (createdLoan) => {
            handleLoanCreatedOptimistic(createdLoan);
            navigateToPage('quard-hasan');
            try {
              await handleRefreshWithAutoSync();
            } catch (err) {
              console.error('Post-loan workspace refresh failed:', err);
            }
          }}
        />
      )}

    </div>
  );
}
