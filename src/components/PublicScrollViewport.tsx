'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys.ts';
import { PullToRefreshIndicator, usePullToRefresh } from './PullToRefresh.tsx';

export function PublicScrollViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handlePublicRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.public.all });
    router.refresh();
  }, [queryClient, router]);

  const pullToRefresh = usePullToRefresh({
    scrollRef,
    onRefresh: handlePublicRefresh,
  });

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
    <div className="min-w-0 min-h-0 w-full flex-1 flex flex-col sm:pl-2.5 sm:pr-0.5 lg:pl-3 lg:pr-1 bg-white/80 dark:bg-slate-900/74 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 shadow-[0_8px_36px_-18px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)] overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-subtle pl-2 pr-1 py-3 sm:pl-0 sm:pr-1 sm:py-4 lg:pl-0 lg:pr-1 lg:py-5"
      >
        <PullToRefreshIndicator {...pullToRefresh} />
        <div className="w-full space-y-5 sm:space-y-6">{children}</div>
      </div>
    </div>
  );
}
