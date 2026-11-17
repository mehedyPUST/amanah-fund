import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden flex flex-col amanah-ambient-canvas text-slate-900 dark:text-slate-100 p-2.5 sm:p-4 lg:p-5 gap-2.5 sm:gap-3">
      <div className="max-w-[1380px] mx-auto w-full shrink-0">
        <Navbar />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
        <div className="max-w-[1380px] mx-auto w-full flex flex-col gap-5 sm:gap-6 pb-2">
          <main className="w-full min-w-0 space-y-6 sm:space-y-8">
            {children}
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
