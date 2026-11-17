'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  MailWarning,
  Paperclip,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  EmailQueueCategory,
  EmailQueueStats,
  EmailQueueStatus,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';

interface AdminEmailQueueViewProps {
  onRefreshWorkspace: () => Promise<unknown>;
}

type MonitorItem = Awaited<ReturnType<typeof api.getEmailQueue>>['items'][number];
type StatusFilter = 'attention' | 'failed' | 'pending' | 'retrying' | 'sent' | 'all';

type QueueModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      run: () => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

const CATEGORY_LABELS: Record<EmailQueueCategory, string> = {
  transaction: 'Transaction',
  registration: 'Registration',
  password_reset: 'Password Reset',
  monthly_pdf: 'Monthly PDF',
  template_test: 'Template Test',
  general: 'General',
};

function formatCountdown(nextAttemptAt: string, status: EmailQueueStatus): string {
  if (status === 'sent') return 'Delivered';
  if (status === 'failed') return 'Max retries reached';
  const targetMs = Date.parse(nextAttemptAt);
  if (Number.isNaN(targetMs)) return 'Scheduled';
  const diffMs = targetMs - Date.now();
  if (diffMs <= 5_000) return 'Due next worker cycle (<1m)';
  const totalSec = Math.ceil(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `Next retry in ${hrs}h ${remMins}m`;
  }
  return mins > 0 ? `Next retry in ${mins}m ${secs}s` : `Next retry in ${secs}s`;
}

