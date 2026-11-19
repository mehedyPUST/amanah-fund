'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { PWAUpdateButton } from './PWAUpdateButton.tsx';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const { user, authChecking, refreshUser, logout, darkMode, toggleDarkMode } = useCoopSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAuthenticated = !authChecking && Boolean(user);

  const navLinks = [
    { href: '/', label: tNav('home') },
    { href: '/about', label: tNav('about') },
    { href: '/rules', label: tNav('rules') },
  ];

  function isLinkActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleRefreshPage() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({ queryKey: queryKeys.public.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.bootstrapStatus() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.references() }),
      ]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('amanah:refresh'));
      }
    } finally {
      window.setTimeout(() => setRefreshing(false), 350);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      setMobileBrowseMode(false);
      await logout();
      setMobileOpen(false);
      router.replace('/');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="relative shrink-0 z-40 w-full">
      <div className="w-full min-h-[52px] sm:min-h-[58px] bg-white/90 dark:bg-slate-900/85 backdrop-blur-md rounded-xl sm:rounded-2xl border border-emerald-200/85 dark:border-emerald-800/60 shadow-sm shadow-emerald-500/10 px-3 sm:px-6 lg:px-7 py-2 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] gap-2.5 sm:gap-4">
        {/* Zone 1: Clean single-element Brand Wordmark */}
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="inline-flex items-center gap-2.5 shrink-0 group whitespace-nowrap md:justify-self-start"
        >
          <AmanahLogo
            size="xs"
            decorative
            className="transition-transform duration-150 group-hover:scale-105"
          />
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            {tCommon('brandName')}
          </span>
        </Link>

        {/* Zone 2: Centered typographic nav links with subtle underline */}
        <nav
          className="hidden md:flex items-center justify-center gap-6 lg:gap-7 md:justify-self-center"
          aria-label={tNav('primaryNav')}
        >
          {navLinks.map((link) => {
            const active = isLinkActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative py-1 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300'
                }`}
              >
                <span>{link.label}</span>
                {active && (
                  <motion.span
                    layoutId="public-navbar-underline"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute left-0 right-0 -bottom-0.5 h-[2.5px] rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Language, Refresh, PWA Update, Theme & Primary Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 md:justify-self-end">
          <LanguageSwitcher
            variant="segmented"
            layoutId="navbar-lang-pill"
            className="hidden lg:inline-flex"
          />
          <LanguageSwitcher
            variant="compact"
            className="hidden md:inline-flex lg:hidden"
          />

          <button
            type="button"
            onClick={() => void handleRefreshPage()}
            disabled={refreshing}
            title={tCommon('refreshPageTitle')}
            aria-label={tCommon('refreshPage')}
            className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/35 transition-colors duration-150 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-70"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`}
              aria-hidden="true"
            />
          </button>

          <PWAUpdateButton compact className="hidden sm:inline-flex" />

          <PWAInstallButton compact className="hidden xl:inline-flex" />

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors duration-150 flex items-center justify-center cursor-pointer shrink-0"
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
                onClick={() => {
                  setMobileBrowseMode(false);
                  setMobileOpen(false);
                }}
                className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-600/25 transition-all duration-150 whitespace-nowrap shrink-0"
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tNav('dashboard')}</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                title={tNav('signOut')}
                aria-label={tNav('signOut')}
                className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800 transition-colors duration-150 shrink-0 cursor-pointer disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-2.5 h-9 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                {tNav('signIn')}
              </Link>
              <Link
                href="/signup"
                className="group hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-600/25 transition-all duration-150 whitespace-nowrap shrink-0"
              >
                <span>{tNav('joinAmanah')}</span>
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
            aria-label={tCommon('toggleNavigationMenu')}
            className="md:hidden w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
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
            className="md:hidden absolute left-0 right-0 top-[66px] z-50 amanah-card-emerald backdrop-blur-md rounded-2xl border p-3.5 space-y-2.5 shadow-xl"
          >
            <div className="space-y-1">
              {navLinks.map((link) => {
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
            </div>

            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {tCommon('language')}
                </span>
                <LanguageSwitcher variant="segmented" layoutId="mobile-navbar-lang-pill" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleRefreshPage()}
                  disabled={refreshing}
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{tCommon('refresh')}</span>
                </button>
                <PWAUpdateButton fullWidth />
              </div>

              {isAuthenticated ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/dashboard"
                    onClick={() => {
                      setMobileBrowseMode(false);
                      setMobileOpen(false);
                    }}
                    className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                    <span>{tNav('dashboard')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="w-full py-2.5 px-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    <span>{signingOut ? tNav('signingOut') : tNav('signOut')}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {tNav('signIn')}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold shadow-sm"
                  >
                    {tNav('joinAmanah')}
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
