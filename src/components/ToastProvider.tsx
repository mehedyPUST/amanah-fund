'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { triggerHaptic } from '../utils/haptics.ts';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: string;
  tone: ToastTone;
  durationMs: number;
  createdAt: number;
}

type ShorthandOptions = Omit<ToastOptions, 'title' | 'description' | 'tone'>;

export interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  success: (title: string, description?: string, options?: ShorthandOptions) => string;
  info: (title: string, description?: string, options?: ShorthandOptions) => string;
  warning: (title: string, description?: string, options?: ShorthandOptions) => string;
  error: (title: string, description?: string, options?: ShorthandOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_VISIBLE_TOASTS = 4;
const DEDUP_WINDOW_MS = 850;
const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4200,
  info: 4200,
  warning: 4800,
  error: 5800,
};

const ToastContext = createContext<ToastContextValue | null>(null);

const NOOP_TOAST_API: ToastContextValue = {
  toast: () => '',
  success: () => '',
  info: () => '',
  warning: () => '',
  error: () => '',
  dismiss: () => {},
  clear: () => {},
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_TOAST_API;
}

const TONE_STYLES: Record<
  ToastTone,
  {
    Icon: typeof CheckCircle2;
    borderClass: string;
    iconBoxClass: string;
    progressClass: string;
    actionClass: string;
  }
> = {
  success: {
    Icon: CheckCircle2,
    borderClass: 'border-emerald-200/90 dark:border-emerald-800/75',
    iconBoxClass:
      'bg-emerald-500/12 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 dark:border-emerald-400/25',
    progressClass: 'bg-emerald-600/80 dark:bg-emerald-400/80',
    actionClass:
      'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50',
  },
  info: {
    Icon: Info,
    borderClass: 'border-teal-200/90 dark:border-teal-800/75',
    iconBoxClass:
      'bg-teal-500/12 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/20 dark:border-teal-400/25',
    progressClass: 'bg-teal-600/80 dark:bg-teal-400/80',
    actionClass:
      'text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50',
  },
  warning: {
    Icon: AlertTriangle,
    borderClass: 'border-amber-200/90 dark:border-amber-800/75',
    iconBoxClass:
      'bg-amber-500/12 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/20 dark:border-amber-400/25',
    progressClass: 'bg-amber-500/85 dark:bg-amber-400/85',
    actionClass:
      'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50',
  },
  error: {
    Icon: XCircle,
    borderClass: 'border-rose-200/90 dark:border-rose-800/75',
    iconBoxClass:
      'bg-rose-500/12 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/20 dark:border-rose-400/25',
    progressClass: 'bg-rose-600/80 dark:bg-rose-400/80',
    actionClass:
      'text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50',
  },
};