export function AdminEmailQueueView({ onRefreshWorkspace }: AdminEmailQueueViewProps) {
  const [items, setItems] = useState<MonitorItem[]>([]);
  const [stats, setStats] = useState<EmailQueueStats>({
    total: 0,
    pending: 0,
    retrying: 0,
    failed: 0,
    sent: 0,
  });
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attention');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [modal, setModal] = useState<QueueModalState | null>(null);
  const [modalBusy, setModalBusy] = useState<boolean>(false);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getEmailQueue('all');
      setItems(res.items);
      setStats(res.stats);
      setSmtpConfigured(res.smtpConfigured);
    } catch (err) {
      console.error('Failed to load email queue:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue(false);

    const es = new EventSource('/api/events', { withCredentials: true });
    const onQueueUpdated = () => {
      void loadQueue(true);
    };
    es.addEventListener('email-queue:updated', onQueueUpdated);

    const timer = window.setInterval(() => {
      void loadQueue(true);
    }, 15_000);

    return () => {
      es.close();
      window.clearInterval(timer);
    };
  }, [loadQueue]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === 'attention') {
        if (item.status !== 'failed' && item.status !== 'retrying' && item.status !== 'pending') {
          return false;
        }
      } else if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.subject.toLowerCase().includes(q) ||
        item.to.some((addr) => addr.toLowerCase().includes(q)) ||
        (item.lastError || '').toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, searchQuery]);

  const attentionCount = stats.pending + stats.retrying + stats.failed;

  const handleProcessDue = async () => {
    setBatchBusy(true);
    try {
      const res = await api.processEmailQueue();
      setStats(res.stats);
      setSmtpConfigured(res.smtpConfigured);
      await Promise.all([loadQueue(true), onRefreshWorkspace()]);
      setModal({
        mode: 'notice',
        tone: res.sent > 0 ? 'emerald' : res.processed === 0 ? 'amber' : 'red',
        title:
          res.processed === 0
            ? 'No Pending Emails to Process'
            : res.failed === 0
            ? 'Email Queue Processed Successfully'
            : 'Queue Sweep Completed With Warnings',
        description:
          res.processed === 0
            ? 'There are currently no pending or retrying emails waiting in the queue.'
            : `Processed ${res.processed} queued email(s): ${res.sent} delivered, ${res.failed} still failing.`,
        details: [
          { label: 'Delivered', value: String(res.sent) },
          { label: 'Still Failing', value: String(res.failed) },
          {
            label: 'SMTP Status',
            value: res.smtpConfigured ? 'Configured' : 'Not Configured',
          },
        ],
      });
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Queue Processing Failed',
        description: err instanceof Error ? err.message : 'Unable to process queued emails.',
      });
    } finally {
      setBatchBusy(false);
    }
  };

  const confirmRetryAll = () => {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Retry All Failed & Pending Emails?',
      description:
        'Resets retry counters on all failed and retrying entries and dispatches them immediately via Nodemailer SMTP.',
      details: [
        { label: 'Emails to Retry', value: String(attentionCount) },
        {
          label: 'SMTP Configuration',
          value: smtpConfigured ? 'Ready' : 'Not Configured',
        },
      ],
      confirmLabel: 'Retry All Now',
      run: async () => {
        const res = await api.retryAllEmailQueue();
        await Promise.all([loadQueue(true), onRefreshWorkspace()]);
        setModal({
          mode: 'notice',
          tone: res.sent > 0 && res.failed === 0 ? 'emerald' : res.failed > 0 ? 'amber' : 'emerald',
          title: 'Batch Retry Complete',
          description: `Retried ${res.queuedCount} queued email(s): ${res.sent} delivered, ${res.failed} failed.`,
          details: [
            { label: 'Delivered', value: String(res.sent) },
            { label: 'Failed', value: String(res.failed) },
          ],
        });
      },
    });
  };

  const handleSingleRetry = async (item: MonitorItem) => {
    setBusyId(item.id);
    try {
      const res = await api.retryEmailQueueItem(item.id);
      await Promise.all([loadQueue(true), onRefreshWorkspace()]);
      setModal({
        mode: 'notice',
        tone: res.sent ? 'emerald' : 'red',
        title: res.sent ? 'Queued Email Delivered' : 'Retry Attempt Failed',
        description: res.sent
          ? `Successfully delivered "${item.subject}" to ${item.to.join(', ')}.`
          : `Delivery attempt failed for ${item.to.join(', ')}. The entry remains tracked in the queue.`,
        details: [
          { label: 'Recipients', value: item.to.join(', ') },
          ...(res.reason ? [{ label: 'SMTP Response', value: res.reason }] : []),
        ],
      });
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Retry Error',
        description: err instanceof Error ? err.message : 'Unable to retry email.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteItem = (item: MonitorItem) => {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Discard Queued Email?',
      description:
        'Removing this entry stops future retry attempts for it permanently. Use this if the recipient mailbox is invalid or superseded.',
      details: [
        { label: 'Subject', value: item.subject },
        { label: 'Recipients', value: item.to.join(', ') },
        { label: 'Attempts', value: `${item.attempts}/${item.maxAttempts}` },
      ],
      confirmLabel: 'Discard Entry',
      run: async () => {
        await api.deleteEmailQueueItem(item.id);
        await Promise.all([loadQueue(true), onRefreshWorkspace()]);
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Queue Entry Removed',
          description: 'The selected email entry has been removed from the persistent queue.',
        });
      },
    });
  };

  const confirmClearSent = () => {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Clear Delivered Email History?',
      description:
        'Clears completed ("sent") records from the queue monitor. Pending, retrying, and failed items will not be removed.',
      details: [{ label: 'Delivered Logs', value: String(stats.sent) }],
      confirmLabel: 'Clear Delivered Logs',
      run: async () => {
        const res = await api.clearSentEmailQueue();
        await loadQueue(true);
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Delivered Logs Cleared',
          description: `Removed ${res.removedCount} delivered email record(s) from the queue history.`,
        });
      },
    });
  };

  const openPayloadPreview = (item: MonitorItem) => {
    setModal({
      mode: 'notice',
      tone: item.status === 'failed' ? 'red' : item.status === 'sent' ? 'emerald' : 'amber',
      title: item.subject,
      description: item.textPreview || '(Empty message body)',
      details: [
        { label: 'Queue ID', value: item.id },
        { label: 'Status', value: item.status.toUpperCase() },
        { label: 'Category', value: CATEGORY_LABELS[item.category] || item.category },
        { label: 'Recipients', value: item.to.join(', ') },
        { label: 'Attempts', value: `${item.attempts} / ${item.maxAttempts}` },
        ...(item.attachmentFilenames.length > 0
          ? [{ label: 'Attachments', value: item.attachmentFilenames.join(', ') }]
          : []),
        ...(item.lastError ? [{ label: 'Last Error', value: item.lastError }] : []),
      ],
    });
  };

  const runConfirmedModal = async () => {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run();
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Queue Action Failed',
        description: err instanceof Error ? err.message : 'Unable to complete email queue action.',
      });
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
              <MailWarning className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Persistent Database Retry Queue · Automated Backoff Worker (60s)</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Email Queue Monitor
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              Every failed Nodemailer delivery is persisted in the database and automatically
              retried with exponential backoff (1m → 3m → 10m → 30m, up to 5 attempts). Inspect
              errors or trigger immediate manual retries below.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void loadQueue(false)}
              className="px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              disabled={batchBusy || stats.pending + stats.retrying === 0}
              onClick={handleProcessDue}
              className="px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Process Pending</span>
            </button>
            <button
              type="button"
              disabled={batchBusy || attentionCount === 0}
              onClick={confirmRetryAll}
              className="col-span-2 sm:col-span-1 px-4 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry All ({attentionCount})</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
          <div className="rounded-xl border amanah-card-violet p-3 sm:p-3.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>SMTP Transport</span>
              <Server className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {smtpConfigured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Configured
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Not Configured
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border amanah-card-amber p-3 sm:p-3.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-amber-800/80 dark:text-amber-300/80">
              <span>Pending / Retrying</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-amber-900 dark:text-amber-200">
              {stats.pending + stats.retrying}
            </div>
          </div>

          <div className="rounded-xl border amanah-card-rose p-3 sm:p-3.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-rose-800/80 dark:text-rose-300/80">
              <span>Failed (Max Retries)</span>
              <XCircle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-rose-900 dark:text-rose-200">
              {stats.failed}
            </div>
          </div>

          <div className="rounded-xl border amanah-card-emerald p-3 sm:p-3.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-emerald-800/80 dark:text-emerald-300/80">
              <span>Recovered &amp; Sent</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-900 dark:text-emerald-200">
              {stats.sent}
            </div>
          </div>
        </div>
      </section>

      {/* Queue Filter & List */}
      <section className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 md:pb-0">
            {(
              [
                { id: 'attention', label: `Needs Attention (${attentionCount})` },
                { id: 'failed', label: `Failed (${stats.failed})` },
                { id: 'retrying', label: `Retrying (${stats.retrying})` },
                { id: 'pending', label: `Pending (${stats.pending})` },
                { id: 'sent', label: `Sent (${stats.sent})` },
                { id: 'all', label: `All (${stats.total})` },
              ] as Array<{ id: StatusFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 min-h-[38px] sm:min-h-0 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recipient, subject, error..."
                className="w-full pl-8 pr-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            {stats.sent > 0 && (
              <button
                type="button"
                onClick={confirmClearSent}
                className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear Sent</span>
              </button>
            )}
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={92} borderRadius={10} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50 p-8 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {statusFilter === 'attention'
                ? 'No Failed or Pending Emails'
                : 'No Matching Queue Entries'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {statusFilter === 'attention'
                ? 'All recent Nodemailer dispatches have succeeded or been resolved cleanly.'
                : 'Try switching filters or clearing the search box.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filteredItems.map((item) => {
              const isBusy = busyId === item.id;
              const statusBadgeClass =
                item.status === 'sent'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/70'
                  : item.status === 'failed'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/70'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/70';

              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-50/70 dark:hover:bg-slate-950/50 transition-colors flex flex-col lg:flex-row lg:items-start justify-between gap-3 sm:gap-4"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass}`}
                      >
                        {item.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Attempt {item.attempts}/{item.maxAttempts}
                      </span>
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        · {formatCountdown(item.nextAttemptAt, item.status)}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                      {item.subject}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span>
                        <strong className="font-medium text-slate-700 dark:text-slate-300">
                          To:
                        </strong>{' '}
                        <span className="font-mono">{item.to.join(', ')}</span>
                      </span>
                      <span>
                        Queued: {formatDateTime(item.createdAt)}
                      </span>
                      {item.sentAt && (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Sent: {formatDateTime(item.sentAt)}
                        </span>
                      )}
                      {item.attachmentFilenames.length > 0 && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-teal-700 dark:text-teal-400">
                          <Paperclip className="w-3 h-3" aria-hidden="true" />
                          <span>{item.attachmentFilenames.join(', ')}</span>
                        </span>
                      )}
                    </div>

                    {item.lastError && (
                      <div className="rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 px-3 py-2 text-[11px] font-mono text-rose-800 dark:text-rose-300 break-words">
                        Error: {item.lastError}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => openPayloadPreview(item)}
                      className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Details</span>
                    </button>
                    {item.status !== 'sent' && (
                      <button
                        type="button"
                        disabled={isBusy || batchBusy}
                        onClick={() => void handleSingleRetry(item)}
                        className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <RotateCcw
                          className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>{isBusy ? 'Retrying...' : 'Retry Now'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy || batchBusy}
                      onClick={() => confirmDeleteItem(item)}
                      className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-xs font-medium text-rose-700 dark:text-rose-400 inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Discard</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </div>
  );
}
