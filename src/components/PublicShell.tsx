import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-2 lg:p-2.5 gap-2 lg:gap-2.5">
      <Navbar />
      <div className="flex-1 min-h-0 w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-3.5 sm:p-4 lg:p-5 flex flex-col justify-between gap-4">
          <main className="w-full min-w-0 space-y-2.5">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
