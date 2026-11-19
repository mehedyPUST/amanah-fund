'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { AmanahLoadingLogo } from '../components/AmanahLogo.tsx';
import { useCoopSession } from '../components/AppProviders.tsx';

export default function AppLoading() {
  const tCommon = useTranslations('Common');
  const { hasVisitedBefore } = useCoopSession();
  const [isFirstVisitLoad] = useState<boolean>(() => !hasVisitedBefore);

  const logoSplashContent = (
    <div className="relative flex flex-col items-center">
      <div className="mb-5">
        <AmanahLoadingLogo variant="lockup" size="xl" />
      </div>

      <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
        {tCommon('brandName')}
      </h1>
      <p className="mt-1 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
        {tCommon('loadingHeroSubtitle')}
      </p>

      <div className="mt-4 w-36 h-1 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 animate-pulse" />
      </div>
      <p className="mt-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        {tCommon('loadingWorkspace')}
      </p>
    </div>
  );

  if (isFirstVisitLoad) {
    return (
      <div
        className="min-h-dvh w-full amanah-ambient-canvas flex flex-col items-center justify-center p-6 text-center"
        role="status"
        aria-live="polite"
        aria-label={tCommon('loadingAppAria')}
      >
        {logoSplashContent}
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh w-full amanah-ambient-canvas"
      role="status"
      aria-live="polite"
      aria-label={tCommon('loadingAppAria')}
    >
      {/* Mobile keeps branded loading screen */}
      <div className="lg:hidden min-h-dvh w-full flex flex-col items-center justify-center p-6 text-center">
        {logoSplashContent}
      </div>

      {/* Desktop repeat visits & reloads render a clean workspace skeleton without logo splash */}
      <div className="hidden lg:flex max-w-[1380px] mx-auto w-full flex-col gap-3 p-3">
        <div className="h-[58px] w-full rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/75 px-6 flex items-center justify-between">
          <Skeleton width={120} height={22} />
          <div className="flex items-center gap-6">
            <Skeleton width={56} height={14} />
            <Skeleton width={56} height={14} />
            <Skeleton width={56} height={14} />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton width={76} height={34} borderRadius={8} />
            <Skeleton width={112} height={34} borderRadius={8} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-6 space-y-4">
          <Skeleton width={180} height={16} />
          <Skeleton width="55%" height={36} />
          <Skeleton width="72%" height={18} />
          <div className="grid grid-cols-4 gap-3 pt-2">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} height={92} borderRadius={12} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-5 space-y-3">
            <Skeleton width={210} height={20} />
            <Skeleton height={180} borderRadius={12} />
          </div>
          <div className="col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-5 space-y-3">
            <Skeleton width={180} height={20} />
            <Skeleton height={180} borderRadius={12} />
          </div>
        </div>
      </div>
    </div>
  );
}
