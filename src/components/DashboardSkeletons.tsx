import Skeleton from 'react-loading-skeleton';
import { AmanahLogo } from './AmanahLogo.tsx';

export function MobileActivityRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="w-full min-h-[60px] px-3.5 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-xl border border-[#00684A]/22 dark:border-[#00ED64]/38 bg-slate-100/70 dark:bg-[#052735]/80 flex items-center justify-center shrink-0">
              <Skeleton width={22} height={22} borderRadius={6} />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton width="68%" height={12} />
              <Skeleton width="46%" height={10} />
            </div>
          </div>
          <div className="shrink-0 space-y-1.5 text-right">
            <Skeleton width={64} height={12} />
            <Skeleton width={46} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MobileMfsHomeSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* 1. Sliding Banner Skeleton */}
      <div className="relative overflow-hidden rounded-2xl border amanah-card-emerald p-3.5 pb-6 shadow-[0_6px_22px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3 min-h-[70px]">
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton width={96} height={11} />
            <Skeleton width={164} height={18} />
            <Skeleton width="82%" height={11} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-12 h-12 rounded-2xl border border-[#00684A]/22 dark:border-[#00ED64]/38 bg-white/60 dark:bg-[#052735]/80 flex items-center justify-center shrink-0">
              <Skeleton width={26} height={26} borderRadius={8} />
            </span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Skeleton width={20} height={6} borderRadius={999} />
            <Skeleton width={8} height={6} borderRadius={999} />
            <Skeleton width={8} height={6} borderRadius={999} />
            <Skeleton width={8} height={6} borderRadius={999} />
          </div>
          <Skeleton width={42} height={10} />
        </div>
      </div>

      {/* 2. Treasury Headline KPI Strip (2x2 clean grid) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <Skeleton width={96} height={12} />
          <Skeleton width={110} height={12} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="min-h-[96px] p-3 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <Skeleton width={70} height={11} />
                <span className="w-10 h-10 rounded-xl border border-[#00684A]/22 dark:border-[#00ED64]/38 bg-slate-100/70 dark:bg-[#052735]/80 flex items-center justify-center shrink-0">
                  <Skeleton width={20} height={20} borderRadius={6} />
                </span>
              </div>
              <div className="space-y-1.5">
                <Skeleton width="76%" height={15} />
                <Skeleton width="88%" height={10} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Core Services Grid */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <Skeleton width={68} height={12} />
          <span className="w-9 h-9 rounded-xl border border-[#00684A]/22 dark:border-[#00ED64]/38 bg-white/90 dark:bg-[#052735] flex items-center justify-center shrink-0">
            <Skeleton width={17} height={17} borderRadius={5} />
          </span>
        </div>
        <div className="mfs-icon-grid-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="mfs-tile gap-2 rounded-2xl border border-slate-200/85 dark:border-[#163948] bg-white/95 dark:bg-[#02202D]/95 flex flex-col items-center justify-center"
            >
              <span className="mfs-tile-icon-box border border-[#00684A]/22 dark:border-[#00ED64]/38 bg-slate-100/70 dark:bg-[#052735]/80 flex items-center justify-center shrink-0">
                <Skeleton width={22} height={22} borderRadius={6} />
              </span>
              <Skeleton width={46} height={10} />
            </div>
          ))}
        </div>
      </section>

      {/* 4. More Section Accordion Bar */}
      <div className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <Skeleton width={116} height={12} />
        <Skeleton width={16} height={16} borderRadius={4} />
      </div>

      {/* 5. Recent Activity List Card */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <Skeleton width={100} height={12} />
          <Skeleton width={52} height={12} />
        </div>
        <div className="rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
          <MobileActivityRowsSkeleton rows={3} />
        </div>
      </section>
    </div>
  );
}

export function MobileDashboardShellSkeleton() {
  return (
    <div className="lg:hidden flex-1 min-h-0 flex flex-col w-full" aria-hidden="true">
      {/* Mobile Top Bar Skeleton */}
      <header className="h-[52px] sm:h-[54px] shrink-0 bg-white/90 dark:bg-slate-900/84 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 px-3 sm:px-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <Skeleton width={36} height={36} borderRadius={12} />
          <AmanahLogo size="xs" decorative />
          <Skeleton width={112} height={15} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Skeleton width={36} height={36} borderRadius={12} />
          <Skeleton width={36} height={36} borderRadius={12} />
          <Skeleton width={36} height={36} borderRadius={12} />
        </div>
      </header>

      {/* Scrollable Mobile Workspace Skeleton */}
      <main className="flex-1 min-h-0 overflow-hidden pl-2 pr-2 pt-3 pb-4 sm:pl-2.5 sm:pr-2.5 sm:pt-4">
        <MobileMfsHomeSkeleton />
      </main>

      {/* Sticky Mobile Footer Nav Skeleton */}
      <nav className="shrink-0 bg-white/95 dark:bg-slate-900/94 backdrop-blur-xl border-t border-slate-200/85 dark:border-slate-800/85 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-[60px] items-stretch">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="relative flex flex-col items-center justify-center gap-1 px-1"
            >
              {idx === 0 && (
                <span className="pointer-events-none absolute top-0 left-4 right-4 h-[2.5px] bg-gradient-to-r from-emerald-600/40 via-teal-500/40 to-emerald-500/40 dark:from-[#00ED64]/45 dark:via-[#18E299]/45 dark:to-[#00ED64]/45" />
              )}
              <Skeleton width={22} height={22} borderRadius={6} />
              <Skeleton width={46} height={9} />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
