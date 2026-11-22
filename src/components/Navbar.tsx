'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
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
import { translateRoleLabel } from '../i18n/messages.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { PWAUpdateButton } from './PWAUpdateButton.tsx';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const { user, authChecking, refreshUser, logout, darkMode, toggleDarkMode, locale } = useCoopSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [failedMenuPhotoUrl, setFailedMenuPhotoUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAuthenticated = !authChecking && Boolean(user);

  // Allow mobile users to slide left-to-right to open the hamburger menu (and right-to-left to close)
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
        if (el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') {
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
      if (window.innerWidth >= 768 || e.touches.length !== 1) {
        tracking = null;
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      triggered = false;

      if (mobileOpen) {
        tracking = 'close';
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
          triggerHaptic('drawer');
          setMobileOpen(true);
        }
      } else if (tracking === 'close') {
        if (dx <= -40 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          triggered = true;
          tracking = null;
          triggerHaptic('drawer');
          setMobileOpen(false);
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
  }, [mobileOpen]);

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
    triggerHaptic('selection');
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
    if (signingOut) return;
    triggerHaptic('warning');
    setSigningOut(true);
    try {
      setMobileBrowseMode(false);
      await logout();
      setMobileOpen(false);
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      } else {
        router.replace('/');
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="relative shrink-0 z-40 w-full">
      <div className="w-full min-h-[54px] sm:min-h-[58px] bg-white/95 dark:bg-[#001E2B]/94 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-[#163948] shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_8px_28px_-12px_rgba(0,10,15,0.68)] px-3.5 sm:px-6 lg:px-7 py-2 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 animate__animated animate__fadeIn">
        {/* Mobile Left Hamburger Toggle */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('drawer');
            setMobileOpen((o) => !o);
          }}
          aria-label={tCommon('toggleNavigationMenu')}
          aria-expanded={mobileOpen}
          className="md:hidden order-1 w-10 h-10 rounded-xl border border-slate-200/85 dark:border-[#163948] bg-white dark:bg-[#02232D] text-slate-700 dark:text-slate-200 hover:bg-emerald-50/70 dark:hover:bg-[#082B39] active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-2xs"
        >
          {mobileOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>

        {/* Zone 1: Clean single-element Brand Wordmark (far right on mobile, far left on desktop) */}
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="order-3 md:order-none inline-flex items-center gap-2.5 shrink-0 group whitespace-nowrap md:justify-self-start"
        >
          <AmanahLogo
            size="xs"
            decorative
            className="transition-transform duration-200 group-hover:scale-105"
          />
          <span className="font-display font-bold text-[15px] sm:text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            {tCommon('brandName')}
          </span>
        </Link>

        {/* Zone 2: Centered typographic nav links with subtle highlight */}
        <nav
          className="hidden md:flex items-center justify-center gap-1 lg:gap-1.5 md:justify-self-center"
          aria-label={tNav('primaryNav')}
        >
          {navLinks.map((link) => {
            const active = isLinkActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-emerald-800 dark:text-[#00ED64] font-semibold bg-emerald-50/90 dark:bg-[#00684A]/25'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-[#00ED64] hover:bg-slate-100/75 dark:hover:bg-[#082B39]/75'
                }`}
              >
                <span>{link.label}</span>
                {active && (
                  <motion.span
                    layoutId="public-navbar-underline"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute left-3.5 right-3.5 -bottom-0.5 h-[2px] rounded-full bg-emerald-600 dark:bg-[#00ED64]"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Language, PWA Update, Theme & Primary Action */}
        <div
          className={`order-2 md:order-none ${isAuthenticated ? 'flex' : 'hidden sm:flex'} ml-auto md:ml-0 items-center gap-1.5 sm:gap-2 shrink-0 md:justify-self-end`}
        >
          <LanguageSwitcher
            variant="compact"
            className="hidden md:inline-flex"
          />

          <PWAUpdateButton compact className="hidden md:inline-flex" />

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            className="hidden md:flex w-9 h-9 rounded-xl border border-slate-200/85 dark:border-slate-700/85 bg-white/85 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/75 transition-colors duration-150 items-center justify-center cursor-pointer shrink-0 shadow-2xs"
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
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 dark:from-[#00684A] dark:to-[#05875C] dark:hover:from-[#05875C] dark:hover:to-[#13AA52] text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all duration-150 whitespace-nowrap shrink-0"
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
                className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200/85 dark:border-[#163948] bg-white dark:bg-[#02232D] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800 transition-colors duration-150 shrink-0 cursor-pointer disabled:opacity-60 shadow-2xs"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-3 h-9 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-[#00ED64] hover:bg-slate-100/75 dark:hover:bg-[#082B39]/75 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                {tNav('signIn')}
              </Link>
              <Link
                href="/signup"
                className="group hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 dark:from-[#00684A] dark:to-[#05875C] dark:hover:from-[#05875C] dark:hover:to-[#13AA52] text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all duration-150 whitespace-nowrap shrink-0"
              >
                <span>{tNav('joinAmanah')}</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </>
          )}

        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden absolute left-0 top-[62px] sm:top-[64px] w-[68vw] max-w-[300px] z-50 amanah-card-emerald backdrop-blur-xl rounded-2xl border p-3 space-y-2 shadow-2xl"
          >
            {isAuthenticated && user && (
              <Link
                href="/dashboard"
                onClick={() => {
                  setMobileBrowseMode(false);
                  setMobileOpen(false);
                }}
                className="flex items-center gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800 min-w-0"
              >
                {(() => {
                  const menuPhotoUrl = user.registrationDetails?.photoUrl || user.photoUrl;
                  const showPhoto = Boolean(menuPhotoUrl && failedMenuPhotoUrl !== menuPhotoUrl);
                  return showPhoto ? (
                    <img
                      src={menuPhotoUrl}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedMenuPhotoUrl(menuPhotoUrl || null)}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30 shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
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
                  <div className="mt-0.5 flex items-center gap-1 min-w-0 text-[12px] text-slate-600 dark:text-slate-400">
                    <span className="truncate">{translateRoleLabel(user.role, locale)}</span>
                    {user.status === 'active' && (
                      <BadgeCheck
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                        aria-label={tCommon('verified')}
                      />
                    )}
                  </div>
                </div>
              </Link>
            )}

            <div className="flex flex-col gap-0.5">
              {navLinks.map((link) => {
                const active = isLinkActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => {
                      triggerHaptic('nav');
                      setMobileOpen(false);
                    }}
                    className={`flex items-center w-full min-h-[44px] text-left px-3 py-2 rounded-xl text-[14px] font-medium transition-colors truncate ${
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

            <div className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-1.5">
              <PWAUpdateButton
                fullWidth
                align="start"
                popoverPlacement="bottom"
                popoverAlign="left"
              />

              <button
                type="button"
                onClick={() => void handleRefreshPage()}
                disabled={refreshing}
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 text-[13.5px] font-medium flex items-center justify-start gap-2 cursor-pointer active:scale-[0.99] transition-all whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-4 h-4 shrink-0 ${refreshing ? 'animate-spin text-emerald-600' : ''}`}
                  aria-hidden="true"
                />
                <span className="truncate">{tCommon('refresh')}</span>
              </button>

              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => {
                      triggerHaptic('nav');
                      setMobileBrowseMode(false);
                      setMobileOpen(false);
                    }}
                    className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-[13.5px] font-semibold shadow-xs flex items-center justify-start gap-2 active:scale-[0.99] transition-all whitespace-nowrap"
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{tNav('dashboard')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-[13.5px] font-medium flex items-center justify-start gap-2 cursor-pointer disabled:opacity-60 active:scale-[0.99] transition-all whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{signingOut ? tNav('signingOut') : tNav('signOut')}</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => {
                      triggerHaptic('nav');
                      setMobileOpen(false);
                    }}
                    className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[13.5px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-start"
                  >
                    {tNav('signIn')}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => {
                      triggerHaptic('nav');
                      setMobileOpen(false);
                    }}
                    className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-[13.5px] font-semibold shadow-xs flex items-center justify-start gap-2"
                  >
                    <span className="truncate">{tNav('joinAmanah')}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </Link>
                </>
              )}

              <div className="pt-2 mt-0.5 border-t border-slate-200/75 dark:border-slate-800/80 flex items-center gap-1.5">
                <LanguageSwitcher variant="compact" className="h-9 px-2.5 text-[12.5px] gap-1.5" />
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                  aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
                  className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors text-[12.5px] font-medium cursor-pointer whitespace-nowrap"
                >
                  {darkMode ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{darkMode ? tCommon('lightMode') : tCommon('darkMode')}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
