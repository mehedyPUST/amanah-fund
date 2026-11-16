import type { ReactNode } from 'react';
import { Footer } from './Footer.tsx';
import { Navbar } from './Navbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-2 sm:p-2.5 gap-2.5">
      <Navbar />
      <main className="flex-1 min-w-0 max-w-7xl mx-auto w-full">{children}</main>
      <Footer />
    </div>
  );
}
