'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  History,
  Home,
  LogOut,
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
import Skeleton from 'react-loading-skeleton';
import { AdminAuditLog } from './AdminAuditLog.tsx';
import { AdminSiteSettingsView } from './AdminSiteSettingsView.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { CommunityView } from './CommunityView.tsx';
import { ContributionsView } from './ContributionsView.tsx';
import { HeaderNotificationBell } from './HeaderNotificationBell.tsx';
import { LoansView } from './LoansView.tsx';
import { ManagerDeskView } from './ManagerDeskView.tsx';
import { MemberProfile } from './MemberProfile.tsx';
import { MemberPublicProfileView } from './MemberPublicProfileView.tsx';
import { MemberRegistrySection } from './MemberRegistrySection.tsx';
import { MyAmanahView } from './MyAmanahView.tsx';
import { NotificationsView } from './NotificationsView.tsx';
import { OverviewView } from './OverviewView.tsx';
import { RequestQardHasanModal } from './RequestQardHasanModal.tsx';
import { StatisticsView } from './StatisticsView.tsx';
import { SystemAuditLogsView } from './SystemAuditLogsView.tsx';
import { TransactionHistory } from './TransactionHistory.tsx';
import { VotingView } from './VotingView.tsx';
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
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney } from '../utils/format.ts';
import { getWorkspaceToken } from '../utils/googleWorkspace.ts';

interface NavItemConfig {
  id: DashboardSectionId;
  label: string;
  Icon: typeof BarChart3;
  group: 'member' | 'manager' | 'admin';
}

const MEMBER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Amanah Overview', Icon: BarChart3, group: 'member' },
  { id: 'monthly-contribution', label: 'Monthly Contribution', Icon: CreditCard, group: 'member' },
  { id: 'quard-hasan', label: 'Quard Hasan', Icon: HandCoins, group: 'member' },
  { id: 'my-amanah', label: 'My Amanah', Icon: Wallet, group: 'member' },
  { id: 'notification', label: 'Notification', Icon: Bell, group: 'member' },
  { id: 'ballot', label: 'Opinion Ballot', Icon: Vote, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: BarChart3, group: 'member' },
  { id: 'my-profile', label: 'My Profile', Icon: User, group: 'member' },
  { id: 'transaction-history', label: 'Transaction History', Icon: History, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessageSquare, group: 'member' },
];

const MANAGER_NAV_ITEMS: NavItemConfig[] = [
  { id: 'manager-desk', label: 'Manager Desk', Icon: ClipboardCheck, group: 'manager' },
  { id: 'member-registry', label: 'Member Updates & Directory', Icon: Users, group: 'manager' },
];

