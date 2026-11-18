import { AmanahLogo } from '../components/AmanahLogo.tsx';

export default function AppLoading() {
  return (
    <div
      className="min-h-dvh w-full amanah-ambient-canvas flex flex-col items-center justify-center p-6 text-center"
      role="status"
      aria-live="polite"
      aria-label="Loading Amanah"
    >
      <div className="relative flex flex-col items-center">
        <div className="relative mb-5">
          <span
            aria-hidden="true"
            className="absolute -inset-2.5 rounded-3xl bg-emerald-500/15 dark:bg-emerald-400/15 animate-pulse"
          />
          <AmanahLogo
            variant="lockup"
            size="xl"
            className="relative shadow-xl ring-emerald-700/20"
          />
        </div>

        <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
          Qard Hasan &amp; Halal Cooperative Treasury
        </p>

        <div className="mt-4 w-36 h-1 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 animate-pulse" />
        </div>
        <p className="mt-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          Loading encrypted workspace…
        </p>
      </div>
    </div>
  );
}
