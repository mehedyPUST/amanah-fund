'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { triggerHaptic } from '../utils/haptics.ts';
import { useCoopSession } from './AppProviders.tsx';

interface PWAUpdateButtonProps {
  compact?: boolean;
  fullWidth?: boolean;
  align?: 'center' | 'start';
  popoverAlign?: 'stretch' | 'left' | 'right';
  popoverPlacement?: 'top' | 'bottom';
  className?: string;
}

function formatLastCheckedLabel(timestampMs: number | null, fallback: string): string {
  if (!timestampMs) return fallback;
  try {
    return new Date(timestampMs).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Dhaka',
    });
  } catch {
    return fallback;
  }
}

export function PWAUpdateButton({
  compact = false,
  fullWidth = false,
  align = 'center',
  popoverAlign = 'stretch',
  popoverPlacement,
  className = '',
}: PWAUpdateButtonProps) {
  const tPwa = useTranslations('PWA');
  const tCommon = useTranslations('Common');
  const { pwaUpdate } = useCoopSession();
  const {
    updateAvailable,
    checkingUpdate,
    applyingUpdate,
    lastCheckedAt,
    statusMessage,
    checkForUpdates,
    applyUpdate,
  } = pwaUpdate;

  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [panelOpen]);

  async function handlePrimaryClick() {
    if (updateAvailable) {
      triggerHaptic('selection');
      await applyUpdate();
      return;
    }
    triggerHaptic('tap');
    setPanelOpen(true);
    await checkForUpdates(true);
    triggerHaptic('success');
  }

  const hasCustomDisplay = /\b(hidden|flex|inline-flex|block|inline-block|grid)\b/.test(className);
  const resolvedPlacement = popoverPlacement ?? (fullWidth ? 'top' : 'bottom');
  const popoverPositionClass = fullWidth
    ? `${resolvedPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${
        popoverAlign === 'left'
          ? 'left-0 w-[260px] max-w-[calc(84vw-1.5rem)]'
          : popoverAlign === 'right'
            ? 'right-0 w-[260px] max-w-[calc(84vw-1.5rem)]'
            : 'left-0 right-0'
      }`
    : `${resolvedPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 w-72`;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'w-full' : hasCustomDisplay ? '' : 'inline-flex'} ${className}`}
    >
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        disabled={checkingUpdate || applyingUpdate}
        title={updateAvailable ? tPwa('updateReadyMessage') : tPwa('autoCheckDesc')}
        aria-label={tPwa('updateApp')}
        aria-expanded={panelOpen}
        className={`relative inline-flex items-center ${
          align === 'start'
            ? fullWidth && compact
              ? 'justify-start gap-1.5'
              : 'justify-start gap-2'
            : 'justify-center gap-1.5'
        } border font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-70 ${
          fullWidth
            ? compact
              ? 'w-full min-h-[34px] py-1.5 px-2 rounded-xl text-[11px]'
              : 'w-full min-h-[40px] py-2 px-2.5 rounded-xl text-[13.5px]'
            : compact
              ? 'h-9 px-2.5 rounded-xl text-xs'
              : 'h-9 px-3 rounded-xl text-xs'
        } ${
          updateAvailable
            ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-xs'
            : 'border-teal-200 dark:border-teal-800/70 bg-teal-50/80 dark:bg-teal-950/40 hover:bg-teal-100/85 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300'
        }`}
      >
        {applyingUpdate || checkingUpdate ? (
          <Loader2
            className={`${fullWidth && !compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} animate-spin shrink-0`}
            aria-hidden="true"
          />
        ) : (
          <ArrowUpCircle
            className={`${fullWidth && !compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} shrink-0`}
            aria-hidden="true"
          />
        )}
        <span className={compact && !fullWidth ? 'hidden sm:inline' : 'truncate'}>
          {applyingUpdate
            ? tPwa('updating')
            : checkingUpdate
              ? tPwa('checking')
              : tPwa('updateApp')}
        </span>
        {updateAvailable && !applyingUpdate && (
          <span
            className="w-2 h-2 rounded-full bg-[#00ED64] ring-2 ring-[#00ED64]/35 shrink-0"
            aria-hidden="true"
          />
        )}
      </button>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label={tPwa('versionStatusTitle')}
            className={`absolute ${popoverPositionClass} z-[70] bg-white/95 dark:bg-[#001E2B]/96 backdrop-blur-xl border border-slate-200/85 dark:border-[#163948] ring-1 ring-inset ring-white/75 dark:ring-[#00ED64]/10 rounded-2xl p-3.5 shadow-[0_18px_44px_-14px_rgba(15,23,42,0.22)] space-y-2.5 text-left`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {updateAvailable ? (
                  <ArrowUpCircle
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {updateAvailable ? tPwa('updateReadyTitle') : tPwa('versionStatusTitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={tCommon('closeDialog')}
                className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {statusMessage ||
                (updateAvailable ? tPwa('updateReadyDesc') : tPwa('autoCheckDesc'))}
            </p>

            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 border-t border-slate-200/75 dark:border-slate-800 pt-2 flex flex-col gap-0.5">
              <span>{tPwa('autoCheckInterval')}</span>
              <span>
                {tPwa('lastChecked', {
                  time: formatLastCheckedLabel(lastCheckedAt, tPwa('notCheckedYet')),
                })}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('tap');
                  await checkForUpdates(true);
                  triggerHaptic('success');
                }}
                disabled={checkingUpdate || applyingUpdate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{tPwa('checkNow')}</span>
              </button>
              {updateAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    void applyUpdate();
                  }}
                  disabled={applyingUpdate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{applyingUpdate ? tPwa('updating') : tPwa('applyUpdate')}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
