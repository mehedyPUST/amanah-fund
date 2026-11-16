'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';
import { LanguageToggle } from './LanguageToggle.tsx';

export function Footer() {
  const pathname = usePathname();
  const { user, darkMode, toggleDarkMode, t } = useCoopSession();

  function scrollIfHome(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (pathname === '/') {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 ring-1 ring-emerald-500/20 text-white flex items-center justify-center shadow-xs">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                {t.common.brand}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.footer.tagline}
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              {t.footer.executiveLinks}
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link
                  href="/#overview"
                  onClick={(e) => scrollIfHome(e, 'overview')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.footer.overview}
                </Link>
              </li>
              <li>
                <Link
                  href="/#architecture"
                  onClick={(e) => scrollIfHome(e, 'architecture')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.footer.securityArchitecture}
                </Link>
              </li>
              <li>
                <Link
                  href="/#governance-charter"
                  onClick={(e) => scrollIfHome(e, 'governance-charter')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.footer.governanceCharter}
                </Link>
              </li>
              <li>
                <Link
                  href="/#community"
                  onClick={(e) => scrollIfHome(e, 'community')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.footer.community}
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.footer.membershipApplication}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              {t.footer.governanceSecurity}
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              {t.footer.securityPoints.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              {t.footer.memberAccess}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.footer.memberAccessBody}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              >
                {user ? t.common.memberPortal : t.common.memberSignIn}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-block px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
                >
                  {t.common.applyNow}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} {t.footer.copyrightSuffix}
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono hidden sm:inline">{t.footer.ledgerBadge}</span>
            <LanguageToggle compact />
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? t.common.switchToLight : t.common.switchToDark}
              aria-label={darkMode ? t.common.switchToLight : t.common.switchToDark}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>{t.common.light}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  <span>{t.common.dark}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
