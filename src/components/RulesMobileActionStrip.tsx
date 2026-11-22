'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Lock, UserPlus } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { useCoopSession } from './AppProviders.tsx';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';

export function RulesMobileActionStrip() {
  const { user, authChecking } = useCoopSession();
  const tRules = useTranslations('Public.rules');
  const tNav = useTranslations('Navigation');

  return (
    <div className="lg:hidden space-y-2 animate__animated animate__fadeIn">
      <div className="grid grid-cols-3 gap-2">
        <a
          href="#rules-charter"
          className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-[#163948] bg-white/90 dark:bg-[#02232D] text-xs font-medium text-slate-700 dark:text-[#CBD8E0] flex items-center justify-center text-center"
        >
          {tRules('tabCharter')}
        </a>
        <a
          href="#rules-faq"
          className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-[#163948] bg-white/90 dark:bg-[#02232D] text-xs font-medium text-slate-700 dark:text-[#CBD8E0] flex items-center justify-center text-center"
        >
          {tRules('tabFaq')}
        </a>
        <a
          href="#rules-how-it-works"
          className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-[#163948] bg-white/90 dark:bg-[#02232D] text-xs font-medium text-slate-700 dark:text-[#CBD8E0] flex items-center justify-center text-center"
        >
          {tRules('tabHowItWorks')}
        </a>
      </div>

      {authChecking ? (
        <Skeleton height={44} borderRadius={12} />
      ) : user ? (
        <Link
          href="/dashboard"
          onClick={() => setMobileBrowseMode(false)}
          className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-[#00684A] dark:hover:bg-[#05875C] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
        >
          <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
          <span>{tNav('dashboard')}</span>
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/login"
            className="min-h-[44px] px-3 py-2 rounded-xl border border-emerald-200 dark:border-[#163948] bg-emerald-50/85 dark:bg-[#02232D] text-xs font-semibold text-emerald-800 dark:text-[#00ED64] flex items-center justify-center gap-1.5 text-center active:scale-[0.99]"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tNav('signIn')}</span>
          </Link>
          <Link
            href="/signup"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-[#00684A] dark:hover:bg-[#05875C] text-white text-xs font-semibold flex items-center justify-center gap-1.5 text-center active:scale-[0.99]"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tNav('joinAmanah')}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
