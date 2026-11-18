'use client';

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
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
  const tFooter = useTranslations('Public.footer');

  return (
    <footer className="w-full amanah-card-emerald border rounded-2xl">
      <div className="px-6 sm:px-8 py-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <AmanahLogo size="xs" decorative />
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                {tCommon('brandName')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {tFooter('description')}
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              {tFooter('cooperativePages')}
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  {tNav('home')}
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  {tNav('howItWorks')}
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  {tNav('about')}
                </Link>
              </li>
              <li>
                <Link href="/rules" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  {tNav('rules')}
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  {tNav('faq')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              {tFooter('custodyAudit')}
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>{tFooter('custodyItem1')}</li>
              <li>{tFooter('custodyItem2')}</li>
              <li>{tFooter('custodyItem3')}</li>
              <li>{tFooter('custodyItem4')}</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              {tNav('dashboard')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                onClick={() => {
                  if (user) setMobileBrowseMode(false);
                }}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors whitespace-nowrap"
              >
                {user ? tNav('dashboard') : tNav('signIn')}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  {tNav('joinAmanah')}
                </Link>
              )}
            </div>
            <PWAInstallButton compact />
          </div>
        </div>

        <div className="mt-7 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {tFooter('copyright', { year: new Date().getUTCFullYear() })}
          </span>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="segmented" layoutId="footer-lang-pill" />

            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
              aria-label={darkMode ? tCommon('switchToLight') : tCommon('switchToDark')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>{tCommon('lightMode')}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                  <span>{tCommon('darkMode')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
