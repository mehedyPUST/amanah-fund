'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Compass,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  ScrollText,
  Shield,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { About } from './About.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { Footer } from './Footer.tsx';
import { Hero, HeroLifecycle } from './Hero.tsx';
import { HomeCommunitySection } from './HomeCommunitySection.tsx';
import { HomeNoticeBoardSection } from './HomeNoticeBoardSection.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { Rules } from './Rules.tsx';

export type HomeSectionId =
  | 'overview'
  | 'notice-board'
  | 'community'
  | 'how-it-works'
  | 'architecture'
  | 'governance-charter';

interface HomeNavItem {
  id: HomeSectionId;
  label: string;
  Icon: LucideIcon;
  tone: 'emerald' | 'teal' | 'amber' | 'indigo';
}

const TONE_CLASSES: Record<
  HomeNavItem['tone'],
  { activeText: string; pillBg: string; activeIcon: string; underline: string }
> = {
  emerald: {
    activeText: 'text-emerald-800 dark:text-emerald-300 font-semibold',
    pillBg: 'bg-emerald-50/90 dark:bg-emerald-950/45 border border-emerald-200/70 dark:border-emerald-900/60',
    activeIcon: 'text-emerald-600 dark:text-emerald-400',
    underline: 'decoration-emerald-500',
  },
  teal: {
    activeText: 'text-teal-800 dark:text-teal-300 font-semibold',
    pillBg: 'bg-teal-50/90 dark:bg-teal-950/45 border border-teal-200/70 dark:border-teal-900/60',
    activeIcon: 'text-teal-600 dark:text-teal-400',
    underline: 'decoration-teal-500',
  },
  amber: {
    activeText: 'text-amber-800 dark:text-amber-300 font-semibold',
    pillBg: 'bg-amber-50/90 dark:bg-amber-950/45 border border-amber-200/70 dark:border-amber-900/60',
    activeIcon: 'text-amber-600 dark:text-amber-400',
    underline: 'decoration-amber-500',
  },
  indigo: {
    activeText: 'text-indigo-800 dark:text-indigo-300 font-semibold',
    pillBg: 'bg-indigo-50/90 dark:bg-indigo-950/45 border border-indigo-200/70 dark:border-indigo-900/60',
    activeIcon: 'text-indigo-600 dark:text-indigo-400',
    underline: 'decoration-indigo-500',
  },
};

