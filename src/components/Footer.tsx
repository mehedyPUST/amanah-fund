'use client';

import Link from 'next/link';
import { Moon, Shield, Sun } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export function Footer() {
  const { user, darkMode, toggleDarkMode } = useCoopSession();

  return (
    <footer className="w-full amanah-card-emerald border rounded-2xl">
      <div className="px-6 sm:px-8 py-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-700 dark:bg-emerald-600 text-white flex items-center justify-center">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Amanah
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Encrypted 20-member cooperative fund for interest-free Qard Hasan lending and 2/3-voted Halal ventures.
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Cooperative Pages
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  About &amp; Security
                </Link>
              </li>
              <li>
                <Link href="/rules" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  Rules &amp; Charter
                </Link>
              </li>
              <li>
                <Link href="/community" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  Community
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Custody &amp; Audit
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>Admin-verified KYC &amp; member cap</li>
              <li>2/3 supermajority secret ballots</li>
              <li>AES-256-GCM encrypted records</li>
              <li>SHA-256 hash-chained audit trail</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Member Portal
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={user ? '/dashboard' : '/login'}
                onClick={() => {
                  if (user) setMobileBrowseMode(false);
                }}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors whitespace-nowrap"
              >
                {user ? 'Open Dashboard' : 'Sign In'}
              </Link>
              {!user && (
                <Link
                  href="/signup"
                  className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  Join Amanah
                </Link>
              )}
            </div>
            <PWAInstallButton compact />
          </div>
        </div>

        <div className="mt-7 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getUTCFullYear()} Amanah · 0% Interest · Shariah-Governed
          </span>

          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Light mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>Dark mode</span>
              </>
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
