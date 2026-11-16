import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Navbar />
      <div className="flex-1 flex flex-col gap-2.5 px-2 sm:px-2.5 pt-1.5 pb-2 sm:pb-2.5">
        <main className="flex-1 min-w-0 max-w-7xl mx-auto w-full">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
