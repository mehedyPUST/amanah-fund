'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, LogOut, Menu, Moon, Shield, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

type HomeSectionId =
  | 'overview'
  | 'architecture'
  | 'how-it-works'
  | 'governance-charter'
  | 'community';

interface PublicNavItem {
  id?: HomeSectionId;
  href: string;
  altPath?: string;
  label: string;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking, logout, darkMode, toggleDarkMode } = useCoopSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activeHomeSection, setActiveHomeSection] = useState<HomeSectionId>('overview');
  const manualScrollLockUntilRef = useRef(0);

  const isAuthenticated = !authChecking && Boolean(user);

  const publicNavLinks: PublicNavItem[] = [
    { id: 'overview', href: '/#overview', label: 'Overview' },
    { id: 'architecture', href: '/#architecture', altPath: '/about', label: 'Architecture' },
    { id: 'how-it-works', href: '/#how-it-works', label: 'How It Works' },
    {
      id: 'governance-charter',
      href: '/#governance-charter',
      altPath: '/rules',
      label: 'Charter',
    },
    { id: 'community', href: '/#community', label: 'Community' },
  ];

  const navLinks: PublicNavItem[] = isAuthenticated
    ? [...publicNavLinks, { href: '/dashboard', label: 'Member Portal' }]
    : publicNavLinks;

  const scrollToHomeSection = useCallback((sectionId: HomeSectionId, closeDrawer = false) => {
    setActiveHomeSection(sectionId);
    manualScrollLockUntilRef.current = Date.now() + 750;
    if (closeDrawer) {
      setMobileOpen(false);
    }
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  }, []);

  useEffect(() => {
    if (pathname !== '/') return;
    const hash = window.location.hash.replace('#', '') as HomeSectionId;
    if (
      hash === 'overview' ||
      hash === 'architecture' ||
      hash === 'how-it-works' ||
      hash === 'governance-charter' ||
      hash === 'community'
    ) {
      const timer = window.setTimeout(() => {
        scrollToHomeSection(hash, false);
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [pathname, scrollToHomeSection]);

  useEffect(() => {
    if (pathname !== '/') return;
    const sectionIds: HomeSectionId[] = [
      'overview',
      'architecture',
      'how-it-works',
      'governance-charter',
      'community',
    ];
    let rafId = 0;

    const updateActiveOnScroll = () => {
      if (Date.now() < manualScrollLockUntilRef.current) return;

      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
      if (atBottom) {
        setActiveHomeSection('community');
        return;
      }

      const thresholdY = 128;
      let currentId: HomeSectionId = 'overview';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= thresholdY) {
          currentId = id;
        }
      }
      setActiveHomeSection(currentId);
    };

    const onScroll = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateActiveOnScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateActiveOnScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [pathname]);

  function isLinkActive(link: PublicNavItem): boolean {
    if (pathname === '/') {
      return link.id === activeHomeSection;
    }
    if (link.altPath && pathname === link.altPath) {
      return true;
    }
    return pathname === link.href;
  }

  function handleNavClick(
    e: MouseEvent<HTMLAnchorElement>,
    link: PublicNavItem,
    isMobile = false
  ) {
    if (link.id && pathname === '/') {
      e.preventDefault();
      scrollToHomeSection(link.id, isMobile);
    } else if (isMobile) {
      setMobileOpen(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      setMobileOpen(false);
      router.push('/');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
        <Link
          href="/#overview"
          onClick={(e) => {
            if (pathname === '/') {
              e.preventDefault();
              scrollToHomeSection('overview', true);
            }
          }}
          className="flex items-center gap-2.5 shrink-0 group"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 ring-1 ring-emerald-500/30 text-white flex items-center justify-center shrink-0 shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:shadow-md">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
            Amanah
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1.5" aria-label="Primary navigation">
          {navLinks.map((link) => {
            const active = isLinkActive(link);
            const isPortal = link.href === '/dashboard';
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link, false)}
                className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isPortal
                      ? 'text-teal-700 dark:text-teal-300 hover:bg-teal-50/80 dark:hover:bg-teal-950/40'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="public-navbar-active-bg"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-emerald-50/95 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60 -z-10"
                    aria-hidden="true"
                  />
                )}
                <span>{link.label}</span>
                {active && (
                  <motion.span
                    layoutId="public-navbar-active-line"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-x-3 -bottom-[1px] h-0.5 bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-400 rounded-full"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 text-xs font-medium transition-all duration-200 cursor-pointer whitespace-nowrap"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span className="hidden lg:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                <span className="hidden lg:inline">Dark</span>
              </>
            )}
          </button>

          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white text-xs font-medium transition-all duration-200 hover:shadow-sm active:scale-[0.98] whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-200 hover:shadow-xs whitespace-nowrap"
              >
                Member Sign In
              </Link>
              <Link
                href="/signup"
                title="Apply for Membership"
                className="group hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
              >
                <span>Apply Now</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="md:hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-2 shadow-lg"
          >
            {navLinks.map((link) => {
              const active = isLinkActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link, true)}
                  className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={toggleDarkMode}
              className="w-full py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center justify-between transition-colors cursor-pointer"
            >
              <span>Appearance</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                {darkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                    <span>Dark Mode</span>
                  </>
                )}
              </span>
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="w-full py-2.5 px-4 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-400 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-sm font-medium"
                >
                  Apply Now
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
