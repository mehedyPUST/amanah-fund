'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, LayoutDashboard, LogOut, Menu, Moon, Shield, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

interface PublicNavItem {
  href: string;
  label: string;
}

const NAV_LINKS: PublicNavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/community', label: 'Community' },
  { href: '/about', label: 'Architecture' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/rules', label: 'Charter' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking, logout, darkMode, toggleDarkMode } = useCoopSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isAuthenticated = !authChecking && Boolean(user);

  function isLinkActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
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
    <header className="relative z-40 w-full">
      <div className="w-full h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs px-4 sm:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Clean single-element Brand Wordmark */}
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="inline-flex items-center gap-2.5 shrink-0 group whitespace-nowrap"
        >
          <span className="w-7 h-7 rounded-lg bg-emerald-700 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105">
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            Amanah
          </span>
        </Link>

        {/* Zone 2: Clean typographic nav links with subtle underline */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative py-1 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{link.label}</span>
                {active && (
                  <motion.span
                    layoutId="public-navbar-underline"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full bg-emerald-600 dark:bg-emerald-400"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Theme utility + Focused Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors duration-150 flex items-center justify-center cursor-pointer shrink-0"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
            )}
          </button>

          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                title="Sign out"
                aria-label="Sign out"
                className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800 transition-colors duration-150 shrink-0 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="group hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                <span>Join Amanah</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="md:hidden w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="md:hidden absolute left-0 right-0 top-[62px] z-50 bg-white/92 dark:bg-slate-900/92 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-slate-800/80 p-3 space-y-1 shadow-xl"
          >
            {NAV_LINKS.map((link) => {
              const active = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="pt-2 mt-1 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
              {isAuthenticated ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="w-full py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                    <span>Dashboard</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="w-full py-2.5 px-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-sm font-medium"
                  >
                    Join Amanah
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
