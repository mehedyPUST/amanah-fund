'use client';

import Link from 'next/link';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

export function Footer() {
  const { user, darkMode, toggleDarkMode } = useCoopSession();

  return (
    <footer className="w-full bg-gradient-to-b from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-2xs">
      <div className="px-5 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 ring-1 ring-emerald-500/20 text-white flex items-center justify-center shadow-xs">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Amanah
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
              Interest-free Qard Hasan lending &amp; Halal real-economy cooperative.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Portal Pages
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link
                  href="/"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Overview
                </Link>
              </li>
              <li>
                <Link
                  href="/community"
                  className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                >
                  Community Hub
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="hover:text-violet-700 dark:hover:text-violet-400 transition-colors"
                >
                  Security &amp; Architecture
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/rules"
                  className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                >
                  Governance Charter
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Member Access
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                className="inline-block px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
              >
                {user ? 'Dashboard' : 'Sign In'}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-block px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50/70 dark:hover:bg-violet-950/30 hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-200 whitespace-nowrap"
                >
                  Join Amanah
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Amanah · 0% Interest · Shariah-Governed
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono hidden sm:inline text-teal-700/80 dark:text-teal-400/80">
              HttpOnly JWT · Encrypted Ledger
            </span>
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
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
