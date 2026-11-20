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
      await applyUpdate();
      return;
    }
    setPanelOpen(true);
    await checkForUpdates(true);
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
          align === 'start' ? 'justify-start gap-2.5' : 'justify-center gap-1.5'
        } border font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-70 ${
          fullWidth
            ? 'w-full min-h-[38px] py-2 px-3 rounded-xl text-xs'
            : compact
              ? 'h-9 px-2.5 rounded-lg text-xs'
              : 'h-9 px-3 rounded-lg text-xs'
        } ${
          updateAvailable
            ? 'border-emerald-500/80 dark:border-emerald-400/70 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
            : 'border-violet-300/80 dark:border-violet-500/35 bg-violet-50/75 dark:bg-violet-950/35 hover:bg-violet-100/85 dark:hover:bg-violet-950/60 text-violet-700 dark:text-violet-300'
        }`}
      >
        {applyingUpdate || checkingUpdate ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
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
            className="w-2 h-2 rounded-full bg-amber-300 animate-pulse shrink-0"
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
            className={`absolute ${popoverPositionClass} z-[70] amanah-card-violet border rounded-xl p-3.5 shadow-xl space-y-2.5 text-left`}
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
                    className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0"
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
                onClick={() => void checkForUpdates(true)}
                disabled={checkingUpdate || applyingUpdate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
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
                  onClick={() => void applyUpdate()}
                  disabled={applyingUpdate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
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
