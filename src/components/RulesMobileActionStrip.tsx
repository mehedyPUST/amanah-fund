'use client';

import Link from 'next/link';
import { LayoutDashboard, Lock, UserPlus } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';

export function RulesMobileActionStrip() {
  const { user, authChecking } = useCoopSession();

  if (authChecking) {
    return (
      <div className="h-[44px] rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
    );
  }

  if (user) {
    return (
      <Link
        href="/dashboard"
        onClick={() => setMobileBrowseMode(false)}
        className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
      >
        <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
        <span>Dashboard</span>
      </Link>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Link
        href="/login"
        className="min-h-[44px] px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1.5 text-center active:scale-[0.99]"
      >
        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Sign In</span>
      </Link>
      <Link
        href="/signup"
        className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 text-center active:scale-[0.99]"
      >
        <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Join Amanah</span>
      </Link>
    </div>
  );
}
