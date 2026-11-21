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
    <div className="min-w-0 min-h-0 w-full flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-subtle pr-0.5 sm:pr-1.5 py-1 sm:py-1.5"
      >
        <PullToRefreshIndicator {...pullToRefresh} />
        <div className="w-full space-y-6 sm:space-y-8 pb-4">{children}</div>
      </div>
    </div>
  );
}
