'use client';

import Link from 'next/link';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

export function Footer() {
  const { user, darkMode, toggleDarkMode } = useCoopSession();

  return (
    <footer className="w-full bg-gradient-to-b from-emerald-50/45 via-white to-white dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl shadow-2xs">
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Community Hub
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Security &amp; Architecture
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/rules"
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  Governance Charter
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
                  className="inline-block px-3.5 py-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 whitespace-nowrap"
                >
                  Join Amanah
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-emerald-200/60 dark:border-emerald-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Amanah · 0% Interest · Shariah-Governed
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono hidden sm:inline text-emerald-700/80 dark:text-emerald-400/80">
              HttpOnly JWT · Encrypted Ledger
            </span>
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 text-slate-600 dark:text-slate-300 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
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
