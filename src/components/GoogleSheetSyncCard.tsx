'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Link2, RefreshCw, Sheet, Unlink } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Admin.sheetSync');
  const tCommon = useTranslations('Common');
  const [blueprint, setBlueprint] = useState<SheetTabBlueprint[]>([]);
  const [loadingBlueprint, setLoadingBlueprint] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [manualSheetInput, setManualSheetInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
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
        title: t('loadFailedTitle'),
        description: err instanceof Error ? err.message : t('loadFailedDesc'),
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
      title: t('syncConfirmTitle'),
      description:
        createNew || !config?.googleSheetId
          ? t('syncConfirmCreateDesc')
          : t('syncConfirmOverwriteDesc', { sheetId: config.googleSheetId }),
      details: [
        { label: t('detailGoogleAccount'), value: workspace.email || t('connectedAccount') },
        {
          label: t('detailMode'),
          value: createNew || !config?.googleSheetId ? t('modeCreate') : t('modeOverwrite'),
        },
        { label: t('detailTabs'), value: blueprint.map((b) => b.sheetName).join(', ') || t('tabsFallback') },
      ],
      confirmLabel: t('syncConfirmBtn'),
      run: async () => {
        const token = getWorkspaceToken();
        if (!token) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('authRequiredTitle'),
            description: t('authRequiredDesc'),
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
            title: t('syncSuccessTitle'),
            description: t('syncSuccessDesc', {
              tabs: res.syncedTabs,
              sheetId: res.spreadsheetId,
            }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('syncFailedTitle'),
            description:
              err instanceof Error ? err.message : t('syncFailedDesc'),
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
      title: nextEnabled ? t('enableAutoTitle') : t('disableAutoTitle'),
      description: nextEnabled
        ? t('enableAutoDesc')
        : t('disableAutoDesc'),
      confirmLabel: nextEnabled ? t('enableAutoBtn') : t('disableAutoBtn'),
      run: async () => {
        try {
          await api.updateConfig({ autoSyncSheet: nextEnabled });
          await onSynced();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('prefUpdatedTitle'),
            description: nextEnabled
              ? t('enabledAutoDesc')
              : t('disabledAutoDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('prefFailedTitle'),
            description:
              err instanceof Error ? err.message : t('prefFailedDesc'),
          });
        }
      },
    });
  }

  function extractSheetId(raw: string): string {
    const trimmed = raw.trim();
    const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return urlMatch ? urlMatch[1] : trimmed;
  }

  function handleRequestLinkSheet() {
    const extracted = extractSheetId(manualSheetInput);
    if (!extracted || !/^[a-zA-Z0-9-_]{12,}$/.test(extracted)) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidIdTitle'),
        description: t('invalidIdDesc'),
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('linkConfirmTitle'),
      description: t('linkConfirmDesc'),
      details: [{ label: t('detailTargetSheet'), value: extracted }],
      confirmLabel: t('linkConfirmBtn'),
      run: async () => {
        await api.updateConfig({ googleSheetId: extracted });
        setManualSheetInput('');
        setShowLinkInput(false);
        await onSynced();
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: t('linkedTitle'),
          description: t('linkedDesc', { sheetId: extracted }),
        });
      },
    });
  }

  function handleRequestUnlinkSheet() {
    if (!config?.googleSheetId) return;
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('unlinkConfirmTitle'),
      description: t('unlinkConfirmDesc'),
      details: [{ label: t('detailCurrentSheet'), value: config.googleSheetId }],
      confirmLabel: t('unlinkConfirmBtn'),
      run: async () => {
        await api.updateConfig({ googleSheetId: '' });
        await onSynced();
        setModal({
          mode: 'notice',
          tone: 'amber',
          title: t('unlinkedTitle'),
          description: t('unlinkedDesc'),
        });
      },
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="amanah-card-teal border rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Sheet className="w-4 h-4" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {t('title')}
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
              <th className="py-2.5 px-4">{t('colSheetTab')}</th>
              <th className="py-2.5 px-4">{t('colColumns')}</th>
              <th className="py-2.5 px-4 text-right">{t('colRowsReady')}</th>
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
                    {t('recordsCount', { count: Math.max(0, tab.rows.length - 1) })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sync Status & Actions */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t('linkedSheetLabel')}</span>
              {config?.googleSheetId ? (
                <>
                  {config.googleSheetUrl ? (
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
                    <span className="font-mono text-emerald-700 dark:text-emerald-400">
                      {config.googleSheetId}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRequestUnlinkSheet}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 text-[11px] font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Unlink className="w-3 h-3" aria-hidden="true" />
                    <span>{t('unlinkBtn')}</span>
                  </button>
                </>
              ) : (
                <span className="text-slate-600 dark:text-slate-300">
                  {t('notLinkedYet')}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowLinkInput((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Link2 className="w-3 h-3" aria-hidden="true" />
                <span>{showLinkInput ? tCommon('cancel') : t('setSheetIdBtn')}</span>
              </button>
            </div>
            <div>
              {t('lastSyncedLabel')}{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {config?.lastSheetSyncAt ? formatDateTime(config.lastSheetSyncAt) : t('never')}
              </span>
            </div>
          </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config?.autoSyncSheet)}
              onChange={handleToggleAutoSync}
              className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
            />
            <span>{t('autoSyncLabel')}</span>
          </label>

          {config?.googleSheetId && (
            <button
              type="button"
              disabled={!workspace.connected || syncing}
              onClick={() => requestSync(true)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {t('createNewSheetBtn')}
            </button>
          )}

          <a
            href={api.getBackupJsonUrl()}
            download
            className="px-3.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('downloadBackupBtn')}</span>
          </a>

          <button
            type="button"
            disabled={!workspace.connected || syncing}
            onClick={() => requestSync(!config?.googleSheetId)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{config?.googleSheetId ? t('syncBlueprintBtn') : t('createSyncBtn')}</span>
          </button>
        </div>
        </div>

        {showLinkInput && (
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={manualSheetInput}
              onChange={(e) => setManualSheetInput(e.target.value)}
              placeholder={t('manualInputPlaceholder')}
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={handleRequestLinkSheet}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              {t('saveLinkedIdBtn')}
            </button>
          </div>
        )}
      </div>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
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
