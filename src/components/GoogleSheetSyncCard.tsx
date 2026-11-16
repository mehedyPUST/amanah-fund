'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Sheet } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { FundConfig } from '../types/coop.ts';
import { api, type SheetTabBlueprint } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface GoogleSheetSyncCardProps {
  config: FundConfig | null;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onSynced: () => Promise<void>;
}

export function GoogleSheetSyncCard({
  config,
  workspace,
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onSynced,
}: GoogleSheetSyncCardProps) {
  const [blueprint, setBlueprint] = useState<SheetTabBlueprint[]>([]);
  const [loadingBlueprint, setLoadingBlueprint] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [modal, setModal] = useState<
    | {
        mode: 'confirm';
        tone: 'emerald' | 'amber' | 'red';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
        confirmLabel: string;
        run: () => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
      }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);

  async function fetchBlueprint() {
    setLoadingBlueprint(true);
    try {
      const res = await api.getBlueprint();
      setBlueprint(res.tabs);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Blueprint Load Failed',
        description: err instanceof Error ? err.message : 'Could not load Google Sheet blueprint.',
      });
    } finally {
      setLoadingBlueprint(false);
    }
  }

  useEffect(() => {
    void fetchBlueprint();
  }, []);

  function requestSync(createNew: boolean) {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: 'Synchronize Google Sheets Blueprint?',
      description:
        createNew || !config?.googleSheetId
          ? 'This will create a new Google Spreadsheet in your connected Google account and populate all 7 cooperative treasury blueprint tabs.'
          : `This will clear and overwrite the 7 blueprint tabs inside spreadsheet ${config.googleSheetId} with current live treasury data.`,
      details: [
        { label: 'Google Account', value: workspace.email || 'Connected Account' },
        { label: 'Mode', value: createNew || !config?.googleSheetId ? 'Create New Spreadsheet' : 'Overwrite Linked Sheet' },
        { label: 'Tabs', value: blueprint.map((b) => b.sheetName).join(', ') || '7 Blueprint Tabs' },
      ],
      confirmLabel: 'Confirm & Sync to Google Sheets',
      run: async () => {
        const token = getWorkspaceToken();
        if (!token) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Google Authorization Required',
            description:
              'Please connect your Google Workspace account first to authorize Sheets sync.',
          });
          return;
        }

        setSyncing(true);
        try {
          const res = await api.syncGoogleSheet(token, { createNew });
          await Promise.all([onSynced(), fetchBlueprint()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Google Sheets Synchronized',
            description: `Synchronized ${res.syncedTabs} blueprint tabs to Google Sheets (${res.spreadsheetId}).`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Synchronization Failed',
            description:
              err instanceof Error ? err.message : 'Google Sheets synchronization failed.',
          });
        } finally {
          setSyncing(false);
        }
      },
    });
  }

  function handleToggleAutoSync() {
    if (!config) return;
    const nextEnabled = !config.autoSyncSheet;
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: nextEnabled ? 'Enable Google Sheets Auto-Sync?' : 'Disable Google Sheets Auto-Sync?',
      description: nextEnabled
        ? 'Future verified treasury updates will automatically mirror to your linked Google Sheet when connected.'
        : 'Automatic ledger mirroring to Google Sheets will be paused until re-enabled.',
      confirmLabel: nextEnabled ? 'Enable Auto-Sync' : 'Disable Auto-Sync',
      run: async () => {
        try {
          await api.updateConfig({ autoSyncSheet: nextEnabled });
          await onSynced();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Auto-Sync Preference Updated',
            description: nextEnabled
              ? 'Google Sheets blueprint auto-sync is now enabled.'
              : 'Google Sheets blueprint auto-sync is now disabled.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Preference Save Failed',
            description:
              err instanceof Error ? err.message : 'Could not update auto-sync preference.',
          });
        }
      },
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Sheet className="w-4 h-4" aria-hidden="true" />
            <span>Google Sheets Blueprint Auto-Sync</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Live Cooperative Treasury Spreadsheet Blueprint
          </h3>
        </div>

        <GoogleSignInButton
          workspace={workspace}
          connecting={connectingGoogle}
          onConnect={() => void onConnectGoogle()}
          onDisconnect={() => void onDisconnectGoogle()}
        />
      </div>

      {/* 7-Tab Blueprint Summary Strip */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
              <th className="py-2.5 px-4">Sheet Tab</th>
              <th className="py-2.5 px-4">Blueprint Columns</th>
              <th className="py-2.5 px-4 text-right">Rows Ready</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loadingBlueprint ? (
              [1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td className="py-2.5 px-4">
                    <Skeleton width={110} height={14} />
                  </td>
                  <td className="py-2.5 px-4">
                    <Skeleton width="80%" height={14} />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Skeleton width={68} height={14} />
                  </td>
                </tr>
              ))
            ) : (
              blueprint.map((tab) => (
                <tr key={tab.sheetName} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-semibold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                    {tab.sheetName}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                    {(tab.rows[0] || []).slice(0, 5).join(' · ')}
                    {(tab.rows[0] || []).length > 5 ? ' …' : ''}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                    {Math.max(0, tab.rows.length - 1)} records
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sync Status & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Linked Sheet:{' '}
            {config?.googleSheetUrl ? (
              <a
                href={config.googleSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                <span className="font-mono">{config.googleSheetId}</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            ) : (
              <span className="text-slate-600 dark:text-slate-300">
                Not created yet — click Sync to generate your linked spreadsheet
              </span>
            )}
          </div>
          <div>
            Last synced:{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {config?.lastSheetSyncAt ? formatDateTime(config.lastSheetSyncAt) : 'Never'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config?.autoSyncSheet)}
              onChange={handleToggleAutoSync}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Auto-sync on ledger changes (when Google connected)</span>
          </label>

          {config?.googleSheetId && (
            <button
              type="button"
              disabled={!workspace.connected || syncing}
              onClick={() => requestSync(true)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Create New Sheet
            </button>
          )}

          <button
            type="button"
            disabled={!workspace.connected || syncing}
            onClick={() => requestSync(!config?.googleSheetId)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{config?.googleSheetId ? 'Sync Blueprint Now' : 'Create & Sync Google Sheet'}</span>
          </button>
        </div>
      </div>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy || syncing}
        onConfirm={
          modal?.mode === 'confirm'
            ? async () => {
                setModalBusy(true);
                try {
                  await modal.run();
                } finally {
                  setModalBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!modalBusy && !syncing) setModal(null);
        }}
      />
    </motion.section>
  );
}
