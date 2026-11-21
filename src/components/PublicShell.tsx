import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { MobileVisitorGate } from './MobileVisitorGate.tsx';
import { Navbar } from './Navbar.tsx';
import { PublicScrollViewport } from './PublicScrollViewport.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden amanah-ambient-canvas text-slate-900 dark:text-slate-100 p-2 sm:p-3.5 lg:p-4 flex flex-col">
      <div className="max-w-[1380px] mx-auto w-full flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3.5">
        <div className="shrink-0 z-40 w-full">
          <Navbar />
        </div>

        <PublicScrollViewport>
          <main className="w-full min-w-0 space-y-5 sm:space-y-7">
            {children}
          </main>

          <Footer />
        </PublicScrollViewport>
      </div>
      <MobileVisitorGate />
    </div>
  );
}
