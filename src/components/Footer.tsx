'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

export function Footer() {
  const pathname = usePathname();
  const { user, darkMode, toggleDarkMode } = useCoopSession();

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
                Amanah
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Member-owned interest-free Qard Hasan lending cooperative transitioning to
              Shariah-screened Halal real-economy investments upon maturity.
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Executive Links
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link
                  href="/#overview"
                  onClick={(e) => scrollIfHome(e, 'overview')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Overview
                </Link>
              </li>
              <li>
                <Link
                  href="/#architecture"
                  onClick={(e) => scrollIfHome(e, 'architecture')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Security &amp; Architecture
                </Link>
              </li>
              <li>
                <Link
                  href="/#governance-charter"
                  onClick={(e) => scrollIfHome(e, 'governance-charter')}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Governance Charter
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Membership Application
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Governance & Security
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>Admin-approved KYC & membership</li>
              <li>2/3 supermajority ballot threshold</li>
              <li>AES-256-GCM field encryption</li>
              <li>SHA-256 hash-chained audit trail</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Member Access
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Verified members submit monthly Bank or MFS contributions and vote on Qard Hasan
              requests.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              >
                {user ? 'Member Portal' : 'Member Sign In'}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-block px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
                >
                  Apply Now
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Amanah · 0% Interest · Shariah-Governed
          </span>

          <div className="flex items-center gap-4">
            <span className="font-mono hidden sm:inline">
              HttpOnly JWT · Encrypted Ledger
            </span>
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
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
