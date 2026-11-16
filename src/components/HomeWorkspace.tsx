'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Compass,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { About } from './About.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { Hero, HeroLifecycle } from './Hero.tsx';
import { HomeCommunitySection } from './HomeCommunitySection.tsx';
import { HomeNoticeBoardSection } from './HomeNoticeBoardSection.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { Rules } from './Rules.tsx';

type HomeSectionId =
  | 'overview'
  | 'notice-board'
  | 'community'
  | 'lifecycle'
  | 'architecture'
  | 'how-it-works'
  | 'governance-charter';

interface HomeNavItem {
  id: HomeSectionId;
  label: string;
  Icon: LucideIcon;
  tone: 'emerald' | 'teal' | 'amber' | 'indigo';
}

const TONE_CLASSES: Record<
  HomeNavItem['tone'],
  { activeText: string; pillBg: string; activeIcon: string }
> = {
  emerald: {
    activeText: 'text-emerald-700 dark:text-emerald-400 font-semibold',
    pillBg: 'bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60',
    activeIcon: 'text-emerald-600 dark:text-emerald-400',
  },
  teal: {
    activeText: 'text-teal-700 dark:text-teal-400 font-semibold',
    pillBg: 'bg-teal-50/90 dark:bg-teal-950/50 border border-teal-200/70 dark:border-teal-800/60',
    activeIcon: 'text-teal-600 dark:text-teal-400',
  },
  amber: {
    activeText: 'text-amber-700 dark:text-amber-400 font-semibold',
    pillBg: 'bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60',
    activeIcon: 'text-amber-600 dark:text-amber-400',
  },
  indigo: {
    activeText: 'text-indigo-700 dark:text-indigo-400 font-semibold',
    pillBg: 'bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/60',
    activeIcon: 'text-indigo-600 dark:text-indigo-400',
  },
};

export function HomeWorkspace() {
  const { user, authChecking, logout } = useCoopSession();
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');
  const [activeSection, setActiveSection] = useState<HomeSectionId>('overview');
  const [signingOut, setSigningOut] = useState(false);
  const manualLockUntilRef = useRef(0);

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
      { id: 'lifecycle', label: 'Capital Lifecycle', Icon: TrendingUp, tone: 'amber' },
      { id: 'architecture', label: 'Architecture', Icon: ShieldCheck, tone: 'indigo' },
      { id: 'how-it-works', label: 'How It Works', Icon: HelpCircle, tone: 'teal' },
      { id: 'governance-charter', label: 'Charter (Art. 1–25)', Icon: ScrollText, tone: 'amber' }
    );
    return items;
  }, [isActiveMember]);

  const scrollToSection = useCallback((sectionId: HomeSectionId) => {
    setActiveSection(sectionId);
    manualLockUntilRef.current = Date.now() + 750;
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  }, []);

  useEffect(() => {
    let rafId = 0;
    const ids = navItems.map((n) => n.id);

    const updateActive = () => {
      if (Date.now() < manualLockUntilRef.current) return;

      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
      if (atBottom) {
        setActiveSection('governance-charter');
        return;
      }

      const thresholdY = 128;
      let current: HomeSectionId = 'overview';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= thresholdY) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    const onScroll = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateActive);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateActive();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [navItems]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:gap-2.5 items-start">
      {/* Left Sticky Sidebar aligned with Dashboard Grid 3 */}
      <aside
        aria-label="Homepage sections"
        className="hidden lg:flex lg:flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs lg:sticky lg:top-[80px] lg:h-[calc(100vh-90px)]"
      >
        <nav className="flex-1 px-2.5 py-3.5 overflow-y-auto scrollbar-subtle space-y-4">
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
                    onClick={() => scrollToSection(item.id)}
                    aria-current={active ? 'location' : undefined}
                    className={`relative group w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 transition-colors duration-150 cursor-pointer whitespace-nowrap text-left ${
                      active
                        ? toneStyle.activeText
                        : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="home-sidebar-active-bg"
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
              Pages
            </div>
            <div className="space-y-0.5">
              <Link
                href="/about"
                className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <span className="truncate">Security &amp; About</span>
              </Link>
              <Link
                href="/rules"
                className="w-full px-3 py-2 text-sm rounded-lg flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <ScrollText className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <span className="truncate">Full Constitution</span>
              </Link>
            </div>
          </div>
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
              <Link
                href="/dashboard"
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="w-full py-2 px-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  Member Portal
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
              <Link
                href="/login"
                className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Grid Column matching Dashboard Grid 4 */}
      <div className="min-w-0 space-y-2.5">
        <section id="overview" className="scroll-mt-20">
          <Hero includeLifecycle={false} embedded />
        </section>

        <HomeNoticeBoardSection embedded />

        <section id="community" className="scroll-mt-20">
          <HomeCommunitySection embedded />
        </section>

        <HeroLifecycle embedded />

        <section id="architecture" className="scroll-mt-20">
          <About embedded />
        </section>

        <section id="how-it-works" className="scroll-mt-20">
          <HowItWorks embedded />
        </section>

        <section id="governance-charter" className="scroll-mt-20">
          <Rules embedded />
        </section>
      </div>
    </div>
  );
}
