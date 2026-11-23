'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowUp } from 'lucide-react';
import { queryKeys } from '../lib/queryKeys.ts';
import { PullToRefreshIndicator, usePullToRefresh } from './PullToRefresh.tsx';

export function PublicScrollViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tCommon = useTranslations('Common');
  const prefersReducedMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handlePublicRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.public.all });
    router.refresh();
  }, [queryClient, router]);

  const pullToRefresh = usePullToRefresh({
    scrollRef,
    onRefresh: handlePublicRefresh,
  });

  const updateBackToTopVisibility = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const heroEl = document.getElementById('overview');
    if (heroEl) {
      const containerRect = el.getBoundingClientRect();
      const heroRect = heroEl.getBoundingClientRect();
      const passedHero = heroRect.bottom <= containerRect.top + 48 && el.scrollTop > 120;
      setShowBackToTop(passedHero);
      return;
    }
    setShowBackToTop(el.scrollTop > 380);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateBackToTopVisibility();
    el.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateBackToTopVisibility())
        : null;
    resizeObserver?.observe(el);

    return () => {
      el.removeEventListener('scroll', updateBackToTopVisibility);
      resizeObserver?.disconnect();
    };
  }, [pathname, updateBackToTopVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
        return;
      }
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setShowBackToTop(false);
  }, [pathname, prefersReducedMotion]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [prefersReducedMotion]);

  return (
    <div className="relative min-w-0 min-h-0 w-full flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-subtle pr-0.5 sm:pr-1.5 py-1 sm:py-1.5"
      >
        <PullToRefreshIndicator {...pullToRefresh} />
        <div
          key={pathname}
          className="w-full space-y-6 sm:space-y-8 pb-4 animate__animated animate__fadeInUp animate__faster"
        >
          {children}
        </div>
      </div>

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            type="button"
            onClick={scrollToTop}
            aria-label={tCommon('backToTop')}
            title={tCommon('backToTop')}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-4 sm:right-6 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border border-slate-200/90 dark:border-slate-700/85 bg-white/92 dark:bg-slate-900/92 backdrop-blur-xl text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-[0_12px_32px_-10px_rgba(15,23,42,0.28)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.65)] hover:border-emerald-500/70 dark:hover:border-emerald-400/60 hover:text-emerald-700 dark:hover:text-emerald-300 hover:-translate-y-0.5 active:scale-[0.97] transition-[border-color,color,transform,box-shadow] duration-200 cursor-pointer"
          >
            <span className="w-6 h-6 rounded-xl bg-emerald-600/12 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline whitespace-nowrap">{tCommon('backToTop')}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
