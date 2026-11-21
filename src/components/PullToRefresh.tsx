'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { triggerHaptic } from '../utils/haptics.ts';

const PULL_THRESHOLD = 62;
const MAX_PULL = 96;
const REFRESH_REST_HEIGHT = 56;
const MIN_SPIN_MS = 550;

function hasScrollableParentBeforeRoot(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== root) {
    if (
      node.getAttribute('role') === 'dialog' ||
      node.dataset.ptrIgnore === 'true' ||
      node.tagName === 'INPUT' ||
      node.tagName === 'TEXTAREA' ||
      node.tagName === 'SELECT' ||
      node.isContentEditable
    ) {
      return true;
    }
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 2 &&
      node.scrollTop > 1
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export interface UsePullToRefreshOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  onRefresh: () => Promise<unknown> | void;
  disabled?: boolean;
}

export interface PullToRefreshState {
  pullDistance: number;
  pullProgress: number;
  isPulling: boolean;
  isRefreshing: boolean;
  isReady: boolean;
}

export function usePullToRefresh({
  scrollRef,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let active = false;
    let lockedPull = false;
    let reachedThreshold = false;
    let startX = 0;
    let startY = 0;

    const resetGesture = () => {
      active = false;
      lockedPull = false;
      reachedThreshold = false;
      setIsPulling(false);
      if (!isRefreshingRef.current) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current || isRefreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (document.body.style.overflow === 'hidden') return;
      if (el.scrollTop > 1) return;
      if (hasScrollableParentBeforeRoot(e.target, el)) return;

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      active = true;
      lockedPull = false;
      reachedThreshold = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || isRefreshingRef.current || disabledRef.current) return;
      if (e.touches.length !== 1) {
        resetGesture();
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!lockedPull) {
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.9) {
          active = false;
          return;
        }
        if (dy > 8 && el.scrollTop <= 1) {
          lockedPull = true;
          setIsPulling(true);
        } else {
          return;
        }
      }

      if (el.scrollTop > 1) {
        resetGesture();
        return;
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const damped = MAX_PULL * (1 - Math.exp(-Math.max(0, dy - 8) / 145));
      const nowReady = damped >= PULL_THRESHOLD;
      if (nowReady && !reachedThreshold) {
        triggerHaptic('pullReady');
      }
      reachedThreshold = nowReady;

      if (Math.abs(damped - pullDistanceRef.current) >= 0.5) {
        pullDistanceRef.current = damped;
        setPullDistance(damped);
      }
    };

    const onTouchEnd = () => {
      if (!active) return;
      const wasPulling = lockedPull;
      const distance = pullDistanceRef.current;
      active = false;
      lockedPull = false;
      reachedThreshold = false;
      setIsPulling(false);

      if (!wasPulling) return;

      if (distance >= PULL_THRESHOLD && !isRefreshingRef.current) {
        triggerHaptic('selection');
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        pullDistanceRef.current = REFRESH_REST_HEIGHT;
        setPullDistance(REFRESH_REST_HEIGHT);

        let refreshSucceeded = true;
        void Promise.all([
          Promise.resolve(onRefreshRef.current()).catch(() => {
            refreshSucceeded = false;
          }),
          new Promise<void>((resolve) => window.setTimeout(resolve, MIN_SPIN_MS)),
        ]).finally(() => {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
          if (refreshSucceeded) {
            triggerHaptic('success');
          }
        });
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef]);

  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD);
  return {
    pullDistance,
    pullProgress,
    isPulling,
    isRefreshing,
    isReady: pullDistance >= PULL_THRESHOLD,
  };
}

export function PullToRefreshIndicator({
  pullDistance,
  pullProgress,
  isPulling,
  isRefreshing,
  isReady,
}: PullToRefreshState) {
  const tCommon = useTranslations('Common');
  const visible = pullDistance > 1 || isRefreshing;
  const height = isRefreshing ? REFRESH_REST_HEIGHT : pullDistance;
  const opacity = isRefreshing ? 1 : Math.min(1, pullProgress * 1.15);
  const scale = isRefreshing ? 1 : 0.72 + 0.28 * pullProgress;

  return (
    <div
      aria-live="polite"
      aria-hidden={!visible}
      style={{
        height: `${height}px`,
        transition: isPulling
          ? 'none'
          : 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className="w-full overflow-hidden flex items-center justify-center pointer-events-none select-none shrink-0"
    >
      <div
        role={isRefreshing ? 'status' : undefined}
        aria-label={isRefreshing ? tCommon('loading') : tCommon('refreshPage')}
        style={{
          opacity,
          transform: `scale(${scale})`,
          transition: isPulling
            ? 'none'
            : 'opacity 200ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center border backdrop-blur-md transition-colors ${
          isReady || isRefreshing
            ? 'bg-white/95 dark:bg-[#02202D]/95 border-[#00684A]/35 dark:border-[#00ED64]/55 shadow-[0_6px_18px_-6px_rgba(0,104,74,0.3)] dark:shadow-[0_6px_20px_-6px_rgba(0,237,100,0.35)]'
            : 'bg-white/90 dark:bg-[#02202D]/90 border-[#00684A]/20 dark:border-[#00ED64]/30 shadow-[0_4px_12px_-6px_rgba(0,104,74,0.18)] dark:shadow-[0_4px_14px_-6px_rgba(0,0,0,0.55)]'
        }`}
      >
        {isRefreshing ? (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-emerald-500/15 dark:border-[#00ED64]/15 border-t-[#00684A] border-r-teal-500 dark:border-t-[#00ED64] dark:border-r-[#18E299] animate-spin"
            />
            <RefreshCw
              className="w-4 h-4 text-[#00684A] dark:text-[#00ED64] animate-spin"
              style={{ animationDuration: '1.15s' }}
              strokeWidth={2.1}
              aria-hidden="true"
            />
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              style={{
                background: `conic-gradient(currentColor ${Math.round(pullProgress * 360)}deg, transparent 0deg)`,
                WebkitMask:
                  'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
              }}
              className="absolute inset-0 rounded-full text-[#00684A]/70 dark:text-[#00ED64]/85"
            />
            <RefreshCw
              style={{
                transform: `rotate(${Math.round(pullProgress * 270)}deg)`,
              }}
              className={`w-4 h-4 transition-colors ${
                isReady
                  ? 'text-[#00684A] dark:text-[#00ED64]'
                  : 'text-slate-500 dark:text-slate-300'
              }`}
              strokeWidth={2}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </div>
  );
}
