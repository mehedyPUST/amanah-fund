import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col amanah-ambient-canvas text-slate-900 dark:text-slate-100 p-2.5 sm:p-4 lg:p-5">
      <div className="max-w-[1380px] mx-auto w-full flex-1 flex flex-col gap-3 sm:gap-4">
        <div className="sticky top-2.5 sm:top-4 lg:top-5 z-40 w-full">
          <Navbar />
        </div>

        <main className="w-full min-w-0 flex-1 space-y-5 sm:space-y-6">
          {children}
        </main>

        <Footer />
      </div>
    </div>
  );
}
