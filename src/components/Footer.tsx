'use client';

import Link from 'next/link';
import { ArrowRight, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export function Footer() {
  const { user, darkMode, toggleDarkMode } = useCoopSession();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const tHero = useTranslations('Public.hero');
  const tFooter = useTranslations('Public.footer');

  const navItems = [
    { href: '/', label: tNav('home') },
    { href: '/how-it-works', label: tNav('howItWorks') },
    { href: '/about', label: tNav('about') },
    { href: '/rules', label: tNav('rules') },
    { href: '/#faq', label: tNav('faq') },
  ];

  const custodyItems = [
    tFooter('custodyItem1'),
    tFooter('custodyItem2'),
    tFooter('custodyItem3'),
    tFooter('custodyItem4'),
  ];

  return (
    <footer className="w-full bg-white/95 dark:bg-[#001E2B]/94 backdrop-blur-xl border border-slate-200/85 dark:border-[#163948] rounded-2xl shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,10,15,0.68)] overflow-hidden">
      <div
        className="h-[2px] w-full bg-gradient-to-r from-emerald-600/80 via-teal-500/55 to-transparent dark:from-[#00ED64]/75 dark:via-[#13AA52]/45 dark:to-transparent"
        aria-hidden="true"
      />

      <div className="px-5 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-9">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-y-8 sm:gap-x-8 lg:gap-x-10 items-start">
          {/* Column 1: Cooperative Brand & Charter Identity */}
          <div className="sm:col-span-2 lg:col-span-4 space-y-3.5 min-w-0">
            <div className="flex items-center gap-3">
              <AmanahLogo size="sm" decorative className="shrink-0" />
              <div className="min-w-0">
                <span className="block font-display font-bold text-base tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                  {tCommon('brandName')}
                </span>
                <span className="block text-[11.5px] font-medium text-emerald-700 dark:text-[#00ED64]/90 leading-tight mt-0.5 truncate">
                  {tCommon('brandFull')}
                </span>
              </div>
            </div>

            <p className="text-[13px] text-slate-600 dark:text-slate-300/90 leading-relaxed max-w-sm">
              {tFooter('description')}
            </p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{tHero('kickerCharter')}</span>
              <span aria-hidden="true">·</span>
              <span>{tHero('kickerCap')}</span>
              <span aria-hidden="true">·</span>
              <span>{tHero('terms.ceilingMeta')}</span>
            </div>
          </div>

          {/* Column 2: Cooperative Pages */}
          <div className="sm:col-span-1 lg:col-span-2 min-w-0">
            <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white mb-3.5">
              {tFooter('cooperativePages')}
            </h3>
            <ul className="flex flex-col items-start gap-2.5 text-[13px]">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex items-center text-slate-600 dark:text-slate-300/90 hover:text-emerald-700 dark:hover:text-[#00ED64] hover:underline underline-offset-4 transition-colors whitespace-nowrap leading-snug py-0.5"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Custody & Audit */}
          <div className="sm:col-span-1 lg:col-span-3 min-w-0">
            <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white mb-3.5">
              {tFooter('custodyAudit')}
            </h3>
            <ul className="flex flex-col gap-2.5 text-[13px] text-slate-600 dark:text-slate-300/90 leading-snug">
              {custodyItems.map((item) => (
                <li
                  key={item}
                  className="pb-2 border-b border-slate-100/90 dark:border-[#163948]/70 last:border-b-0 last:pb-0"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Member Portal Actions */}
          <div className="sm:col-span-2 lg:col-span-3 min-w-0">
            <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white mb-3.5">
              {tNav('dashboard')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              <Link
                href={user ? '/dashboard' : '/login'}
                onClick={() => {
                  if (user) setMobileBrowseMode(false);
                }}
                className="min-h-[40px] w-full inline-flex items-center justify-between gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 dark:from-[#00684A] dark:to-[#05875C] dark:hover:from-[#05875C] dark:hover:to-[#13AA52] text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all whitespace-nowrap"
              >
                <span>{user ? tNav('dashboard') : tNav('signIn')}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </Link>

              {!user && (
                <Link
                  href="/signup"
                  className="min-h-[40px] w-full inline-flex items-center justify-between gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-[#163948] bg-slate-50/80 dark:bg-[#02232D] hover:bg-slate-100 dark:hover:bg-[#082B39] text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <span>{tNav('joinAmanah')}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-75" aria-hidden="true" />
                </Link>
              )}

              <PWAInstallButton className="w-full justify-center min-h-[40px] px-4 sm:col-span-2 lg:col-span-1" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Legal & Preferences Strip */}
      <div className="border-t border-slate-200/80 dark:border-[#163948] bg-slate-50/75 dark:bg-[#00151F]/65 px-5 sm:px-8 lg:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <span className="text-center sm:text-left leading-relaxed">
          {tFooter('copyright', { year: new Date().getUTCFullYear() })}
        </span>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5 shrink-0">
          <LanguageSwitcher variant="segmented" layoutId="footer-lang-pill" />

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
            className="h-[34px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-slate-200/85 dark:border-slate-700/85 bg-white dark:bg-[#02232D] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#082B39] transition-colors cursor-pointer whitespace-nowrap font-medium"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>{tCommon('lightMode')}</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                <span>{tCommon('darkMode')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
