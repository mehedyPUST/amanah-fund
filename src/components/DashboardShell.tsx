'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Briefcase,
  CreditCard,
  Globe,
  HandCoins,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  Vote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { AdminReportsView } from './AdminReportsView.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { ContributionsView } from './ContributionsView.tsx';
import { HalalProjectsView } from './HalalProjectsView.tsx';
import { LoansView } from './LoansView.tsx';
import { NotificationsView } from './NotificationsView.tsx';
import { type NavTab, OverviewView } from './OverviewView.tsx';
import { VotingView } from './VotingView.tsx';
import type {
  Contribution,
  DashboardOverview,
  HalalProject,
  LoanRequest,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney } from '../utils/format.ts';
import { getWorkspaceToken } from '../utils/googleWorkspace.ts';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  Icon: typeof BarChart3;
  staffOnly?: boolean;
}> = [
  { id: 'overview', label: 'Overview', Icon: BarChart3 },
  { id: 'contributions', label: 'Contributions', Icon: CreditCard },
  { id: 'loans', label: 'Qard Hasan Loans', Icon: HandCoins },
  { id: 'voting', label: '2/3 Member Voting', Icon: Vote },
  { id: 'halal', label: 'Halal Investment', Icon: Briefcase },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'admin', label: 'Admin & Reports', Icon: Shield, staffOnly: true },
];

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

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [halalProjects, setHalalProjects] = useState<HalalProject[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dismissedLoanAlertIds, setDismissedLoanAlertIds] = useState<string[]>([]);
  const [liveLoanPulseId, setLiveLoanPulseId] = useState<string | null>(null);
  const autoSyncBusyRef = useRef(false);

  useEffect(() => {
    if (!authChecking && !user) {
      router.replace('/login');
    }
  }, [authChecking, user, router]);

  const refreshWorkspace = useCallback(async (silent = false) => {
    if (!silent) setDataLoading(true);
    try {
      const [ovRes, cRes, lRes, hRes] = await Promise.all([
        api.getDashboard(),
        api.getContributions(),
        api.getLoans(),
        api.getHalalProjects(),
      ]);
      setOverview(ovRes);
      setContributions(cRes.contributions);
      setLoans(lRes.loans);
      setHalalProjects(hRes.projects);
    } catch (err) {
      console.error('Workspace sync error:', err);
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
    es.addEventListener('investment:voted', handleSync);
    es.addEventListener('investment:created', handleSync);
    es.addEventListener('loan:created', handleLoanCreated);
    es.addEventListener('loan:voted', handleSync);
    es.addEventListener('config:updated', handleSync);
    es.addEventListener('notification:created', handleSync);
    es.addEventListener('members:updated', handleSync);
    es.addEventListener('sheet:synced', handleSync);

    const timer = window.setInterval(() => {
      void refreshWorkspace(true);
    }, 30000);

    return () => {
      es.close();
      window.clearInterval(timer);
    };
  }, [user, refreshWorkspace]);

  async function handleSignOut() {
    await logout();
    router.push('/');
  }

  async function handleRefreshWithAutoSync() {
    await refreshWorkspace(true);
    await triggerAutoSheetSyncIfEnabled(overview);
  }

  if (authChecking || !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-10 max-w-6xl mx-auto space-y-6">
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

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.staffOnly || user.role === 'admin' || user.role === 'manager'
  );
  const activeNavMeta = visibleNav.find((n) => n.id === activeTab) || visibleNav[0];

  const pendingBadgeCount = (tabId: NavTab): number => {
    if (!overview) return 0;
    const openPlacementVotes = halalProjects.filter((p) => p.votingStatus === 'open').length;
    if (tabId === 'voting') {
      return (
        overview.treasury.pendingVotesCount +
        overview.treasury.pendingDisbursementsCount +
        openPlacementVotes
      );
    }
    if (tabId === 'halal') {
      return openPlacementVotes;
    }
    if (tabId === 'contributions' && (user.role === 'admin' || user.role === 'manager')) {
      return overview.treasury.pendingContributionsCount;
    }
    if (tabId === 'notifications') {
      return overview.treasury.unreadNotificationsCount;
    }
    if (tabId === 'admin' && user.role === 'admin') {
      return overview.treasury.pendingMembersCount;
    }
    return 0;
  };

  function renderDashboardNavItems(isMobile = false) {
    return visibleNav.map((item) => {
      const Icon = item.Icon;
      const active = activeTab === item.id;
      const count = pendingBadgeCount(item.id);
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setActiveTab(item.id);
            if (isMobile) setMobileNavOpen(false);
          }}
          className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between gap-3 transition-colors cursor-pointer whitespace-nowrap ${
            active
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </span>
          {count > 0 && (
            <span className="font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
              {count}
            </span>
          )}
        </button>
      );
    });
  }

  return (
    /* Strict 4-Grid Dashboard Layout (Footer Strictly Hidden):
       Grid 1 (Top-Left, 260px x 64px): Members Dashboard Header
       Grid 2 (Top-Right, 1fr x 64px): Dashboard Nav
       Grid 3 (Bottom-Left, 260px x 1fr): Dashboard Sidebar
       Grid 4 (Bottom-Right, 1fr x 1fr): Dashboard Contents
    */
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[64px_minmax(0,1fr)]">
      {/* GRID 1: Members Dashboard (height == Grid 2 height [64px], width == Grid 3 width [260px]) */}
      <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-16 w-[260px] px-6 items-center justify-between bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              Members Dashboard
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Amanah Co-op
            </div>
          </div>
        </div>
      </div>

      {/* GRID 2: Dashboard Nav (height == Grid 1 height [64px], width == Grid 4 width [1fr]) */}
      <header className="lg:col-start-2 lg:row-start-1 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Treasury</span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
            <h1 className="font-semibold text-slate-900 dark:text-white truncate">
              {activeNavMeta?.label || 'Overview'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            title="View Public Website"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Public Site</span>
          </Link>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            title="Email & Treasury Notifications"
            aria-label="Email & Treasury Notifications"
            className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {(overview?.treasury.unreadNotificationsCount || 0) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white font-mono text-[10px] font-semibold flex items-center justify-center">
                {overview?.treasury.unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void refreshWorkspace(false)}
            title="Refresh live balances"
            aria-label="Refresh live balances"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('loans')}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Request Qard Hasan
          </button>
        </div>
      </header>

      {/* GRID 3: Dashboard Sidebar (width == Grid 1 width [260px]) */}
      <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:w-[260px] lg:flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]">
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary">
          {renderDashboardNavItems(false)}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
              {user.role} · <span className="font-mono">{user.memberCode}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer for < lg screens */}
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
              <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Members Dashboard
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

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {renderDashboardNavItems(true)}
              </nav>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <Link
                  href="/"
                  onClick={() => setMobileNavOpen(false)}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-2"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public Website</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* GRID 4: Dashboard Contents (width == Grid 2 width [1fr], NO FOOTER) */}
      <main className="lg:col-start-2 lg:row-start-2 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {(() => {
            const unvotedLoanProposals = loans.filter(
              (l) =>
                l.status === 'pending_vote' &&
                !l.votes.some((v) => v.voterId === user.id) &&
                !dismissedLoanAlertIds.includes(l.id)
            );
            if (activeTab === 'voting' || unvotedLoanProposals.length === 0) {
              return null;
            }
            const featuredLoan =
              unvotedLoanProposals.find((l) => l.id === liveLoanPulseId) || unvotedLoanProposals[0];
            const approvalsCount = featuredLoan.votes.filter(
              (v) => v.decision === 'approve'
            ).length;
            const ccy = overview?.config.currency || 'BDT';

            return (
              <motion.section
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-600/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Vote className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                      <span>
                        {unvotedLoanProposals.length === 1
                          ? 'New Qard Hasan Loan Proposal Requires Your 2/3 Majority Vote'
                          : `${unvotedLoanProposals.length} Qard Hasan Proposals Require Your 2/3 Majority Vote`}
                      </span>
                      <span aria-hidden="true" className="text-amber-400 dark:text-amber-700">
                        ·
                      </span>
                      <span className="font-mono tabular-nums">
                        {approvalsCount}/{featuredLoan.requiredApprovals} approvals
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <strong className="font-semibold">{featuredLoan.borrowerName}</strong> (
                      <span className="font-mono">{featuredLoan.id}</span>) requested{' '}
                      <strong className="font-mono tabular-nums">
                        {formatMoney(featuredLoan.amount, ccy)}
                      </strong>{' '}
                      across {featuredLoan.installmentMonths} monthly installments — &ldquo;
                      {featuredLoan.purpose}&rdquo;. Active member ballots are needed to reach the
                      2/3 quorum ({featuredLoan.requiredApprovals} of{' '}
                      {featuredLoan.totalEligibleVoters} members).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('voting');
                      setLiveLoanPulseId(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <span>Cast 2/3 Vote</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
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
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'overview' && (
                <OverviewView
                  overview={overview}
                  user={user}
                  loading={dataLoading && !overview}
                  onNavigate={setActiveTab}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'contributions' && (
                <ContributionsView
                  contributions={contributions}
                  config={overview?.config || null}
                  user={user}
                  loading={dataLoading && contributions.length === 0}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'loans' && (
                <LoansView
                  loans={loans}
                  eligibility={overview?.personal.eligibility || null}
                  config={overview?.config || null}
                  availableLiquidity={overview?.treasury.availableLiquidity || 0}
                  user={user}
                  loading={dataLoading && loans.length === 0}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'voting' && (
                <VotingView
                  loans={loans}
                  projects={halalProjects}
                  config={overview?.config || null}
                  user={user}
                  loading={dataLoading && loans.length === 0 && halalProjects.length === 0}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'halal' && (
                <HalalProjectsView
                  projects={halalProjects}
                  overview={overview}
                  user={user}
                  loading={dataLoading && halalProjects.length === 0}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'notifications' && (
                <NotificationsView
                  user={user}
                  workspace={workspace}
                  connectingGoogle={connectingGoogle}
                  onConnectGoogle={handleConnectGoogle}
                  onDisconnectGoogle={handleDisconnectGoogle}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
              {activeTab === 'admin' && (
                <AdminReportsView
                  config={overview?.config || null}
                  user={user}
                  contributions={contributions}
                  loans={loans}
                  monthlySeries={overview?.monthlySeries || []}
                  workspace={workspace}
                  connectingGoogle={connectingGoogle}
                  onConnectGoogle={handleConnectGoogle}
                  onDisconnectGoogle={handleDisconnectGoogle}
                  onRefresh={handleRefreshWithAutoSync}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
