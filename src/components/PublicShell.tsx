import type { ReactNode } from 'react';
import { PublicFooter } from './PublicFooter.tsx';
import { PublicNavbar } from './PublicNavbar.tsx';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
