import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col amanah-ambient-canvas text-slate-900 dark:text-slate-100">
      <div className="sticky top-0 z-40 w-full px-3 sm:px-6 lg:px-8 pt-2.5 sm:pt-3">
        <div className="max-w-[1380px] mx-auto w-full">
          <Navbar />
        </div>
      </div>

      <main className="flex-1 w-full max-w-[1380px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 min-w-0">
        {children}
      </main>

      <div className="w-full max-w-[1380px] mx-auto px-3 sm:px-6 lg:px-8 pb-6 sm:pb-8">
        <Footer />
      </div>
    </div>
  );
}