function ToastCard({
  item,
  closeLabel,
  onDismiss,
}: {
  item: ToastItem;
  closeLabel: string;
  onDismiss: (id: string) => void;
}) {
  const toneStyle = TONE_STYLES[item.tone];
  const Icon = toneStyle.Icon;
  const sticky = item.durationMs <= 0;

  const [paused, setPaused] = useState(false);
  const [progressFrom, setProgressFrom] = useState(1);
  const [runDurationSec, setRunDurationSec] = useState(() =>
    Math.max(0.2, item.durationMs / 1000)
  );
  const remainingRef = useRef(item.durationMs);
  const startedAtRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (sticky) return;
    if (paused) {
      clearTimer();
      return;
    }

    startedAtRef.current = Date.now();
    const delay = Math.max(120, remainingRef.current);
    setRunDurationSec(delay / 1000);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onDismiss(item.id);
    }, delay);

    return clearTimer;
  }, [clearTimer, item.id, onDismiss, paused, sticky]);

  const handlePause = useCallback(() => {
    if (sticky || paused) return;
    const elapsed = Math.max(0, Date.now() - startedAtRef.current);
    const nextRemaining = Math.max(120, remainingRef.current - elapsed);
    remainingRef.current = nextRemaining;
    setProgressFrom(Math.min(1, Math.max(0, nextRemaining / item.durationMs)));
    setPaused(true);
  }, [item.durationMs, paused, sticky]);

  const handleResume = useCallback(() => {
    if (sticky || !paused) return;
    setPaused(false);
  }, [paused, sticky]);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (
        info.offset.x > 68 ||
        info.velocity.x > 300 ||
        info.offset.x < -68 ||
        info.velocity.x < -300
      ) {
        triggerHaptic('selection');
        onDismiss(item.id);
        return;
      }
      handleResume();
    },
    [handleResume, item.id, onDismiss]
  );

  const isAssertive = item.tone === 'error';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.14, ease: 'easeIn' } }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      drag="x"
      dragConstraints={{ left: -16, right: 220 }}
      dragElastic={{ left: 0.08, right: 0.45 }}
      dragSnapToOrigin
      onDragStart={handlePause}
      onDragEnd={handleDragEnd}
      onMouseEnter={handlePause}
      onMouseLeave={handleResume}
      onFocus={handlePause}
      onBlur={handleResume}
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border ${toneStyle.borderClass} bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-[0_14px_34px_-12px_rgba(15,23,42,0.22)] dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.65)] touch-pan-y select-none sm:select-text`}
    >
      <div className="p-3.5 pr-2.5 flex items-start gap-3">
        <span
          className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${toneStyle.iconBoxClass}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug">
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
              {item.description}
            </p>
          )}
          {item.action && (
            <button
              type="button"
              onClick={() => {
                const fn = item.action?.onClick;
                onDismiss(item.id);
                fn?.();
              }}
              className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${toneStyle.actionClass}`}
            >
              {item.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          data-no-haptic
          onClick={() => onDismiss(item.id)}
          aria-label={closeLabel}
          className="w-8 h-8 -mt-0.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {!sticky && (
        <motion.div
          aria-hidden="true"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: paused ? progressFrom : 0 }}
          transition={
            paused
              ? { duration: 0 }
              : { duration: runDurationSec, ease: 'linear' }
          }
          style={{ originX: 0 }}
          className={`h-[2.5px] w-full ${toneStyle.progressClass}`}
        />
      )}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const tCommon = useTranslations('Common');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seqRef = useRef(0);
  const lastDedupRef = useRef<{ key: string; id: string; at: number }>({
    key: '',
    id: '',
    at: 0,
  });

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const tone: ToastTone = options.tone || 'info';
    const title = options.title.trim();
    if (!title) return '';
    const description = options.description?.trim() || undefined;
    const durationMs =
      typeof options.durationMs === 'number'
        ? Math.max(0, options.durationMs)
        : DEFAULT_DURATIONS[tone];

    const now = Date.now();
    const dedupKey = `${tone}::${title}::${description || ''}`;
    if (
      lastDedupRef.current.key === dedupKey &&
      now - lastDedupRef.current.at < DEDUP_WINDOW_MS
    ) {
      return lastDedupRef.current.id;
    }

    seqRef.current += 1;
    const id = `amanah-toast-${now}-${seqRef.current}`;
    lastDedupRef.current = { key: dedupKey, id, at: now };

    if (tone === 'success') {
      triggerHaptic('success');
    } else if (tone === 'warning') {
      triggerHaptic('warning');
    } else if (tone === 'error') {
      triggerHaptic('error');
    } else {
      triggerHaptic('selection');
    }

    const nextItem: ToastItem = {
      id,
      title,
      description,
      tone,
      durationMs,
      action: options.action,
      createdAt: now,
    };

    setToasts((prev) => {
      const filtered = prev.filter(
        (existing) =>
          !(
            existing.tone === tone &&
            existing.title === title &&
            existing.description === description
          )
      );
      return [...filtered, nextItem].slice(-MAX_VISIBLE_TOASTS);
    });

    return id;
  }, []);

  const success = useCallback(
    (title: string, description?: string, options?: ShorthandOptions) =>
      toast({ ...options, title, description, tone: 'success' }),
    [toast]
  );

  const info = useCallback(
    (title: string, description?: string, options?: ShorthandOptions) =>
      toast({ ...options, title, description, tone: 'info' }),
    [toast]
  );

  const warning = useCallback(
    (title: string, description?: string, options?: ShorthandOptions) =>
      toast({ ...options, title, description, tone: 'warning' }),
    [toast]
  );

  const error = useCallback(
    (title: string, description?: string, options?: ShorthandOptions) =>
      toast({ ...options, title, description, tone: 'error' }),
    [toast]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success,
      info,
      warning,
      error,
      dismiss,
      clear,
    }),
    [toast, success, info, warning, error, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label={tCommon('notificationsRegionAria')}
        className="fixed z-[92] pointer-events-none inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-5 sm:w-[380px] lg:bottom-5 flex flex-col gap-2.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              closeLabel={tCommon('close')}
              onDismiss={dismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
