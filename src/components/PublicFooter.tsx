'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

export function PublicFooter() {
  const { user } = useCoopSession();

  return (
    <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Amanah Co-op Treasury
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Member-owned interest-free Qard Hasan lending cooperative transitioning to
              Shariah-screened Halal real-economy investments upon maturity.
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Platform
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                  Overview & Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                  About & Architecture
                </Link>
              </li>
              <li>
                <Link href="/rules" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                  Cooperative Bylaws & Rules
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Governance & Security
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>Admin-approved membership onboarding</li>
              <li>2/3 supermajority ballot threshold</li>
              <li>AES-256-GCM field encryption & SHA-256 audit</li>
              <li>Google Sheets Blueprint & Gmail alerts</li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Member Portal
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Submit monthly Bank or MFS contributions, vote on Qard Hasan applications, and track
              repayment schedules.
            </p>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="inline-block px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              {user ? 'Go to Members Dashboard' : 'Sign In or Apply'}
            </Link>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Amanah Co-op Fund Management. 0% Interest · Shariah-Governed.
          </span>
          <span className="font-mono">HttpOnly JWT · End-to-End Encrypted Ledger</span>
        </div>
      </div>
    </footer>
  );
}