const ADMIN_PRIMARY_ITEMS: NavItemConfig[] = [
  { id: 'fund-overview', label: 'Amanah Overview', Icon: BarChart3, group: 'member' },
  { id: 'transaction-history', label: 'Transaction History', Icon: History, group: 'member' },
  { id: 'ballot', label: 'Opinion Ballot', Icon: Vote, group: 'member' },
  { id: 'statistics', label: 'Statistics', Icon: BarChart3, group: 'member' },
  { id: 'notification', label: 'Notification', Icon: Bell, group: 'member' },
  { id: 'community', label: 'Community', Icon: MessageSquare, group: 'member' },
  { id: 'my-profile', label: 'My Profile', Icon: User, group: 'member' },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'member-registry', label: 'User & Role Management', Icon: Users, group: 'admin' },
  { id: 'site-settings', label: 'Site Settings', Icon: Settings, group: 'admin' },
  { id: 'manager-desk', label: 'Governance Desk', Icon: ClipboardCheck, group: 'admin' },
  { id: 'site-activity', label: 'Site Activity', Icon: Activity, group: 'admin' },
  { id: 'system-audit-logs', label: 'System Audit Logs', Icon: Shield, group: 'admin' },
];

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
  const {
    user,
    authChecking,
    logout,
    darkMode,
    toggleDarkMode,
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const [dismissedLoanAlertIds, setDismissedLoanAlertIds] = useState<string[]>([]);
  const [liveLoanPulseId, setLiveLoanPulseId] = useState<string | null>(null);
  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const autoSyncBusyRef = useRef(false);
  const soundEnabledRef = useRef(false);
  soundEnabledRef.current = Boolean(user?.notificationPreferences?.soundEnabled);

  useEffect(() => {
    if (!authChecking && !user) {
      router.replace('/login');
    }
  }, [authChecking, user, router]);

  const refreshWorkspace = useCallback(async (silent = false): Promise<DashboardOverview | null> => {
    if (!silent) setDataLoading(true);
    try {
      const [ovRes, cRes, lRes, hRes, nRes, dmRes, pRes, mRes, pcrRes] = await Promise.all([
        api.getDashboard(),
        api.getContributions(),
        api.getLoans(),
        api.getHalalProjects(),
        api.getNotifications(),
        api.getPrivateThreads().catch(() => ({ threads: [], totalUnread: 0, directory: [] })),
        api.getPolls().catch(() => ({ polls: [] as DecisionPoll[] })),
        api.getMeetings().catch(() => ({ meetings: [] as CoopMeeting[] })),
        api
          .getProfileChangeRequests()
          .catch(() => ({ requests: [] as ProfileChangeRequest[] })),
      ]);
      setOverview(ovRes);
      setContributions(cRes.contributions);
      setLoans(lRes.loans);
      setHalalProjects(hRes.projects);
      setNotifications(nRes.notifications);
      setUnreadDmCount(dmRes.totalUnread);
      setPolls(pRes.polls);
      setMeetings(mRes.meetings);
      setProfileChangeRequests(pcrRes.requests);
      return ovRes;
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

  useEffect(() => {
    if (!user) return;
    void refreshWorkspace(false);

    const es = new EventSource('/api/events', { withCredentials: true });
    const handleSync = () => {
      void refreshWorkspace(true);
    };
    const handleLoanCreated = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data) as { loanId?: string; borrowerId?: string };
        if (data.loanId && data.borrowerId !== user.id) {
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
          if (!payload.senderId || payload.senderId !== user.id) {
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
  }, [user, refreshWorkspace]);

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
        if (url.searchParams.get('page') !== targetId || url.searchParams.has('memberId')) {
          url.searchParams.set('page', targetId);
          url.searchParams.delete('memberId');
          window.history.pushState({ page: targetId }, '', url);
        }
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [visibleNav]
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
          window.history.pushState({ page: 'member-profile', memberId }, '', url);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [activeSection]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('page') as DashboardSectionId | null;
      const requestedMemberId = params.get('memberId');

      if (requested === 'member-profile' && requestedMemberId) {
        setViewingMemberId(requestedMemberId);
        setActiveSection('member-profile');
        setPreselectedBillingMonth(null);
        return;
      }

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
    await logout();
    router.push('/');
  }

  async function handleRefreshWithAutoSync() {
    const freshOverview = await refreshWorkspace(true);
    await triggerAutoSheetSyncIfEnabled(freshOverview);
  }

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
      <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 space-y-6">
        <Skeleton height={44} width={280} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={110} />
          ))}
        </div>
        <Skeleton height={280} />
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
    return 0;
  };

  function renderNavButton(item: NavItemConfig, isMobile = false) {
    const Icon = item.Icon;
    const active = activeSection === item.id;
    const count = pendingBadgeCount(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigateToPage(item.id, isMobile)}
        aria-current={active ? 'page' : undefined}
        className={`group w-full px-3 py-2 text-sm flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer whitespace-nowrap text-left ${active
          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
          : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white'
          }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 transition-colors ${active
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'
              }`}
            aria-hidden="true"
          />
          <span
            className={`truncate ${active
              ? 'underline decoration-2 decoration-emerald-600 dark:decoration-emerald-400 underline-offset-4'
              : 'group-hover:underline group-hover:decoration-slate-300 dark:group-hover:decoration-slate-700 group-hover:underline-offset-4'
              }`}
          >
            {item.label}
          </span>
        </span>
        {count > 0 && (
          <span className="font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
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
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Manager
            </div>
            <div className="space-y-0.5">
              {MANAGER_NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Admin
            </div>
            <div className="space-y-0.5">
              {ADMIN_NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    /* Strict 4-Grid Dashboard Layout (Footer Strictly Hidden):
       Grid 1 (Top-Left, 260px x 64px): Amanah Brand Header
       Grid 2 (Top-Right, 1fr x 64px): Dashboard Nav
       Grid 3 (Bottom-Left, 260px x 1fr): Dashboard Sidebar
       Grid 4 (Bottom-Right, 1fr x 1fr): Multi-Page Dashboard Contents
    */
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[64px_minmax(0,1fr)]">
      {/* GRID 1 */}
      <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-16 w-[260px] px-6 items-center justify-between bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 ring-1 ring-emerald-500/25 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              Amanah
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Member Portal
            </div>
          </div>
        </div>
      </div>

      {/* GRID 2 */}
      <header className="lg:col-start-2 lg:row-start-1 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Amanah</span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
            <h1 className="font-semibold text-slate-900 dark:text-white truncate underline decoration-2 decoration-emerald-600 dark:decoration-emerald-400 underline-offset-4">
              {activeSection === 'member-profile'
                ? 'Member Profile'
                : activeNavMeta?.label || 'Fund Overview'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            title="View Public Website"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 whitespace-nowrap"
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>

          <HeaderNotificationBell
            user={user}
            overview={overview}
            contributions={contributions}
            loans={loans}
            notifications={notifications}
            onNavigate={(section) => navigateToPage(section, false)}
            onOpenContributionMonth={(month) => {
              setPreselectedBillingMonth(month);
              navigateToPage('monthly-contribution', false, true, true);
            }}
            onMarkRead={handleDismissLoanDecisionAlert}
          />

          <button
            type="button"
            onClick={() => void refreshWorkspace(false)}
            title="Refresh live balances"
            aria-label="Refresh live balances"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 transition-all duration-200 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {!isAdmin && (
            <button
              type="button"
              onClick={() => setLoanModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Request Qard Hasan
            </button>
          )}
        </div>
      </header>

      {/* GRID 3 */}
      <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:w-[260px] lg:flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]">
        <nav className="flex-1 px-3 py-5 overflow-y-auto scrollbar-subtle" aria-label="Primary">
          {renderDashboardNavItems(false)}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <button
            type="button"
            onClick={() => navigateToPage('my-profile', false)}
            className="w-full text-left min-w-0 rounded-lg p-1.5 -m-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
              {user.role} · <span className="font-mono">{user.memberCode}</span> ·{' '}
              <span className="text-emerald-700 dark:text-emerald-400">
                {user.status === 'active' ? 'Verified' : 'Pending'}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full py-2 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/50"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.18 }}
              className="relative w-64 max-w-full bg-white dark:bg-slate-900 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 z-10"
            >
              <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Amanah
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-3 overflow-y-auto">
                {renderDashboardNavItems(true)}
              </nav>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <Link
                  href="/"
                  onClick={() => setMobileNavOpen(false)}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Public Website</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full py-2.5 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* GRID 4: Multi-Page Dashboard Content */}
      <main className="lg:col-start-2 lg:row-start-2 min-w-0 w-full flex flex-col p-4 sm:p-5 lg:p-6">
        <div className="w-full flex-1 space-y-6">
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
                      className={`rounded-xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs transition-all duration-200 hover:shadow-md ${isApproved
                        ? 'bg-emerald-50/85 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-900/60'
                        : 'bg-red-50/85 dark:bg-red-950/35 border-red-200 dark:border-red-900/60'
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
                                ? 'Qard Hasan Loan Approved'
                                : 'Qard Hasan Loan Request Declined'}
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
                          <span>View Loan Status</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateToPage('notification', false)}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Inbox
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismissLoanDecisionAlert(alert.id)}
                          aria-label="Mark notification read and dismiss"
                          title="Mark read and dismiss"
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
                className="bg-amber-50/85 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-600/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Vote className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                      <span>
                        {unvotedLoanProposals.length === 1
                          ? 'Qard Hasan Proposal Open for Secret Opinion Ballot'
                          : `${unvotedLoanProposals.length} Qard Hasan Proposals Open for Secret Opinion Ballot`}
                      </span>
                      <span aria-hidden="true" className="text-amber-400 dark:text-amber-700">
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        Poll ongoing ({totalBallotsCast} ballot{totalBallotsCast === 1 ? '' : 's'}{' '}
                        cast)
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <strong className="font-semibold">{featuredLoan.borrowerName}</strong> (
                      <span className="font-mono">{featuredLoan.id}</span>) requested{' '}
                      <strong className="font-mono tabular-nums">
                        {formatMoney(featuredLoan.amount, ccy)}
                      </strong>{' '}
                      across {featuredLoan.installmentMonths} monthly installments — &ldquo;
                      {featuredLoan.purpose}&rdquo;. Cast your secret ballot; results remain hidden
                      until the Manager stops voting and reveals them.
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
                    <span>Open Ballot</span>
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
                    aria-label="Dismiss loan vote alert"
                    title="Dismiss alert for now"
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
              transition={{ duration: 0.16 }}
              className="w-full"
            >
              {activeSection === 'fund-overview' && (
                <section id="fund-overview" className="space-y-4">
                  <SectionEyebrow label="Fund Overview" />
                  <OverviewView
                    overview={overview}
                    contributions={contributions}
                    loans={loans}
                    user={user}
                    loading={dataLoading && !overview}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onOpenLoanModal={() => setLoanModalOpen(true)}
                    onRefresh={handleRefreshWithAutoSync}
                    onViewMemberProfile={handleViewMemberProfile}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'monthly-contribution' && (
                <section id="monthly-contribution" className="space-y-4">
                  <SectionEyebrow label="Monthly Contribution" />
                  <ContributionsView
                    contributions={contributions}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && contributions.length === 0}
                    initialBillingMonth={preselectedBillingMonth}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'quard-hasan' && (
                <section id="quard-hasan" className="space-y-4">
                  <SectionEyebrow label="Quard Hasan" />
                  <LoansView
                    loans={loans}
                    eligibility={overview?.personal.eligibility || null}
                    config={overview?.config || null}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    user={user}
                    loading={dataLoading && loans.length === 0}
                    onOpenLoanModal={() => setLoanModalOpen(true)}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {!isAdmin && activeSection === 'my-amanah' && (
                <section id="my-amanah" className="space-y-4">
                  <SectionEyebrow label="My Amanah" />
                  <MyAmanahView
                    overview={overview}
                    loans={loans}
                    user={user}
                    loading={dataLoading && !overview}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                    onOpenLoanModal={() => setLoanModalOpen(true)}
                  />
                </section>
              )}

              {activeSection === 'my-profile' && (
                <section id="my-profile" className="space-y-4">
                  <SectionEyebrow label="My Profile" />
                  <MemberProfile user={user} onRefresh={handleRefreshWithAutoSync} />
                </section>
              )}

              {activeSection === 'notification' && (
                <section id="notification" className="space-y-4">
                  <SectionEyebrow label="Notification" />
                  <NotificationsView
                    user={user}
                    workspace={workspace}
                    meetings={meetings}
                    connectingGoogle={connectingGoogle}
                    onConnectGoogle={handleConnectGoogle}
                    onDisconnectGoogle={handleDisconnectGoogle}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {activeSection === 'statistics' && (
                <section id="statistics" className="space-y-4">
                  <SectionEyebrow label="Statistics" />
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
                  <SectionEyebrow label="Opinion Ballot" />
                  <VotingView
                    loans={loans}
                    projects={halalProjects}
                    polls={polls}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && loans.length === 0 && halalProjects.length === 0}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {activeSection === 'transaction-history' && (
                <section id="transaction-history" className="space-y-4">
                  <SectionEyebrow label="Transaction History" />
                  <TransactionHistory
                    contributions={contributions}
                    loans={loans}
                    halalProjects={halalProjects}
                    config={overview?.config || null}
                    user={user}
                    loading={dataLoading && contributions.length === 0 && loans.length === 0}
                    onNavigate={(sec) => navigateToPage(sec, false)}
                  />
                </section>
              )}

              {activeSection === 'community' && (
                <section id="community" className="space-y-4 pb-8">
                  <SectionEyebrow label="Community" />
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
                  <SectionEyebrow label="Member Profile" />
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
                  <SectionEyebrow label={isAdmin ? 'Governance Desk' : 'Manager · Manager Desk'} />
                  <ManagerDeskView
                    user={user}
                    config={overview?.config || null}
                    availableLiquidity={overview?.treasury.availableLiquidity || 0}
                    contributions={contributions}
                    loans={loans}
                    halalProjects={halalProjects}
                    polls={polls}
                    meetings={meetings}
                    profileChangeRequests={profileChangeRequests}
                    onRefresh={handleRefreshWithAutoSync}
                  />
                </section>
              )}

              {isAdmin && activeSection === 'site-activity' && (
                <section id="site-activity" className="space-y-4">
                  <SectionEyebrow label="Admin · Site Activity" />
                  <AdminAuditLog user={user} />
                </section>
              )}

              {isAdmin && activeSection === 'system-audit-logs' && (
                <section id="system-audit-logs" className="space-y-4 pb-8">
                  <SectionEyebrow label="Admin · System Audit Logs" />
                  <SystemAuditLogsView user={user} />
                </section>
              )}

              {isStaff && activeSection === 'member-registry' && (
                <section id="member-registry" className="space-y-4">
                  <SectionEyebrow
                    label={
                      isAdmin
                        ? 'Admin · User & Role Management'
                        : 'Manager · Member Updates & Directory'
                    }
                  />
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
                  <SectionEyebrow label="Admin · Site Settings" />
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
                  />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {!isAdmin && (
        <RequestQardHasanModal
          open={loanModalOpen}
          onClose={() => setLoanModalOpen(false)}
          user={user}
          eligibility={overview?.personal.eligibility || null}
          config={overview?.config || null}
          availableLiquidity={overview?.treasury.availableLiquidity || 0}
          onSubmitted={async () => {
            await handleRefreshWithAutoSync();
          }}
        />
      )}
    </div>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
        {label}
      </h2>
      <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800/80" aria-hidden="true" />
    </div>
  );
}
