'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FilePlus2,
  FileSpreadsheet,
  HandCoins,
  History,
  Home,
  LogOut,
  MailWarning,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  User,
  Users,
  Vote,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { ActiveMembersView } from './ActiveMembersView.tsx';
import { AdminAuditLog } from './AdminAuditLog.tsx';
import { AdminEmailQueueView } from './AdminEmailQueueView.tsx';
import { AdminSiteSettingsView } from './AdminSiteSettingsView.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { CommunityView } from './CommunityView.tsx';
import { ContributionsView } from './ContributionsView.tsx';
import { HeaderNotificationBell } from './HeaderNotificationBell.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { LoansView } from './LoansView.tsx';
import { ManagerCycleView } from './ManagerCycleView.tsx';
import { ManagerDeskView, type ManagerDeskTab } from './ManagerDeskView.tsx';
import { MemberProfile } from './MemberProfile.tsx';
import { MemberPublicProfileView } from './MemberPublicProfileView.tsx';
import { MemberRegistrySection } from './MemberRegistrySection.tsx';
import { MobileMfsHome } from './MobileMfsHome.tsx';
import { MonthlySheetView } from './MonthlySheetView.tsx';
import { MyAmanahView } from './MyAmanahView.tsx';
import { NotificationsView } from './NotificationsView.tsx';
import { OverviewView } from './OverviewView.tsx';
import { ActionModal } from './ActionModal.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { PWAUpdateButton } from './PWAUpdateButton.tsx';
import { RequestQardHasanModal } from './RequestQardHasanModal.tsx';
import { StatisticsView } from './StatisticsView.tsx';
import { SystemAuditLogsView } from './SystemAuditLogsView.tsx';
import { TransactionHistory } from './TransactionHistory.tsx';
import { VotingView } from './VotingView.tsx';
import { translateRoleLabel } from '../i18n/messages.ts';
import { api, getClientSessionToken } from '../utils/api.ts';
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
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { getDashboardSectionLabel, getDeskLabel, getRegistryLabel } from '../utils/navigation.ts';

interface NavItemConfig {
  id: DashboardSectionId;
  label: string;
  Icon: typeof BarChart3;
  group: 'member' | 'manager' | 'admin';
}

const MEMBER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Overview', Icon: BarChart3, group: 'member' },
  { id: 'my-amanah', label: 'My Amanah', Icon: Wallet, group: 'member' },
  { id: 'monthly-contribution', label: 'Contributions', Icon: CreditCard, group: 'member' },
  { id: 'quard-hasan', label: 'Qard Hasan', Icon: HandCoins, group: 'member' },
  { id: 'transaction-history', label: 'Transactions', Icon: History, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: BarChart3, group: 'member' },
  { id: 'ballot', label: 'Voting', Icon: Vote, group: 'member' },
  { id: 'notification', label: 'Notifications', Icon: Bell, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessageSquare, group: 'member' },
  { id: 'members', label: 'Members', Icon: Users, group: 'member' },
  { id: 'monthly-sheet', label: 'Monthly Sheet', Icon: FileSpreadsheet, group: 'member' },
  { id: 'manager-cycle', label: 'Manager Cycle', Icon: CalendarClock, group: 'member' },
  { id: 'my-profile', label: 'Profile', Icon: User, group: 'member' },
];

const MANAGER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'manager-desk', label: 'Manager Desk', Icon: ClipboardCheck, group: 'manager' },
  { id: 'member-registry', label: 'Member Registry', Icon: Users, group: 'manager' },
];

const ADMIN_PRIMARY_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Overview', Icon: BarChart3, group: 'member' },
  { id: 'transaction-history', label: 'Transactions', Icon: History, group: 'member' },
  { id: 'ballot', label: 'Voting', Icon: Vote, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: BarChart3, group: 'member' },
  { id: 'members', label: 'Members', Icon: Users, group: 'member' },
  { id: 'monthly-sheet', label: 'Monthly Sheet', Icon: FileSpreadsheet, group: 'member' },
  { id: 'manager-cycle', label: 'Manager Cycle', Icon: CalendarClock, group: 'member' },
  { id: 'notification', label: 'Notifications', Icon: Bell, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessageSquare, group: 'member' },
  { id: 'my-profile', label: 'Profile', Icon: User, group: 'member' },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'member-registry', label: 'Users & Roles', Icon: Users, group: 'admin' },
  { id: 'manager-desk', label: 'Governance Desk', Icon: ClipboardCheck, group: 'admin' },
  { id: 'site-settings', label: 'Site Settings', Icon: Settings, group: 'admin' },
  { id: 'email-queue', label: 'Email Queue', Icon: MailWarning, group: 'admin' },
  { id: 'site-activity', label: 'Site Activity', Icon: Activity, group: 'admin' },
  { id: 'system-audit-logs', label: 'Audit Logs', Icon: Shield, group: 'admin' },
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
  'monthly-sheet': 'emerald',
  'member-profile': 'emerald',
  community: 'emerald',
  'member-registry': 'emerald',
  'site-settings': 'emerald',
  'email-queue': 'amber',
  'site-activity': 'emerald',
  'system-audit-logs': 'emerald',
};

