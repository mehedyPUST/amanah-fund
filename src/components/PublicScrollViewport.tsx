'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function PublicScrollViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <div className="min-w-0 min-h-0 w-full flex-1 flex flex-col sm:pl-2.5 sm:pr-0.5 lg:pl-3 lg:pr-1 bg-white/75 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle pl-2 pr-1 py-3 sm:pl-0 sm:pr-1 sm:py-4 lg:pl-0 lg:pr-1 lg:py-5"
      >
        <div className="w-full space-y-5 sm:space-y-6">{children}</div>
      </div>
    </div>
  );
}
