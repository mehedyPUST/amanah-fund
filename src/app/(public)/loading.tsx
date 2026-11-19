import Skeleton from 'react-loading-skeleton';

export default function PublicContentLoading() {
  return (
    <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite" aria-label="Loading page content">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-5 sm:p-7 space-y-4">
        <Skeleton width={160} height={18} />
        <Skeleton width="62%" height={36} />
        <Skeleton width="78%" height={18} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} height={96} borderRadius={12} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-5 space-y-3">
          <Skeleton width={200} height={20} />
          <Skeleton height={180} borderRadius={12} />
        </div>
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/70 p-5 space-y-3">
          <Skeleton width={180} height={20} />
          <Skeleton height={180} borderRadius={12} />
        </div>
      </div>
    </div>
  );
}