const SIDEBAR_TONE_STYLES: Record<
  SectionAccentTone,
  {
    pillBg: string;
    activeText: string;
    activeIcon: string;
    eyebrowText: string;
  }
> = {
  emerald: {
    pillBg: 'bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-900/60',
    activeText: 'text-emerald-800 dark:text-emerald-300 font-semibold',
    activeIcon: 'text-emerald-700 dark:text-emerald-400',
    eyebrowText: 'text-emerald-700 dark:text-emerald-400',
  },
  amber: {
    pillBg: 'bg-amber-50/90 dark:bg-amber-950/45 border border-amber-200/80 dark:border-amber-900/60',
    activeText: 'text-amber-800 dark:text-amber-300 font-semibold',
    activeIcon: 'text-amber-700 dark:text-amber-400',
    eyebrowText: 'text-amber-700 dark:text-amber-400',
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
    handleConnectGoogle,
    handleDisconnectGoogle,
  } = useCoopSession();

  const [activeSection, setActiveSection] = useState<DashboardSectionId>('fund-overview');
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [profileReturnSection, setProfileReturnSection] =
    useState<DashboardSectionId>('fund-overview');
  const [pendingDmPeer, setPendingDmPeer] = useState<{
    id: string;
    name: string;
    role: UserRole;
    memberCode: string;
    photoUrl?: string;
  } | null>(null);
  const [preselectedBillingMonth, setPreselectedBillingMonth] = useState<string | null>(null);
  const [managerDeskTabRequest, setManagerDeskTabRequest] = useState<{
    tab: ManagerDeskTab;
    key: number;
  } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const drawerHistoryPushedRef = useRef(false);

  const openMobileDrawer = useCallback(() => {
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
    setMobileNavOpen(false);
    if (typeof window !== 'undefined' && drawerHistoryPushedRef.current) {
      drawerHistoryPushedRef.current = false;
      window.history.back();
    }
  }, []);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [halalProjects, setHalalProjects] = useState<HalalProject[]>([]);
  const [polls, setPolls] = useState<DecisionPoll[]>([]);
  const [meetings, setMeetings] = useState<CoopMeeting[]>([]);
  const [profileChangeRequests, setProfileChangeRequests] = useState<ProfileChangeRequest[]>([]);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
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
  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const autoSyncBusyRef = useRef(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const soundEnabledRef = useRef(false);
  soundEnabledRef.current = Boolean(user?.notificationPreferences?.soundEnabled);

  useEffect(() => {
    if (!authChecking && !user) {
      setMobileBrowseMode(false);
      router.replace(isMobileViewport() ? '/' : '/login');
    } else if (!authChecking && user) {
      setMobileBrowseMode(false);
    }
  }, [authChecking, user, router]);

  const refreshWorkspace = useCallback(async (silent = false): Promise<DashboardOverview | null> => {
    if (!silent) setDataLoading(true);
    try {
      const [ovRes, cRes, lRes, hRes, nRes, dmRes, pRes, mRes, pcrRes] = await Promise.allSettled([
        api.getDashboard(),
        api.getContributions(),
        api.getLoans(),
        api.getHalalProjects(),
        api.getNotifications(),
        api.getPrivateThreads(),
        api.getPolls(),
        api.getMeetings(),
        api.getProfileChangeRequests(),
      ]);

      let nextOverview: DashboardOverview | null = null;
      if (ovRes.status === 'fulfilled') {
        nextOverview = ovRes.value;
        setOverview(ovRes.value);
      }
      if (cRes.status === 'fulfilled') setContributions(cRes.value.contributions);
      if (lRes.status === 'fulfilled') setLoans(lRes.value.loans);
      if (hRes.status === 'fulfilled') setHalalProjects(hRes.value.projects);
      if (nRes.status === 'fulfilled') setNotifications(nRes.value.notifications);
      if (dmRes.status === 'fulfilled') setUnreadDmCount(dmRes.value.totalUnread);
      if (pRes.status === 'fulfilled') setPolls(pRes.value.polls);
      if (mRes.status === 'fulfilled') setMeetings(mRes.value.meetings);
      if (pcrRes.status === 'fulfilled') setProfileChangeRequests(pcrRes.value.requests);

      return nextOverview;
    } catch (err) {
      console.error('Workspace sync error:', err);
      return null;
    } finally {
      if (!silent) setDataLoading(false);
    }
  }, []);

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

  const activeUserId = user?.id ?? null;

  useEffect(() => {
    if (!activeUserId) return;
    void refreshWorkspace(false);

    const sseToken = getClientSessionToken();
    const sseUrl = sseToken
      ? `/api/events?sessionToken=${encodeURIComponent(sseToken)}`
      : '/api/events';
    const es = new EventSource(sseUrl, { withCredentials: true });
    const handleSync = () => {
      void refreshWorkspace(true);
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
      void refreshWorkspace(true);
    };
    const handleAlertSync = (evt: MessageEvent) => {
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
      void refreshWorkspace(true);
    };
    es.addEventListener('investment:voted', handleSync);
    es.addEventListener('investment:created', handleSync);
    es.addEventListener('investment:distributed', handleSync);
    es.addEventListener('investment:revealed', handleSync);
    es.addEventListener('loan:created', handleLoanCreated);
    es.addEventListener('loan:updated', handleSync);
    es.addEventListener('loan:reviewed', handleSync);
    es.addEventListener('loan:voted', handleSync);
    es.addEventListener('loan:vote_initiated', handleSync);
    es.addEventListener('loan:vote_revealed', handleSync);
    es.addEventListener('loan:guarantor', handleSync);
    es.addEventListener('poll:created', handleSync);
    es.addEventListener('poll:voted', handleSync);
    es.addEventListener('poll:revealed', handleSync);
    es.addEventListener('meeting:scheduled', handleAlertSync);
    es.addEventListener('meeting:updated', handleSync);
    es.addEventListener('profile:update_requested', handleSync);
    es.addEventListener('profile:update_reviewed', handleSync);
    es.addEventListener('contribution:submitted', handleSync);
    es.addEventListener('contribution:reviewed', handleSync);
    es.addEventListener('repayment:submitted', handleSync);
    es.addEventListener('repayment:verified', handleSync);
    es.addEventListener('repayment:overdue', handleSync);
    es.addEventListener('config:updated', handleSync);
    es.addEventListener('notification:created', handleAlertSync);
    es.addEventListener('email-queue:updated', handleSync);
    es.addEventListener('members:updated', handleSync);
    es.addEventListener('sheet:synced', handleSync);
    es.addEventListener('dm:received', handleAlertSync);
    es.addEventListener('dm:read', handleSync);
    es.addEventListener('dm:deleted', handleSync);

    const timer = window.setInterval(() => {
      void refreshWorkspace(true);
    }, 30000);

    return () => {
      es.close();
      window.clearInterval(timer);
    };
  }, [activeUserId, refreshWorkspace]);

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
    [visibleNav]
  );

  /** Gate the loan application modal on eligibility BEFORE open.
   *  Once open, the form submits without re-checking eligibility client-side. */
  const openLoanRequestModal = useCallback(async () => {
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
  }, [user, overview, loans, tDash]);

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
    [activeSection]
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
      const requested = params.get('page') as DashboardSectionId | null;
      const requestedMemberId = params.get('memberId');

      if (requested === 'member-profile' && requestedMemberId) {
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
      setActiveSection(valid);
      if (valid !== 'monthly-contribution') {
        setPreselectedBillingMonth(null);
      }
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [visibleNav]);

  async function handleSignOut() {
    drawerHistoryPushedRef.current = false;
    setMobileNavOpen(false);
    setMobileBrowseMode(false);
    await logout();
    router.replace('/');
  }

  const handleRefreshWithAutoSync = useCallback(async () => {
    const [, freshOverview] = await Promise.all([
      refreshUser(),
      refreshWorkspace(false),
    ]);
    router.refresh();
    await triggerAutoSheetSyncIfEnabled(freshOverview);
  }, [refreshUser, refreshWorkspace, router, triggerAutoSheetSyncIfEnabled]);

  const handleLoanCreatedOptimistic = useCallback((createdLoan: LoanRequest) => {
    setLoans((prev) => {
      const idx = prev.findIndex((l) => l.id === createdLoan.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = createdLoan;
        return next;
      }
      return [createdLoan, ...prev];
    });
    setOverview((prev) => {
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
  }, []);

  async function handleDismissLoanDecisionAlert(notificationId: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, readByRecipient: true } : n))
    );
    try {
      await api.markNotificationRead(notificationId);
      await refreshWorkspace(true);
    } catch {
      // ignore transient error
    }
  }

  async function handleOpenLoanFromDecisionAlert(notificationId: string) {
    navigateToPage('quard-hasan');
    await handleDismissLoanDecisionAlert(notificationId);
  }

  if (authChecking || !user) {
    return (
      <div className="h-dvh overflow-hidden w-full amanah-ambient-canvas p-2.5 lg:p-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-3">
        {/* Mobile clean session verification / redirect screen */}
        <div className="lg:hidden flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-4">
            <span
              aria-hidden="true"
              className="absolute -inset-2 rounded-3xl bg-emerald-500/15 animate-pulse"
            />
            <AmanahLogo variant="lockup" size="xl" className="relative shadow-lg" />
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {authChecking ? tCommon('verifyingSession') : tCommon('redirectingSignIn')}
          </p>
        </div>

        <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] shrink-0 px-4 items-center gap-2.5 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
          <AmanahLogo size="sm" decorative />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              {tCommon('brandName')}
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
              {authChecking ? tCommon('checkingSession') : tCommon('redirectingSignIn')}
            </div>
          </div>
        </div>
        <div className="hidden lg:flex lg:col-start-2 lg:row-start-1 h-[60px] shrink-0 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs px-4 sm:px-6 items-center justify-between gap-4">
          <Skeleton width={190} height={20} />
          <div className="flex items-center gap-2">
            <Skeleton width={76} height={32} borderRadius={8} />
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width={140} height={34} borderRadius={8} />
          </div>
        </div>
        <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col justify-between min-h-0 overflow-hidden bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs p-3.5">
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
        <main className="hidden lg:block lg:col-start-2 lg:row-start-2 flex-1 min-h-0 overflow-hidden bg-white/75 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs p-4 space-y-3">
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

  const activeNavMeta = visibleNav.find((n) => n.id === activeSection) || visibleNav[0];

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
        overview.treasury.pendingProfileRequestsCount
      );
    }
    if (sectionId === 'monthly-contribution' && isManager) {
      return overview.treasury.pendingContributionsCount;
    }
    if (sectionId === 'notification') {
      return overview.treasury.unreadNotificationsCount;
    }
    if (sectionId === 'community') {
      return unreadDmCount;
    }
    if (sectionId === 'member-registry' && isStaff) {
      return (
        (isAdmin ? overview.treasury.pendingMembersCount : 0) +
        overview.treasury.pendingProfileRequestsCount
      );
    }
    if (sectionId === 'email-queue' && isAdmin) {
      return overview.treasury.emailQueueAttentionCount || 0;
    }
    return 0;
  };

  function renderNavButton(item: NavItemConfig, isMobile = false) {
    const Icon = item.Icon;
    const active = activeSection === item.id;
    const count = pendingBadgeCount(item.id);
    const toneStyle = SIDEBAR_TONE_STYLES[SECTION_TONE_MAP[item.id] || 'emerald'];
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigateToPage(item.id, isMobile)}
        aria-current={active ? 'page' : undefined}
        className={`relative group w-full px-3 py-2 text-sm rounded-lg flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer whitespace-nowrap text-left ${active
          ? toneStyle.activeText
          : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
          }`}
      >
        {active && (
          <motion.span
            layoutId={isMobile ? 'sidebar-active-mobile' : 'sidebar-active-desktop'}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={`absolute inset-0 rounded-lg ${toneStyle.pillBg}`}
            aria-hidden="true"
          />
        )}
        <span className="relative z-10 flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 transition-colors ${active
              ? toneStyle.activeIcon
              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'
              }`}
            aria-hidden="true"
          />
          <span className="truncate">
            {getDashboardSectionLabel(item.id, user?.role, locale)}
          </span>
        </span>
        {count > 0 && (
          <span className="relative z-10 font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
            {count}
          </span>
        )}
      </button>
    );
  }

  function renderDashboardNavItems(isMobile = false) {
    const primaryItems = isAdmin ? ADMIN_PRIMARY_ITEMS : MEMBER_NAV_ITEMS;
    return (
      <div className="space-y-4">
        <div className="space-y-0.5">
          {primaryItems.map((item) => renderNavButton(item, isMobile))}
        </div>

        {isManager && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {tNav('groups.manager')}
            </div>
            <div className="space-y-0.5">
              {MANAGER_NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {tNav('groups.admin')}
            </div>
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
      active?: boolean;
      accent?: 'emerald' | 'amber';
      onClick: () => void;
    }>
  ) {
    return (
      <div className="space-y-1">
        <div className="px-3 pb-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                className={`w-full min-h-[44px] px-3 py-2 text-sm rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer text-left ${
                  item.active
                    ? `${toneStyle.pillBg} ${toneStyle.activeText}`
                    : 'text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4.5 h-4.5 shrink-0 ${
                      item.active ? toneStyle.activeIcon : 'text-slate-500 dark:text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                    {item.badge}
                  </span>
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
            Icon: History,
            active: activeSection === 'transaction-history',
            onClick: () => navigateToPage('transaction-history', true),
          },
          {
            id: 'statistics',
            label: tNav('statistics'),
            Icon: BarChart3,
            active: activeSection === 'statistics',
            onClick: () => navigateToPage('statistics', true),
          },
          {
            id: 'monthly-sheet',
            label: tNav('monthlySheet'),
            Icon: FileSpreadsheet,
            active: activeSection === 'monthly-sheet',
            onClick: () => navigateToPage('monthly-sheet', true),
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
            Icon: CreditCard,
            badge: isManager ? pendingBadgeCount('monthly-contribution') : 0,
            active: activeSection === 'monthly-contribution',
            onClick: () => navigateToPage('monthly-contribution', true),
          },
          {
            id: 'apply-qard-hasan',
            label: tNav('requestLoan'),
            Icon: FilePlus2,
            onClick: () => {
              closeMobileDrawer();
              void openLoanRequestModal();
            },
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
            Icon: Wallet,
            active: activeSection === 'my-amanah',
            onClick: () => navigateToPage('my-amanah', true),
          },
          {
            id: 'transaction-history',
            label: tNav('transactions'),
            Icon: History,
            active: activeSection === 'transaction-history',
            onClick: () => navigateToPage('transaction-history', true),
          },
          {
            id: 'monthly-sheet',
            label: tNav('monthlySheet'),
            Icon: FileSpreadsheet,
            active: activeSection === 'monthly-sheet',
            onClick: () => navigateToPage('monthly-sheet', true),
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
        Icon: MessageSquare,
        badge: pendingBadgeCount('community'),
        active: activeSection === 'community',
        onClick: () => navigateToPage('community', true),
      },
      {
        id: 'members',
        label: tNav('members'),
        Icon: Users,
        active: activeSection === 'members',
        onClick: () => navigateToPage('members', true),
      },
      {
        id: 'manager-cycle',
        label: tNav('managerCycle'),
        Icon: CalendarClock,
        active: activeSection === 'manager-cycle',
        accent: 'amber' as const,
        onClick: () => navigateToPage('manager-cycle', true),
      },
      ...(!isAdmin
        ? [
            {
              id: 'statistics',
              label: tNav('statistics'),
              Icon: BarChart3,
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
        Icon: Bell,
        badge: pendingBadgeCount('notification'),
        active: activeSection === 'notification',
        accent: 'amber' as const,
        onClick: () => navigateToPage('notification', true),
      },
      {
        id: 'my-profile',
        label: tNav('profile'),
        Icon: User,
        active: activeSection === 'my-profile',
        onClick: () => navigateToPage('my-profile', true),
      },
      {
        id: 'theme-toggle',
        label: darkMode ? tCommon('lightMode') : tCommon('darkMode'),
        Icon: darkMode ? Sun : Moon,
        onClick: () => toggleDarkMode(),
      },
    ];

    return (
      <div className="space-y-4">
        {renderMobileDrawerSection(tNav('groups.moneyTreasury'), moneyItems)}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
          {renderMobileDrawerSection(tNav('groups.cooperativeShura'), communityItems)}
        </div>
        {roleStaffItems.length > 0 && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
            {renderMobileDrawerSection(
              isAdmin ? tNav('groups.administration') : tNav('groups.managerOperations'),
              roleStaffItems
            )}
          </div>
        )}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
          {renderMobileDrawerSection(tNav('groups.accountApp'), accountItems)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden amanah-ambient-canvas text-slate-900 dark:text-slate-100 p-0 lg:p-3 flex flex-col lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-3">
      {/* GRID 1 */}
      <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] shrink-0 px-4 items-center justify-between bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <AmanahLogo size="sm" decorative />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              {tCommon('brandName')}
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
              {tCommon('dashboard')}
            </div>
          </div>
        </div>
      </div>

      {/* GRID 2 */}
      <header className="lg:col-start-2 lg:row-start-1 h-12 sm:h-14 lg:h-[60px] shrink-0 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md lg:rounded-2xl border-b lg:border border-slate-200/80 dark:border-slate-800/80 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 z-30 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <AmanahLogo size="xs" className="lg:hidden" decorative />
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 dark:text-slate-400 hidden lg:inline">
              {tCommon('brandName')}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">/</span>
            <h1 className="font-semibold text-slate-900 dark:text-white truncate">
              {getDashboardSectionLabel(activeSection, user.role, locale)}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            onClick={() => {
              if (isMobileViewport()) setMobileBrowseMode(true);
            }}
            title={tNav('publicWebsite')}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
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

          <HeaderNotificationBell
            user={user}
            overview={overview}
            contributions={contributions}
            loans={loans}
            notifications={notifications}
            onNavigate={(section) => navigateToPage(section, false)}
            onOpenManagerDeskTab={openManagerDeskTab}
            onOpenContributionMonth={(month) => {
              setPreselectedBillingMonth(month);
              navigateToPage('monthly-contribution', false, true, true);
            }}
            onMarkRead={handleDismissLoanDecisionAlert}
          />

          <button
            type="button"
            onClick={() => void handleRefreshWithAutoSync()}
            disabled={dataLoading}
            title={tCommon('refreshDashboardTitle')}
            aria-label={tCommon('refreshDashboard')}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-70"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${dataLoading ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden md:inline">{tCommon('refresh')}</span>
          </button>

          <PWAUpdateButton compact className="hidden sm:inline-flex" />

          <PWAInstallButton compact className="hidden lg:inline-flex" />

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-center cursor-pointer shrink-0"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <button
            type="button"
            onClick={openMobileDrawer}
            aria-label={tCommon('openNavigationMenu')}
            aria-expanded={mobileNavOpen}
            className="lg:hidden min-w-[44px] min-h-[44px] -mr-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* GRID 3 */}
      <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col min-h-0 h-full overflow-hidden bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <nav className="flex-1 min-h-0 px-2.5 py-3.5 overflow-y-auto scrollbar-subtle" aria-label={tNav('primaryNav')}>
          {renderDashboardNavItems(false)}
        </nav>

        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <button
            type="button"
            onClick={() => navigateToPage('my-profile', false)}
            className="w-full text-left min-w-0 rounded-lg p-1.5 -m-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {translateRoleLabel(user.role, locale)} · <span className="font-mono">{user.memberCode}</span> ·{' '}
              <span className="text-emerald-700 dark:text-emerald-400">
                {user.status === 'active' ? tCommon('verified') : tCommon('pending')}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full py-2 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tNav('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Side Navigation Drawer (slides in from the right side opposite the logo) */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={closeMobileDrawer}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              aria-label={tCommon('dashboardMenuAria')}
              className="relative z-10 w-72 max-w-[84vw] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
            >
              <div className="h-14 px-4 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AmanahLogo size="sm" decorative />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                      {tCommon('brandName')}
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
                      {tCommon('dashboard')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeMobileDrawer}
                  aria-label={tCommon('closeNavigationMenu')}
                  className="min-w-[44px] min-h-[44px] -mr-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Top Identity Card */}
              <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
                <button
                  type="button"
                  onClick={() => navigateToPage('my-profile', true)}
                  className="w-full min-h-[48px] text-left rounded-xl p-2 hover:bg-white/80 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {(user.name || 'AM')
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() || '')
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {translateRoleLabel(user.role, locale)} · <span className="font-mono">{user.memberCode}</span> ·{' '}
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {user.status === 'active' ? tCommon('verified') : tCommon('pending')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    {tCommon('language')}
                  </span>
                  <LanguageSwitcher variant="segmented" layoutId="mobile-drawer-lang-pill" />
                </div>
              </div>

              <nav
                className="flex-1 min-h-0 px-2.5 py-3.5 overflow-y-auto scrollbar-subtle"
                aria-label={tNav('primaryNav')}
              >
                {renderMobileDrawerNav()}
              </nav>

              <div className="p-3.5 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 shrink-0">
                <PWAUpdateButton fullWidth />
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/?browse=1"
                    onClick={() => {
                      drawerHistoryPushedRef.current = false;
                      setMobileBrowseMode(true);
                      setMobileNavOpen(false);
                    }}
                    className="min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Home className="w-4 h-4" />
                    <span>{tNav('home')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="min-h-[44px] py-2 px-3 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white transition-colors text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{tNav('signOut')}</span>
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
        className="lg:col-start-2 lg:row-start-2 min-w-0 min-h-0 w-full flex-1 flex flex-col lg:bg-white/80 lg:dark:bg-slate-900/75 lg:backdrop-blur-md lg:rounded-2xl lg:border lg:border-slate-200/80 lg:dark:border-slate-800/80 lg:shadow-2xs overflow-hidden"
      >
        <div
          ref={mainScrollRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-3 pb-6 sm:p-4 sm:pb-6 lg:p-5 lg:pb-5"
        >
          <div className="w-full space-y-3 sm:space-y-4">
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
                    className="group px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
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
                      loading={dataLoading && !overview}
                      pendingBadgeCount={pendingBadgeCount}
                      onNavigate={(sec) => navigateToPage(sec, false)}
                      onOpenManagerDeskTab={openManagerDeskTab}
                      onOpenLoanModal={() => void openLoanRequestModal()}
                      onViewMemberProfile={handleViewMemberProfile}
                      onRefresh={handleRefreshWithAutoSync}
                    />
                  </div>
                  <div className="hidden lg:block space-y-4">
                    <SectionEyebrow label={tNav('overview')} tone="emerald" />
                    <OverviewView
                      overview={overview}
                      contributions={contributions}
                      loans={loans}
                      user={user}
                      loading={dataLoading && !overview}
                      onNavigate={(sec) => navigateToPage(sec, false)}
                      onOpenManagerDeskTab={openManagerDeskTab}
                      onOpenLoanModal={() => void openLoanRequestModal()}
                      onRefresh={handleRefreshWithAutoSync}
                      onViewMemberProfile={handleViewMemberProfile}
                    />
                  </div>
                </section>
              )}

              {!isAdmin && activeSection === 'monthly-contribution' && (
                <section id="monthly-contribution" className="space-y-4">
                  <SectionEyebrow label={tNav('contributions')} tone="emerald" />
                  <ContributionsView
                    contributions={contributions}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && contributions.length === 0}
                    initialBillingMonth={preselectedBillingMonth}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'quard-hasan' && (
                <section id="quard-hasan" className="space-y-4">
                  <SectionEyebrow label={tNav('qardHasan')} tone="emerald" />
                  <LoansView
                    loans={loans}
                    eligibility={overview?.personal.eligibility || null}
                    config={overview?.config || null}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    user={user}
                    loading={dataLoading && loans.length === 0}
                    onOpenLoanModal={() => void openLoanRequestModal()}
                    onLoanCreated={handleLoanCreatedOptimistic}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'my-amanah' && (
                <section id="my-amanah" className="space-y-4">
                  <SectionEyebrow label={tNav('myAmanah')} tone="emerald" />
                  <MyAmanahView
                    overview={overview}
                    loans={loans}
                    user={user}
                    loading={dataLoading && !overview}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onOpenLoanModal={() => void openLoanRequestModal()}
                  />
                </section>
              )}

              {activeSection === 'my-profile' && (
                <section id="my-profile" className="space-y-4">
                  <SectionEyebrow label={tNav('profile')} tone="emerald" />
                  <MemberProfile user={user} onRefresh={handleRefreshWithAutoSync} />
                </section>
              )}

              {activeSection === 'notification' && (
                <section id="notification" className="space-y-4">
                  <SectionEyebrow label={tNav('notifications')} tone="amber" />
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
                  <SectionEyebrow label={tNav('statistics')} tone="emerald" />
                  <StatisticsView
                    overview={overview}
                    contributions={contributions}
                    loans={loans}
                    user={user}
                    loading={dataLoading && !overview}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                  />
                </section>
              )}

              {activeSection === 'ballot' && (
                <section id="ballot" className="space-y-4">
                  <SectionEyebrow label={tNav('voting')} tone="amber" />
                  <VotingView
                    loans={loans}
                    projects={halalProjects}
                    polls={polls}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && loans.length === 0 && halalProjects.length === 0}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'transaction-history' && (
                <section id="transaction-history" className="space-y-4">
                  <SectionEyebrow label={tNav('transactions')} tone="emerald" />
                  <TransactionHistory
                    contributions={contributions}
                    loans={loans}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && contributions.length === 0 && loans.length === 0}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'members' && (
                <section id="members" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('members')} tone="emerald" />
                  <ActiveMembersView
                    user={user}
                    config={overview?.config || null}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'monthly-sheet' && (
                <section id="monthly-sheet" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('monthlySheet')} tone="emerald" />
                  <MonthlySheetView
                    user={user}
                    config={overview?.config || null}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {activeSection === 'manager-cycle' && (
                <section id="manager-cycle" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('managerCycle')} tone="amber" />
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
                  <SectionEyebrow label={tNav('community')} tone="emerald" />
                  <CommunityView
                    user={user}
                    currency={overview?.config.currency}
                    onUnreadDmChange={setUnreadDmCount}
                    onRefreshWorkspace={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                    initialDmPeer={pendingDmPeer}
                    onConsumeInitialDmPeer={() => setPendingDmPeer(null)}
                  />
                </section>
              )}

              {activeSection === 'member-profile' && viewingMemberId && (
                <section id="member-profile" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('memberProfile')} tone="emerald" />
                  <MemberPublicProfileView
                    memberId={viewingMemberId}
                    currentUser={user}
                    onBack={() => navigateToPage(profileReturnSection, false)}
                    onOpenDirectMessage={(peer) => {
                      setPendingDmPeer(peer);
                      navigateToPage('community', false);
                    }}
                    onOpenOwnProfile={() => navigateToPage('my-profile', false)}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {isStaff && activeSection === 'manager-desk' && (
                <section id="manager-desk" className="space-y-4 pb-8">
                  <SectionEyebrow label={getDeskLabel(user.role, locale)} tone="amber" />
                  <ManagerDeskView
                    user={user}
                    config={overview?.config || null}
                    treasury={overview?.treasury || null}
                    loading={dataLoading && !overview}
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
                  <SectionEyebrow label={tNav('siteActivity')} tone="emerald" />
                  <AdminAuditLog user={user} />
                </section>
              )}

              {isAdmin && activeSection === 'system-audit-logs' && (
                <section id="system-audit-logs" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('auditLogs')} tone="emerald" />
                  <SystemAuditLogsView user={user} />
                </section>
              )}

              {isStaff && activeSection === 'member-registry' && (
                <section id="member-registry" className="space-y-4">
                  <SectionEyebrow label={getRegistryLabel(user.role, locale)} tone="emerald" />
                  <MemberRegistrySection
                    user={user}
                    config={overview?.config || null}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {isAdmin && activeSection === 'site-settings' && (
                <section id="site-settings" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('siteSettings')} tone="emerald" />
                  <AdminSiteSettingsView
                    overview={overview}
                    config={overview?.config || null}
                    user={user}
                    loans={loans}
                    projects={halalProjects}
                    loading={dataLoading && halalProjects.length === 0}
                    workspace={workspace}
                    connectingGoogle={connectingGoogle}
                    onConnectGoogle={handleConnectGoogle}
                    onDisconnectGoogle={handleDisconnectGoogle}
                    onRefresh={handleRefreshWithAutoSync}
                    onNavigateSection={(sectionId) => navigateToPage(sectionId, false)}
                  />
                </section>
              )}

              {isAdmin && activeSection === 'email-queue' && (
                <section id="email-queue" className="space-y-4 pb-8">
                  <SectionEyebrow label={tNav('emailQueue')} tone="amber" />
                  <AdminEmailQueueView onRefreshWorkspace={handleRefreshWithAutoSync} />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>

      {/* bKash-Style Sticky Mobile Footer Navigation Bar */}
      <nav
        aria-label={tNav('primaryNav')}
        className="lg:hidden shrink-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4 h-[58px] items-stretch">
          {(
            [
              {
                id: 'overview',
                label: tNav('overview'),
                Icon: Home,
                target: 'fund-overview' as DashboardSectionId,
                active: activeSection === 'fund-overview',
                badge: 0,
              },
              {
                id: 'my-amanah',
                label: isAdmin ? tNav('transactions') : tNav('myAmanah'),
                Icon: isAdmin ? History : Wallet,
                target: (isAdmin ? 'transaction-history' : 'my-amanah') as DashboardSectionId,
                active: isAdmin
                  ? activeSection === 'transaction-history'
                  : activeSection === 'my-amanah',
                badge: 0,
              },
              {
                id: 'community',
                label: tNav('community'),
                Icon: MessageSquare,
                target: 'community' as DashboardSectionId,
                active: activeSection === 'community',
                badge: pendingBadgeCount('community'),
              },
              {
                id: 'notification',
                label: tNav('notifications'),
                Icon: Bell,
                target: 'notification' as DashboardSectionId,
                active: activeSection === 'notification',
                badge: pendingBadgeCount('notification'),
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
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer active:scale-95 ${
                  tab.active
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.active && (
                  <span
                    className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-emerald-700 dark:bg-emerald-400"
                    aria-hidden="true"
                  />
                )}
                <span className="relative inline-flex items-center justify-center">
                  <Icon
                    className={`w-[21px] h-[21px] ${tab.active ? 'stroke-[2.2]' : 'stroke-[1.8]'}`}
                    aria-hidden="true"
                  />
                  {tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-600 text-white font-mono text-[9px] font-bold tabular-nums flex items-center justify-center shadow-xs">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] leading-tight tracking-tight whitespace-nowrap ${
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
                    setLoans((prev) =>
                      prev.map((l) =>
                        l.id === id
                          ? {
                              ...l,
                              status: 'rejected',
                              adminReviewNote:
                                'Withdrawn by borrower before manager vote initiation.',
                            }
                          : l
                      )
                    );
                    setOverview((prev) => {
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
                    });
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

function SectionEyebrow({
  label,
  tone = 'emerald',
}: {
  label: string;
  tone?: SectionAccentTone;
}) {
  const toneClass = SIDEBAR_TONE_STYLES[tone]?.eyebrowText || SIDEBAR_TONE_STYLES.emerald.eyebrowText;
  return (
    <div className="hidden lg:flex items-center gap-3">
      <h2 className={`text-xs font-semibold tracking-wide ${toneClass}`}>{label}</h2>
      <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800/80" aria-hidden="true" />
    </div>
  );
}
