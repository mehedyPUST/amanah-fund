import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Sheet, ShieldAlert } from 'lucide-react';
import type { FundConfig } from '../types/coop.ts';
import { api, type SheetTabBlueprint } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { getWorkspaceToken, type WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createNewSheet, setCreateNewSheet] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchBlueprint() {
    setLoadingBlueprint(true);
    try {
      const res = await api.getBlueprint();
      setBlueprint(res.tabs);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load Google Sheet blueprint.',
      });
    } finally {
      setLoadingBlueprint(false);
    }
  }

  useEffect(() => {
    void fetchBlueprint();
  }, []);

  async function executeSync() {
    const token = getWorkspaceToken();
    if (!token) {
      setMessage({
        type: 'error',
        text: 'Please connect your Google Workspace account first to authorize Sheets sync.',
      });
      setConfirmOpen(false);
      return;
    }

    setSyncing(true);
    setMessage(null);
    try {
      const res = await api.syncGoogleSheet(token, {
        createNew: createNewSheet,
      });
      setConfirmOpen(false);
      setMessage({
        type: 'success',
        text: `Synchronized ${res.syncedTabs} blueprint tabs to Google Sheets (${res.spreadsheetId}).`,
      });
      await Promise.all([onSynced(), fetchBlueprint()]);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sheets synchronization failed.',
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleAutoSync() {
    if (!config) return;
    try {
      await api.updateConfig({ autoSyncSheet: !config.autoSyncSheet });
      await onSynced();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update auto-sync preference.',
      });
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Sheet className="w-4 h-4" aria-hidden="true" />
            <span>Google Sheets Blueprint Auto-Sync</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Live Cooperative Treasury Spreadsheet Blueprint
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Mirrors the live website database across 7 structured Google Sheets tabs: Fund Summary,
            Members, Contributions, Loans, Installments, Investment Placements, and Email
            Notifications.
          </p>
        </div>

        <GoogleSignInButton
          workspace={workspace}
          connecting={connectingGoogle}
          onConnect={() => void onConnectGoogle()}
          onDisconnect={() => void onDisconnectGoogle()}
        />
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 rounded-lg border text-xs font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

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
              <tr>
                <td colSpan={3} className="py-4 px-4 text-slate-400">
                  Building blueprint schema…
                </td>
              </tr>
            ) : (
              blueprint.map((tab) => (
                <tr key={tab.sheetName}>
                  <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                    {tab.sheetName}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                    {(tab.rows[0] || []).slice(0, 5).join(' · ')}
                    {(tab.rows[0] || []).length > 5 ? ' …' : ''}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
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
              onChange={() => void handleToggleAutoSync()}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Auto-sync on ledger changes (when Google connected)</span>
          </label>

          {config?.googleSheetId && (
            <button
              type="button"
              disabled={!workspace.connected || syncing}
              onClick={() => {
                setCreateNewSheet(true);
                setConfirmOpen(true);
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Create New Sheet
            </button>
          )}

          <button
            type="button"
            disabled={!workspace.connected || syncing}
            onClick={() => {
              setCreateNewSheet(!config?.googleSheetId);
              setConfirmOpen(true);
            }}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{config?.googleSheetId ? 'Sync Blueprint Now' : 'Create & Sync Google Sheet'}</span>
          </button>
        </div>
      </div>

      {/* Explicit Confirmation Modal before modifying Google Sheets */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sheet-sync-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <h4
                  id="confirm-sheet-sync-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Confirm Google Sheets Blueprint Synchronization
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {createNewSheet || !config?.googleSheetId
                    ? 'This will create a new Google Spreadsheet in your connected Google account and populate all 7 cooperative treasury blueprint tabs.'
                    : `This will clear and overwrite the 7 blueprint tabs inside spreadsheet ${config.googleSheetId} with current live treasury data.`}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div>
                Connected account: <span className="font-mono">{workspace.email}</span>
              </div>
              <div>
                Tabs to sync:{' '}
                <span className="font-mono">
                  {blueprint.map((b) => b.sheetName).join(', ')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={syncing}
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void executeSync()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                {syncing ? 'Synchronizing…' : 'Confirm & Sync to Google Sheets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
