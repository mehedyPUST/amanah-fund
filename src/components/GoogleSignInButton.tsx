'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { CheckCircle2, Loader2, LogOut } from 'lucide-react';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';

interface GoogleSignInButtonProps {
  workspace: WorkspaceSessionInfo;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  compact?: boolean;
}

export function GoogleSignInButton({
  workspace,
  connecting,
  onConnect,
  onDisconnect,
  compact = false,
}: GoogleSignInButtonProps) {
  const t = useTranslations('Common.googleWorkspace');

  if (workspace.connected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200">
          <CheckCircle2
            className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          <span className="truncate max-w-[220px]">
            {!compact && <span className="text-slate-500 dark:text-slate-400">{t('connectedAs')} </span>}
            <strong className="font-semibold text-slate-900 dark:text-white">{workspace.email}</strong>
          </span>
        </span>
        <button
          type="button"
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 dark:hover:border-rose-800/60 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{t('disconnect')}</span>
        </button>
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onConnect}
      disabled={connecting}
      className={`inline-flex items-center justify-center border border-[#747775] dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-[#f8fafd] dark:hover:bg-slate-800 text-[#1f1f1f] dark:text-slate-100 font-medium tracking-[0.01em] shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
        compact
          ? 'gap-1.5 h-8 px-2.5 rounded-lg text-[11.5px]'
          : 'gap-2.5 h-10 px-4 rounded-xl text-sm'
      }`}
    >
      {connecting ? (
        <Loader2
          className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[#1a73e8] animate-spin shrink-0`}
          aria-hidden="true"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`${
            compact ? 'w-4 h-4 text-[11px]' : 'w-5 h-5 text-[13px]'
          } rounded-full bg-white border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center font-bold leading-none select-none shrink-0`}
          style={{
            backgroundImage:
              'linear-gradient(135deg, #4285F4 0%, #34A853 40%, #FBBC05 70%, #EA4335 100%)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}
        >
          G
        </span>
      )}
      <span>{connecting ? t('connecting') : t('connect')}</span>
    </motion.button>
  );
}