function normalizeHashToSection(hash: string, isActiveMember: boolean): HomeSectionId | null {
  const clean = hash.replace(/^#/, '');
  if (clean === 'overview') return 'overview';
  if (clean === 'notice-board' && isActiveMember) return 'notice-board';
  if (clean === 'community') return 'community';
  if (clean === 'how-it-works') return 'how-it-works';
  if (clean === 'architecture' || clean === 'lifecycle') return 'architecture';
  if (clean === 'governance-charter' || clean === 'charter') return 'governance-charter';
  return null;
}

export function HomeWorkspace() {
  const router = useRouter();
  const { user, authChecking, logout, darkMode, toggleDarkMode } = useCoopSession();
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');

  const [activeSection, setActiveSection] = useState<HomeSectionId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const navItems: HomeNavItem[] = useMemo(() => {
    const items: HomeNavItem[] = [
      { id: 'overview', label: 'Overview', Icon: Compass, tone: 'emerald' },
    ];
    if (isActiveMember) {
      items.push({
        id: 'notice-board',
        label: 'Notice Board',
        Icon: Megaphone,
        tone: 'amber',
      });
    }
    items.push(
      { id: 'community', label: 'Community Hub', Icon: MessageSquare, tone: 'teal' },
      { id: 'how-it-works', label: 'How It Works', Icon: HelpCircle, tone: 'teal' },
      { id: 'architecture', label: 'Architecture', Icon: ShieldCheck, tone: 'indigo' },
      { id: 'governance-charter', label: 'Charter (Art. 1–25)', Icon: ScrollText, tone: 'amber' }
    );
    return items;
  }, [isActiveMember]);

  const navigateToSection = useCallback((sectionId: HomeSectionId, closeMobile = false) => {
    setActiveSection(sectionId);
    if (closeMobile) {
      setMobileNavOpen(false);
    }
    if (typeof window !== 'undefined') {
      const nextHash = sectionId === 'overview' ? '' : `#${sectionId}`;
      window.history.replaceState(null, '', nextHash || '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const parsed = normalizeHashToSection(window.location.hash, isActiveMember);
      if (parsed) {
        setActiveSection(parsed);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [isActiveMember]);

  useEffect(() => {
    if (activeSection === 'notice-board' && !isActiveMember && !authChecking) {
      setActiveSection('overview');
    }
  }, [activeSection, isActiveMember, authChecking]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      setMobileNavOpen(false);
      router.push('/');
    } finally {
      setSigningOut(false);
    }
  }

  const activeMeta = navItems.find((n) => n.id === activeSection) || navItems[0];
  const activeTone = TONE_CLASSES[activeMeta.tone];

  function renderNavList(isMobile = false) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Navigation
          </div>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.Icon;
              const active = activeSection === item.id;
              const toneStyle = TONE_CLASSES[item.tone];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToSection(item.id, isMobile)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative group w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 transition-colors duration-150 cursor-pointer whitespace-nowrap text-left ${
                    active
                      ? toneStyle.activeText
                      : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={isMobile ? 'home-sidebar-mobile' : 'home-sidebar-desktop'}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className={`absolute inset-0 rounded-lg ${toneStyle.pillBg}`}
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 shrink-0 transition-colors ${
                      active
                        ? toneStyle.activeIcon
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Portal Pages
          </div>
          <div className="space-y-0.5">
            {!authChecking && user ? (
              <Link
                href="/dashboard"
                onClick={() => isMobile && setMobileNavOpen(false)}
                className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400 font-medium hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Members Dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => isMobile && setMobileNavOpen(false)}
                  className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span className="truncate">Member Sign In</span>
                </Link>
                <Link
                  href="/signup"
                  onClick={() => isMobile && setMobileNavOpen(false)}
                  className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <ArrowRight className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span className="truncate">Join Amanah</span>
                </Link>
              </>
            )}
            <Link
              href="/about"
              onClick={() => isMobile && setMobileNavOpen(false)}
              className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <span className="truncate">About &amp; Security</span>
            </Link>
            <Link
              href="/rules"
              onClick={() => isMobile && setMobileNavOpen(false)}
              className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
            >
              <ScrollText className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <span className="truncate">Constitution Page</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    /* Exact 4-Grid Layout matching DashboardShell:
       Grid 1 (Top-Left, 252px x 60px): Brand Header
       Grid 2 (Top-Right, 1fr x 60px): Top Bar
       Grid 3 (Bottom-Left, 252px x 1fr): Sticky Sidebar
       Grid 4 (Bottom-Right, 1fr): Active View Canvas + Footer
    */
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-2 lg:p-2.5 flex flex-col gap-2 lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-2.5">
      {/* GRID 1: Top-Left Brand Card (252px x 60px) */}
      <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] px-4 items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs sticky top-2.5 z-30">
        <button
          type="button"
          onClick={() => navigateToSection('overview')}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 ring-1 ring-emerald-500/25 text-white flex items-center justify-center shrink-0 shadow-xs transition-transform duration-200 group-hover:scale-105">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              Amanah
            </div>
            <div className="text-[11px] text-teal-700 dark:text-teal-400 font-medium truncate">
              Cooperative Fund
            </div>
          </div>
        </button>
      </div>

      {/* GRID 2: Top-Right Header Bar (1fr x 60px) */}
      <header className="lg:col-start-2 lg:row-start-1 h-[60px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-2 lg:top-2.5 z-30 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              Amanah
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
            <h1
              className={`font-semibold text-slate-900 dark:text-white truncate underline decoration-2 ${activeTone.underline} underline-offset-4`}
            >
              {activeMeta.label}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact className="hidden sm:inline-flex" />

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 transition-all duration-200 cursor-pointer"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            )}
          </button>

          {!authChecking && user ? (
            <>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white text-xs font-medium transition-all duration-200 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <span>Join Amanah</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </>
          )}
        </div>
      </header>

      {/* GRID 3: Bottom-Left Sticky Sidebar (252px) */}
      <aside
        aria-label="Homepage sections"
        className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs lg:sticky lg:top-[80px] lg:h-[calc(100vh-90px)]"
      >
        <nav className="flex-1 px-2.5 py-3.5 overflow-y-auto scrollbar-subtle" aria-label="Primary">
          {renderNavList(false)}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          {!authChecking && user ? (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
                  {user.role} · <span className="font-mono">{user.memberCode}</span> ·{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {user.status === 'active' ? 'Verified' : 'Pending'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="w-full py-2 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  VISION-36 Treasury
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  0% Qard Hasan · 2/3 Quorum
                </div>
              </div>
              <Link
                href="/signup"
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs transition-all"
              >
                <span>Join Amanah</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
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
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center">
                    <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Amanah
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-3 overflow-y-auto">{renderNavList(true)}</nav>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                {!authChecking && user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileNavOpen(false)}
                      className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" />
                      <span>Open Dashboard</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      disabled={signingOut}
                      className="w-full py-2 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
                    </button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      onClick={() => setMobileNavOpen(false)}
                      className="text-center py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setMobileNavOpen(false)}
                      className="text-center py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-xs font-medium"
                    >
                      Join Amanah
                    </Link>
                  </div>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* GRID 4: Main Content Workspace + Compact Footer */}
      <main className="lg:col-start-2 lg:row-start-2 min-w-0 flex flex-col justify-between gap-2.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            {activeSection === 'overview' && (
              <Hero
                includeLifecycle={false}
                embedded
                onNavigateSection={(target) => navigateToSection(target)}
              />
            )}

            {activeSection === 'notice-board' && <HomeNoticeBoardSection embedded />}

            {activeSection === 'community' && <HomeCommunitySection embedded />}

            {activeSection === 'how-it-works' && <HowItWorks embedded />}

            {activeSection === 'architecture' && (
              <div className="space-y-2.5">
                <About embedded />
                <HeroLifecycle embedded />
              </div>
            )}

            {activeSection === 'governance-charter' && <Rules embedded />}
          </motion.div>
        </AnimatePresence>

        <Footer />
      </main>
    </div>
  );
}
