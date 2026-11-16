'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

export function Footer() {
  const pathname = usePathname();
  const { user, authChecking, darkMode, toggleDarkMode } = useCoopSession();

  function scrollIfHome(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (pathname === '/') {
      e.preventDefault();
      window.history.replaceState(null, '', id === 'overview' ? '/' : `#${id}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <footer className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xs">
      <div className="px-4 sm:px-6 py-6 sm:py-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 ring-1 ring-emerald-500/20 text-white flex items-center justify-center shadow-xs">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Amanah
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Interest-free Qard Hasan lending &amp; Halal real-economy cooperative.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Portal Sections
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link
                  href="/#overview"
                  onClick={(e) => scrollIfHome(e, 'overview')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Overview
                </Link>
              </li>
              {!authChecking && user && user.status === 'active' && (
                <li>
                  <Link
                    href="/#notice-board"
                    onClick={(e) => scrollIfHome(e, 'notice-board')}
                    className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                  >
                    Notice Board
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href="/#architecture"
                  onClick={(e) => scrollIfHome(e, 'architecture')}
                  className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
                >
                  Security &amp; Architecture
                </Link>
              </li>
              <li>
                <Link
                  href="/#how-it-works"
                  onClick={(e) => scrollIfHome(e, 'how-it-works')}
                  className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/#governance-charter"
                  onClick={(e) => scrollIfHome(e, 'governance-charter')}
                  className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                  Governance Charter
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              Governance &amp; Security
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>Admin-approved KYC &amp; membership</li>
              <li>2/3 supermajority ballot threshold</li>
              <li>AES-256-GCM field encryption</li>
              <li>SHA-256 hash-chained audit trail</li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Member Access
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                className="inline-block px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
              >
                {user ? 'Dashboard' : 'Sign In'}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-block px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200 whitespace-nowrap"
                >
                  Join Amanah
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Amanah · 0% Interest · Shariah-Governed
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono hidden sm:inline text-indigo-700/80 dark:text-indigo-400/80">
              HttpOnly JWT · Encrypted Ledger
            </span>
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 transition-all duration-200 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
