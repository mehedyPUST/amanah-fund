import Skeleton from 'react-loading-skeleton';
import { AmanahLogo } from '../../components/AmanahLogo.tsx';

export default function DashboardLoading() {
  return (
    <div
      className="h-dvh overflow-hidden w-full amanah-ambient-canvas p-2.5 lg:p-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:grid-rows-[60px_minmax(0,1fr)] lg:gap-3"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard workspace"
    >
      <div className="lg:hidden flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-4">
          <span
            aria-hidden="true"
            className="absolute -inset-2 rounded-3xl bg-emerald-500/15 animate-pulse"
          />
          <AmanahLogo variant="lockup" size="xl" className="relative shadow-lg" />
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Loading dashboard...
        </p>
      </div>

      <div className="hidden lg:flex lg:col-start-1 lg:row-start-1 h-[60px] shrink-0 px-4 items-center gap-2.5 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <AmanahLogo size="sm" decorative />
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton width={96} height={14} />
          <Skeleton width={72} height={10} />
        </div>
      </div>

      <div className="hidden lg:flex lg:col-start-2 lg:row-start-1 h-[60px] shrink-0 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs px-4 sm:px-6 items-center justify-between gap-4">
        <Skeleton width={190} height={20} />
        <div className="flex items-center gap-2">
          <Skeleton width={76} height={32} borderRadius={8} />
          <Skeleton width={32} height={32} borderRadius={8} />
          <Skeleton width={32} height={32} borderRadius={8} />
          <Skeleton width={140} height={34} borderRadius={8} />
        </div>
      </div>

      <aside className="hidden lg:flex lg:col-start-1 lg:row-start-2 lg:flex-col justify-between min-h-0 overflow-hidden bg-white/80 dark:bg-slate-900/75 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs p-3.5">
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Skeleton key={idx} height={34} borderRadius={8} />
          ))}
        </div>
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <Skeleton width="75%" height={16} />
          <Skeleton width="60%" height={12} />
          <Skeleton height={34} borderRadius={8} />
        </div>
      </aside>

      <main className="hidden lg:block lg:col-start-2 lg:row-start-2 flex-1 min-h-0 overflow-hidden bg-white/75 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs p-4 space-y-3">
        <Skeleton height={82} borderRadius={12} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={112} borderRadius={12} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <Skeleton height={220} borderRadius={12} />
          <Skeleton height={220} borderRadius={12} />
        </div>
        <Skeleton height={240} borderRadius={12} />
      </main>
    </div>
  );
}
