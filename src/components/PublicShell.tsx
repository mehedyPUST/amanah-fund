import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-gradient-to-br from-slate-100 via-emerald-50/40 to-teal-50/35 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-950 text-slate-900 dark:text-slate-100 p-2 lg:p-2.5 gap-2 lg:gap-2.5">
      <Navbar />
      <div className="flex-1 min-h-0 w-full bg-white/65 dark:bg-slate-900/65 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between gap-4">
          <main className="w-full min-w-0 space-y-2.5">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
