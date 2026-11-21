'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FilePlus2,
  Link2,
  Loader2,
  RefreshCw,
  Sheet,
  Table2,
  Unlink,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface GoogleSheetConnectModalProps {
  open: boolean;
  month: string;
  monthLabel: string;
  config: FundConfig | null;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  googleAuthError?: string | null;
  onClearGoogleAuthError?: () => void;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onConfigUpdated: () => Promise<void>;
  onClose: () => void;
}

function extractSheetIdClient(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const candidate = match ? match[1] : trimmed;
  return /^[a-zA-Z0-9-_]{12,}$/.test(candidate) ? candidate : '';
}

function isAuthExpiryError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('expired') || msg.includes('oauth access token');
}

export function GoogleSheetConnectModal({
  open,
  month,
  monthLabel,
  config,
  workspace,
  connectingGoogle,
  googleAuthError,
  onClearGoogleAuthError,
  onConnectGoogle,
  onDisconnectGoogle,
  onConfigUpdated,
  onClose,
}: GoogleSheetConnectModalProps) {
  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('GoogleSheetConnectModal');
  }
  const [mounted, setMounted] = useState(false);
  const [sheetInput, setSheetInput] = useState('');
  const [switchingSheet, setSwitchingSheet] = useState(false);
  const [blueprint, setBlueprint] = useState<SheetTabBlueprint[]>([]);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);

  const [inspectingCandidate, setInspectingCandidate] = useState(false);
  const [candidatePreview, setCandidatePreview] = useState<GoogleSheetInspectResponse | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const [inspectingLinked, setInspectingLinked] = useState(false);
  const [linkedPreview, setLinkedPreview] = useState<GoogleSheetInspectResponse | null>(null);
  const [linkedInspectError, setLinkedInspectError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const [actionModal, setActionModal] = useState<
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    return registerTopModal(modalTokenRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (actionModal !== null || confirmBusy || syncing) return;
      if (!modalTokenRef.current || !isTopModal(modalTokenRef.current)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, actionModal, confirmBusy, syncing, onClose]);

  const loadBlueprint = useCallback(async () => {
    setLoadingBlueprint(true);
    try {
      const res = await api.getBlueprint(month);
      setBlueprint(res.tabs);
    } catch {
      // non-fatal preview metadata
    } finally {
      setLoadingBlueprint(false);
    }
  }, [month]);

  const inspectLinkedSheet = useCallback(
    async (tabName?: string) => {
      const token = getWorkspaceToken();
      if (!token || !config?.googleSheetId) return;
      setInspectingLinked(true);
      setLinkedInspectError(null);
      try {
        const res = await api.inspectGoogleSheet(token, {
          spreadsheetIdOrUrl: config.googleSheetId,
          sheetName: tabName,
          maxRows: 15,
        });
        setLinkedPreview(res);
      } catch (err) {
        if (isAuthExpiryError(err)) {
          clearWorkspaceToken();
        }
        setLinkedInspectError(
          err instanceof Error ? err.message : 'Could not load live rows from the connected Google Sheet.'
        );
      } finally {
        setInspectingLinked(false);
      }
    },
    [config?.googleSheetId]
  );

  useEffect(() => {
    if (!open) return;
    setCandidateError(null);
    setLinkedInspectError(null);
    void loadBlueprint();
  }, [open, loadBlueprint]);

  useEffect(() => {
    if (!open) return;
    if (workspace.connected && config?.googleSheetId) {
      void inspectLinkedSheet();
    } else if (!config?.googleSheetId) {
      setLinkedPreview(null);
    }
  }, [open, workspace.connected, config?.googleSheetId, inspectLinkedSheet]);

  const handleInspectCandidate = async (tabName?: string) => {
    const extracted = extractSheetIdClient(sheetInput);
    if (!extracted) {
      setCandidateError(
        'Enter a valid Google Sheet URL (https://docs.google.com/spreadsheets/d/...) or Spreadsheet ID.'
      );
      return;
    }
    const token = getWorkspaceToken();
    if (!token) {
      setCandidateError('Please sign in with Google above before verifying a Google Sheet.');
      return;
    }

    setInspectingCandidate(true);
    setCandidateError(null);
    try {
      const res = await api.inspectGoogleSheet(token, {
        spreadsheetIdOrUrl: extracted,
        sheetName: tabName,
        maxRows: 12,
      });
      setCandidatePreview(res);
    } catch (err) {
      if (isAuthExpiryError(err)) {
        clearWorkspaceToken();
      }
      setCandidatePreview(null);
      setCandidateError(
        err instanceof Error ? err.message : 'Could not verify access to that Google Sheet.'
      );
    } finally {
      setInspectingCandidate(false);
    }
  };

  const handleRequestConnectExisting = () => {
    const extracted = extractSheetIdClient(sheetInput);
    if (!extracted) {
      setCandidateError(
        'Enter a valid Google Sheet URL (https://docs.google.com/spreadsheets/d/...) or Spreadsheet ID.'
      );
      return;
    }
    const token = getWorkspaceToken();
    if (!token) {
      setCandidateError('Please sign in with Google first to verify and connect this sheet.');
      return;
    }

    const previewTitle =
      candidatePreview?.spreadsheetId === extracted ? candidatePreview.title : undefined;
    const previewTabs =
      candidatePreview?.spreadsheetId === extracted
        ? candidatePreview.sheets.map((s) => s.title).join(', ')
        : 'Will be verified via Google Sheets API';

    setActionModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Connect This Google Sheet?',
      description:
        'Amanah will verify your Google account access and link this spreadsheet to your cooperative Balance Sheet & Treasury. Existing data in the sheet will not be modified until you run a Sync.',
      details: [
        { label: 'Google Account', value: workspace.email || 'Connected Account' },
        ...(previewTitle ? [{ label: 'Spreadsheet Title', value: previewTitle }] : []),
        { label: 'Spreadsheet ID', value: extracted },
        { label: 'Existing Tabs', value: previewTabs },
      ],
      confirmLabel: 'Confirm & Connect Sheet',
      run: async () => {
        const currentToken = getWorkspaceToken();
        if (!currentToken) {
          setActionModal({
            mode: 'notice',
            tone: 'red',
            title: 'Google Sign-In Required',
            description: 'Your Google session expired. Please sign in with Google again.',
          });
          return;
        }
        try {
          const res = await api.connectGoogleSheet(currentToken, extracted);
          setSheetInput('');
          setCandidatePreview(null);
          setCandidateError(null);
          setSwitchingSheet(false);
          await onConfigUpdated();
          setActionModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Google Sheet Connected',
            description: `Connected "${res.title}" (${res.spreadsheetId}). You can now sync your ${monthLabel} Balance Sheet & ledger tabs whenever ready.`,
            details: [
              { label: 'Spreadsheet', value: res.title },
              {
                label: 'Detected Tabs',
                value: res.sheets.map((s) => s.title).join(', ') || 'Default tab',
              },
            ],
          });
        } catch (err) {
          if (isAuthExpiryError(err)) {
            clearWorkspaceToken();
          }
          setActionModal({
            mode: 'notice',
            tone: 'red',
            title: 'Connection Failed',
            description:
              err instanceof Error ? err.message : 'Could not connect this Google Sheet.',
          });
        }
      },
    });
  };

  const handleRequestSync = (createNew: boolean) => {
    const token = getWorkspaceToken();
    if (!token) {
      setActionModal({
        mode: 'notice',
        tone: 'red',
        title: 'Google Sign-In Required',
        description: 'Please sign in with Google first to authorize syncing to Google Sheets.',
      });
      return;
    }

    const willCreate = createNew || !config?.googleSheetId;
    const tabNames =
      blueprint.map((b) => b.sheetName).join(', ') ||
      'Balance_Sheet, Fund_Summary, Members, Contributions, Loans, Installments, Investment_Placements, Email_Notifications';

    setActionModal({
      mode: 'confirm',
      tone: 'amber',
      title: willCreate
        ? 'Create & Sync New Google Sheet?'
        : 'Sync Balance Sheet & Ledger to Google Sheet?',
      description: willCreate
        ? `This will create a brand-new Google Spreadsheet in your Google Drive (${workspace.email}) and populate ${blueprint.length || 8} live tabs starting with the ${monthLabel} Balance_Sheet.`
        : `This will clear and overwrite the ${blueprint.length || 8} Amanah ledger tabs (starting with ${monthLabel} Balance_Sheet) inside "${config?.googleSheetTitle || config?.googleSheetId}". Unrelated tabs you created in the spreadsheet will stay untouched.`,
      details: [
        { label: 'Google Account', value: workspace.email || 'Connected Account' },
        { label: 'Balance Sheet Period', value: `${monthLabel} (${month})` },
        {
          label: 'Target',
          value: willCreate
            ? 'New Spreadsheet in Google Drive'
            : `${config?.googleSheetTitle ? `${config.googleSheetTitle} · ` : ''}${config?.googleSheetId}`,
        },
        { label: 'Tabs Written', value: tabNames },
      ],
      confirmLabel: willCreate ? 'Create & Sync Google Sheet' : 'Confirm & Sync Now',
      run: async () => {
        const activeToken = getWorkspaceToken();
        if (!activeToken) {
          setActionModal({
            mode: 'notice',
            tone: 'red',
            title: 'Google Sign-In Required',
            description: 'Your Google session expired. Please sign in with Google again.',
          });
          return;
        }
        setSyncing(true);
        try {
          const res = await api.syncGoogleSheet(activeToken, {
            createNew: willCreate,
            month,
          });
          setSwitchingSheet(false);
          await onConfigUpdated();
          await inspectLinkedSheet('Balance_Sheet');
          setActionModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Google Sheet Synchronized',
            description: `Synced ${res.syncedTabs} tabs (including ${monthLabel} Balance_Sheet) to "${res.spreadsheetTitle || res.spreadsheetId}".`,
            details: [
              { label: 'Spreadsheet', value: res.spreadsheetTitle || res.spreadsheetId },
              { label: 'Sheet ID', value: res.spreadsheetId },
              { label: 'Period Synced', value: `${monthLabel} (${res.month || month})` },
            ],
          });
        } catch (err) {
          if (isAuthExpiryError(err)) {
            clearWorkspaceToken();
          }
          setActionModal({
            mode: 'notice',
            tone: 'red',
            title: 'Sync Failed',
            description:
              err instanceof Error ? err.message : 'Could not synchronize data to Google Sheets.',
          });
        } finally {
          setSyncing(false);
        }
      },
    });
  };

  const handleRequestUnlink = () => {
    if (!config?.googleSheetId) return;
    setActionModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Unlink Google Sheet?',
      description:
        'This disconnects the linked Google Sheet from Amanah settings. Your spreadsheet file in Google Drive will NOT be deleted or altered.',
      details: [
        ...(config.googleSheetTitle
          ? [{ label: 'Spreadsheet', value: config.googleSheetTitle }]
          : []),
        { label: 'Sheet ID', value: config.googleSheetId },
      ],
      confirmLabel: 'Unlink Google Sheet',
      run: async () => {
        try {
          await api.disconnectGoogleSheet();
          setLinkedPreview(null);
          setSwitchingSheet(false);
          await onConfigUpdated();
          setActionModal({
            mode: 'notice',
            tone: 'amber',
            title: 'Google Sheet Unlinked',
            description: 'Removed the linked Google Sheet from cooperative settings.',
          });
        } catch (err) {
          setActionModal({
            mode: 'notice',
            tone: 'red',
            title: 'Unlink Failed',
            description:
              err instanceof Error ? err.message : 'Could not unlink the Google Sheet.',
          });
        }
      },
    });
  };

  if (!mounted) return null;

  const hasLinkedSheet = Boolean(config?.googleSheetId);
  const showConnectForm = !hasLinkedSheet || switchingSheet;
  const linkedUrl =
    config?.googleSheetUrl ||
    (config?.googleSheetId
      ? `https://docs.google.com/spreadsheets/d/${config.googleSheetId}/edit`
      : '');

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              if (!actionModal && !confirmBusy && !syncing) onClose();
            }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="google-sheet-modal-title"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/80 dark:ring-white/10 bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)] overflow-hidden my-auto"
            >
              {/* Header */}
              <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-950/80">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white inline-flex items-center justify-center shadow-xs shrink-0">
                    <Sheet className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2
                      id="google-sheet-modal-title"
                      className="text-base font-bold text-slate-900 dark:text-white truncate"
                    >
                      Google Sheets Integration
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Connect an existing Google Sheet or create a live workbook for{' '}
                      <strong className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {monthLabel}
                      </strong>{' '}
                      Balance Sheet &amp; Treasury
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Google Sheets dialog"
                  className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Step 1: Google Account Auth */}
                <div className="rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Step 1 · Google Account
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {workspace.connected
                          ? 'Authorized to inspect, link, and sync Google Spreadsheets.'
                          : 'Sign in with Google to authorize Google Sheets access for your cooperative.'}
                      </p>
                    </div>
                    <GoogleSignInButton
                      workspace={workspace}
                      connecting={connectingGoogle}
                      onConnect={() => void onConnectGoogle()}
                      onDisconnect={() => void onDisconnectGoogle()}
                      compact
                    />
                  </div>

                  {googleAuthError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span className="leading-relaxed">{googleAuthError}</span>
                        </div>
                        {onClearGoogleAuthError && (
                          <button
                            type="button"
                            onClick={onClearGoogleAuthError}
                            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 cursor-pointer shrink-0"
                            aria-label="Dismiss error"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {isUnauthorizedDomainError(googleAuthError) &&
                        typeof window !== 'undefined' && (
                          <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-rose-200/80 dark:border-rose-900/60">
                            <span className="font-mono text-[11px] bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/80 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded">
                              {window.location.hostname}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  ?.writeText(window.location.hostname)
                                  .then(() => {
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
                              <span>
                                Authorize in Firebase ({getWorkspaceFirebaseProjectId()})
                              </span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Step 2A: Currently Connected Google Sheet */}
                {hasLinkedSheet && (
                  <div className="rounded-2xl border border-emerald-200/85 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>Connected Google Sheet</span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {linkedPreview?.title ||
                            config?.googleSheetTitle ||
                            'Linked Cooperative Google Sheet'}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-mono text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded">
                            {config?.googleSheetId}
                          </span>
                          <span>
                            Last synced:{' '}
                            <strong className="font-mono text-slate-800 dark:text-slate-200">
                              {config?.lastSheetSyncAt
                                ? formatDateTime(config.lastSheetSyncAt)
                                : 'Not synced yet'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {linkedUrl && (
                          <a
                            href={linkedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors whitespace-nowrap"
                          >
                            <span>Open Sheet</span>
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSwitchingSheet((v) => !v);
                            setCandidateError(null);
                          }}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{switchingSheet ? 'Cancel Switch' : 'Switch Sheet'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRequestUnlink}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-900 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Unlink</span>
                        </button>
                      </div>
                    </div>

                    {/* Primary Sync Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-emerald-200/70 dark:border-emerald-900/50">
                      <button
                        type="button"
                        disabled={!workspace.connected || syncing}
                        onClick={() => handleRequestSync(false)}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>Sync {monthLabel} Balance Sheet &amp; Ledger</span>
                      </button>

                      <button
                        type="button"
                        disabled={!workspace.connected || syncing}
                        onClick={() => handleRequestSync(true)}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Create New Sheet</span>
                      </button>

                      {workspace.connected && (
                        <button
                          type="button"
                          disabled={inspectingLinked}
                          onClick={() => void inspectLinkedSheet(linkedPreview?.previewTab)}
                          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap transition-colors"
                        >
                          {inspectingLinked ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>Refresh Live Preview</span>
                        </button>
                      )}
                    </div>

                    {/* Live Sheet Preview Grid */}
                    {workspace.connected && (
                      <div className="rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white dark:bg-slate-950 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                            <Table2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span>Live Google Sheet Tabs</span>
                          </div>
                          {linkedPreview && linkedPreview.sheets.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {linkedPreview.sheets.map((tab) => (
                                <button
                                  key={tab.sheetId}
                                  type="button"
                                  disabled={inspectingLinked}
                                  onClick={() => void inspectLinkedSheet(tab.title)}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                                    linkedPreview.previewTab === tab.title
                                      ? 'bg-emerald-600 text-white font-semibold'
                                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {tab.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {linkedInspectError ? (
                          <div className="p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{linkedInspectError}</span>
                          </div>
                        ) : inspectingLinked && !linkedPreview ? (
                          <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" aria-hidden="true" />
                            <span>Reading live spreadsheet metadata &amp; rows…</span>
                          </div>
                        ) : linkedPreview && linkedPreview.previewRows.length > 0 ? (
                          <div className="overflow-x-auto max-h-56">
                            <table className="w-full text-left border-collapse text-[11px]">
                              <tbody>
                                {linkedPreview.previewRows.map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={
                                      rIdx === 0
                                        ? 'bg-slate-50 dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 sticky top-0'
                                        : 'border-b border-slate-100 dark:border-slate-800/70 text-slate-600 dark:text-slate-300'
                                    }
                                  >
                                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400 bg-slate-50/70 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 w-7 text-center">
                                      {rIdx + 1}
                                    </td>
                                    {row.slice(0, 10).map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="px-2.5 py-1.5 border-r border-slate-100 dark:border-slate-800/60 whitespace-nowrap max-w-[180px] truncate font-mono"
                                        title={cell}
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
                          <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                            {linkedPreview
                              ? `Tab "${linkedPreview.previewTab}" is currently empty. Click "Sync ${monthLabel} Balance Sheet & Ledger" above to populate it.`
                              : 'Sign in with Google to inspect live tabs from your connected spreadsheet.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2B: Connect Existing Sheet OR Create New Sheet */}
                {showConnectForm && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* Connect Existing */}
                    <div className="md:col-span-7 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 p-4 space-y-3 bg-white dark:bg-slate-950">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          Option A · Existing Spreadsheet
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                          Connect an Existing Google Sheet
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Paste the full Google Sheets link or Spreadsheet ID. We will verify access
                          and preview its tabs before connecting.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="text"
                          value={sheetInput}
                          onChange={(e) => {
                            setSheetInput(e.target.value);
                            setCandidateError(null);
                          }}
                          placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                          className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                        />

                        {candidateError && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{candidateError}</span>
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={!workspace.connected || inspectingCandidate || !sheetInput.trim()}
                            onClick={() => void handleInspectCandidate()}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap transition-colors"
                          >
                            {inspectingCandidate ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>Verify &amp; Preview</span>
                          </button>

                          <button
                            type="button"
                            disabled={!workspace.connected || !sheetInput.trim()}
                            onClick={handleRequestConnectExisting}
                            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Connect Sheet</span>
                          </button>
                        </div>
                      </div>

                      {candidatePreview && (
                        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 truncate">
                                ✓ Verified: {candidatePreview.title}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                {candidatePreview.sheets.length} tab
                                {candidatePreview.sheets.length === 1 ? '' : 's'} detected
                              </div>
                            </div>
                            <a
                              href={candidatePreview.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 shrink-0"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {candidatePreview.sheets.map((tab) => (
                              <button
                                key={tab.sheetId}
                                type="button"
                                onClick={() => void handleInspectCandidate(tab.title)}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                                  candidatePreview.previewTab === tab.title
                                    ? 'bg-emerald-600 text-white font-semibold'
                                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {tab.title}
                              </button>
                            ))}
                          </div>

                          {candidatePreview.previewRows.length > 0 && (
                            <div className="overflow-x-auto max-h-32 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                              <table className="w-full text-left border-collapse text-[11px]">
                                <tbody>
                                  {candidatePreview.previewRows.slice(0, 6).map((row, idx) => (
                                    <tr
                                      key={idx}
                                      className={
                                        idx === 0
                                          ? 'bg-slate-50 dark:bg-slate-900 font-semibold border-b border-slate-200 dark:border-slate-800'
                                          : 'border-b border-slate-100 dark:border-slate-800/60'
                                      }
                                    >
                                      {row.slice(0, 6).map((cell, ci) => (
                                        <td
                                          key={ci}
                                          className="px-2 py-1 font-mono whitespace-nowrap max-w-[140px] truncate text-slate-700 dark:text-slate-300"
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Create Brand New */}
                    <div className="md:col-span-5 rounded-2xl border border-emerald-200/85 dark:border-emerald-900/60 bg-emerald-50/45 dark:bg-emerald-950/20 p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Option B · Instant Setup
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Create &amp; Sync New Google Sheet
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Automatically creates a clean multi-tab spreadsheet in your Google Drive
                          populated with the live <strong>{monthLabel}</strong>{' '}
                          <span className="font-mono">Balance_Sheet</span> plus 7 cooperative ledger
                          tabs.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!workspace.connected || syncing}
                        onClick={() => handleRequestSync(true)}
                        className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap"
                      >
                        <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                        <span>Create &amp; Sync Google Sheet</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Blueprint Summary Preview */}
                <div className="rounded-2xl border border-slate-200/85 dark:border-slate-800/85 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Tabs Included on Sync ({blueprint.length || 8} tabs · Period {monthLabel})
                    </span>
                    {loadingBlueprint && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" aria-hidden="true" />
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                    {blueprint.map((tab) => (
                      <div
                        key={tab.sheetName}
                        className="px-3.5 py-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-950"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            {tab.sheetName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                            {(tab.rows[0] || []).slice(0, 4).join(' · ')}
                            {(tab.rows[0] || []).length > 4 ? ' …' : ''}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                          {Math.max(0, tab.rows.length - 1)} rows
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ActionModal
        open={actionModal !== null}
        mode={actionModal?.mode || 'notice'}
        tone={actionModal?.tone || 'emerald'}
        title={actionModal?.title || ''}
        description={actionModal?.description || ''}
        details={actionModal?.details}
        confirmLabel={actionModal?.mode === 'confirm' ? actionModal.confirmLabel : 'OK, Got It'}
        busy={confirmBusy || syncing}
        onConfirm={
          actionModal?.mode === 'confirm'
            ? async () => {
                setConfirmBusy(true);
                try {
                  await actionModal.run();
                } finally {
                  setConfirmBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!confirmBusy && !syncing) setActionModal(null);
        }}
      />
    </>,
    document.body
  );
}
