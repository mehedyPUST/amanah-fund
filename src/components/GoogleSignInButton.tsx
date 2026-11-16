'use client';

import { motion } from 'motion/react';
import { CheckCircle2, Globe, Loader2 } from 'lucide-react';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';

interface GoogleSignInButtonProps {
  workspace: WorkspaceSessionInfo;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function GoogleSignInButton({
  workspace,
  connecting,
  onConnect,
  onDisconnect,
}: GoogleSignInButtonProps) {
  if (workspace.connected) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>
            Google Workspace:{' '}
            <strong className="font-medium text-slate-900 dark:text-white">{workspace.email}</strong>
          </span>
        </span>
        <button
          type="button"
          onClick={onDisconnect}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 dark:hover:border-rose-800/60 transition-colors cursor-pointer"
        >
          Disconnect Google
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
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-teal-200 dark:border-teal-800/70 bg-white dark:bg-slate-950 hover:bg-teal-50/70 dark:hover:bg-teal-950/30 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-2xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
    >
      {connecting ? (
        <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        <Globe className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
      )}
      <span>{connecting ? 'Connecting Google…' : 'Sign in with Google'}</span>
    </motion.button>
  );
}
