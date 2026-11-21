'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  RefreshCw,
  Sheet,
  Table2,
  Unlink,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { FundConfig } from '../types/coop.ts';
import {
  api,
  type GoogleSheetInspectResponse,
  type SheetTabBlueprint,
} from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import {
  clearWorkspaceToken,
  getFirebaseAuthorizedDomainsUrl,
  getWorkspaceFirebaseProjectId,
  getWorkspaceToken,
  isUnauthorizedDomainError,
  type WorkspaceSessionInfo,
} from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface GoogleSheetSyncCardProps {
  config: FundConfig | null;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onSynced: () => Promise<void>;
}

function isAuthExpiryError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('expired') || msg.includes('oauth access token');
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
  const { googleAuthError, clearGoogleAuthError } = useCoopSession();
  const [copiedHost, setCopiedHost] = useState(false);
  const [clientHostname, setClientHostname] = useState('');
  const [blueprint, setBlueprint] = useState<SheetTabBlueprint[]>([]);
  const [loadingBlueprint, setLoadingBlueprint] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [manualSheetInput, setManualSheetInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [inspectingLive, setInspectingLive] = useState(false);
  const [livePreview, setLivePreview] = useState<GoogleSheetInspectResponse | null>(null);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);
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

  const fetchBlueprint = useCallback(async () => {
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
  }, [t]);

  useEffect(() => {
    setClientHostname(window.location.hostname || '');
    void fetchBlueprint();
  }, [fetchBlueprint]);

  const inspectConnectedSheet = useCallback(
    async (tabName?: string) => {
      const token = getWorkspaceToken();
      if (!token || !config?.googleSheetId) return;
      setInspectingLive(true);
      setLivePreviewError(null);
      try {
        const res = await api.inspectGoogleSheet(token, {
          spreadsheetIdOrUrl: config.googleSheetId,
          sheetName: tabName,
          maxRows: 12,
        });
        setLivePreview(res);
      } catch (err) {
        if (isAuthExpiryError(err)) {
          clearWorkspaceToken();
        }
        setLivePreviewError(
          err instanceof Error ? err.message : 'Could not load live tabs from the connected Google Sheet.'
        );
      } finally {
        setInspectingLive(false);
      }
    },
    [config?.googleSheetId]
  );

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
        {
          label: t('detailTabs'),
          value: blueprint.map((b) => b.sheetName).join(', ') || t('tabsFallback'),
        },
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
          if (showLivePreview) {
            await inspectConnectedSheet('Balance_Sheet');
          }
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('syncSuccessTitle'),
            description: t('syncSuccessDesc', {
              tabs: res.syncedTabs,
              sheetId: res.spreadsheetTitle || res.spreadsheetId,
            }),
          });
        } catch (err) {
          if (isAuthExpiryError(err)) {
            clearWorkspaceToken();
          }
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('syncFailedTitle'),
            description: err instanceof Error ? err.message : t('syncFailedDesc'),
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
      description: nextEnabled ? t('enableAutoDesc') : t('disableAutoDesc'),
      confirmLabel: nextEnabled ? t('enableAutoBtn') : t('disableAutoBtn'),
      run: async () => {
        try {
          await api.updateConfig({ autoSyncSheet: nextEnabled });
          await onSynced();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('prefUpdatedTitle'),
            description: nextEnabled ? t('enabledAutoDesc') : t('disabledAutoDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('prefFailedTitle'),
            description: err instanceof Error ? err.message : t('prefFailedDesc'),
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

    const token = getWorkspaceToken();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('linkConfirmTitle'),
      description: token
        ? 'Amanah will verify your access via the Google Sheets API and link this spreadsheet to your cooperative settings.'
        : t('linkConfirmDesc'),
      details: [{ label: t('detailTargetSheet'), value: extracted }],
      confirmLabel: t('linkConfirmBtn'),
      run: async () => {
        try {
          const activeToken = getWorkspaceToken();
          if (activeToken) {
            const linked = await api.connectGoogleSheet(activeToken, extracted);
            setManualSheetInput('');
            setShowLinkInput(false);
            await onSynced();
            setModal({
              mode: 'notice',
              tone: 'emerald',
              title: t('linkedTitle'),
              description: t('linkedDesc', {
                sheetId: linked.title ? `${linked.title} (${linked.spreadsheetId})` : linked.spreadsheetId,
              }),
            });
          } else {
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
          }
        } catch (err) {
          if (isAuthExpiryError(err)) {
            clearWorkspaceToken();
          }
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('syncFailedTitle'),
            description: err instanceof Error ? err.message : t('syncFailedDesc'),
          });
        }
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
      details: [
        ...(config.googleSheetTitle
          ? [{ label: 'Spreadsheet', value: config.googleSheetTitle }]
          : []),
        { label: t('detailCurrentSheet'), value: config.googleSheetId },
      ],
      confirmLabel: t('unlinkConfirmBtn'),
      run: async () => {
        try {
          await api.disconnectGoogleSheet();
          setLivePreview(null);
          setShowLivePreview(false);
          await onSynced();
          setModal({
            mode: 'notice',
            tone: 'amber',
            title: t('unlinkedTitle'),
            description: t('unlinkedDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('syncFailedTitle'),
            description: err instanceof Error ? err.message : t('syncFailedDesc'),
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
      className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Sheet className="w-4 h-4" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('title')}</h3>
        </div>

        <GoogleSignInButton
          workspace={workspace}
          connecting={connectingGoogle}
          onConnect={() => void onConnectGoogle()}
          onDisconnect={() => void onDisconnectGoogle()}
        />
      </div>

      {googleAuthError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="leading-relaxed">{googleAuthError}</span>
            </div>
            <button
              type="button"
              onClick={clearGoogleAuthError}
              className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          {isUnauthorizedDomainError(googleAuthError) && Boolean(clientHostname) && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-rose-200/80 dark:border-rose-900/60">
              <span className="font-mono text-[11px] bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/80 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded">
                {clientHostname}
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(clientHostname).then(() => {
                    setCopiedHost(true);
                    window.setTimeout(() => setCopiedHost(false), 1800);
                  });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-100/60 dark:hover:bg-rose-950/50 cursor-pointer"
              >
                {copiedHost ? (
                  <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{copiedHost ? 'Copied Domain' : 'Copy Domain'}</span>
              </button>
              <a
                href={getFirebaseAuthorizedDomainsUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-semibold transition-colors"
              >
                <span>Authorize in Firebase ({getWorkspaceFirebaseProjectId()})</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* 8-Tab Blueprint Summary Strip (includes live Balance_Sheet) */}
      <div className="overflow-x-auto border border-slate-200/85 dark:border-slate-800/85 bg-white/55 dark:bg-slate-950/35 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-2.5 px-4">{t('colSheetTab')}</th>
              <th className="py-2.5 px-4">{t('colColumns')}</th>
              <th className="py-2.5 px-4 text-right">{t('colRowsReady')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loadingBlueprint
              ? [1, 2, 3, 4].map((i) => (
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
              : blueprint.map((tab) => (
                  <tr
                    key={tab.sheetName}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
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
                ))}
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
                  <a
                    href={
                      config.googleSheetUrl ||
                      `https://docs.google.com/spreadsheets/d/${config.googleSheetId}/edit`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <span>
                      {config.googleSheetTitle
                        ? `${config.googleSheetTitle} (${config.googleSheetId})`
                        : config.googleSheetId}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                  {workspace.connected && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showLivePreview;
                        setShowLivePreview(next);
                        if (next) void inspectConnectedSheet();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/70 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" aria-hidden="true" />
                      <span>{showLivePreview ? 'Hide Live Sheet' : 'Preview Live Sheet'}</span>
                    </button>
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
                <span className="text-slate-600 dark:text-slate-300">{t('notLinkedYet')}</span>
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
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {t('createNewSheetBtn')}
              </button>
            )}

            <a
              href={api.getBackupJsonUrl()}
              download
              className="px-3.5 py-2 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/80 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-700 dark:text-teal-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('downloadBackupBtn')}</span>
            </a>

            <button
              type="button"
              disabled={!workspace.connected || syncing}
              onClick={() => requestSync(!config?.googleSheetId)}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{config?.googleSheetId ? t('syncBlueprintBtn') : t('createSyncBtn')}</span>
            </button>
          </div>
        </div>

        {showLinkInput && (
          <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={manualSheetInput}
              onChange={(e) => setManualSheetInput(e.target.value)}
              placeholder={t('manualInputPlaceholder')}
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
            <button
              type="button"
              onClick={handleRequestLinkSheet}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap transition-colors"
            >
              {t('saveLinkedIdBtn')}
            </button>
          </div>
        )}

        {showLivePreview && workspace.connected && config?.googleSheetId && (
          <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/95 dark:bg-slate-950/85 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Table2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Live Connected Sheet ({livePreview?.title || config.googleSheetTitle || config.googleSheetId})</span>
              </div>
              {livePreview && livePreview.sheets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {livePreview.sheets.map((tab) => (
                    <button
                      key={tab.sheetId}
                      type="button"
                      disabled={inspectingLive}
                      onClick={() => void inspectConnectedSheet(tab.title)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                        livePreview.previewTab === tab.title
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {livePreviewError ? (
              <div className="p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{livePreviewError}</span>
              </div>
            ) : inspectingLive && !livePreview ? (
              <div className="p-4 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" aria-hidden="true" />
                <span>Loading live rows from Google Sheets…</span>
              </div>
            ) : livePreview && livePreview.previewRows.length > 0 ? (
              <div className="overflow-x-auto max-h-52">
                <table className="w-full text-left border-collapse text-[11px]">
                  <tbody>
                    {livePreview.previewRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          idx === 0
                            ? 'bg-slate-50 dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800'
                            : 'border-b border-slate-100 dark:border-slate-800/60 text-slate-600 dark:text-slate-300'
                        }
                      >
                        {row.slice(0, 10).map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-2.5 py-1.5 font-mono whitespace-nowrap max-w-[180px] truncate"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 text-xs text-slate-500">
                Selected tab is empty. Click Sync to populate live ledger rows.
              </div>
            )}
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
