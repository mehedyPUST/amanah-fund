'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ExternalLink, FileImage, Lock, Search, Shield, Sparkles, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, PublicUser, ReceiptAiExtraction } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  formatBillingMonth,
  formatDateTime,
  formatMoney,
  shortHash,
} from '../utils/format.ts';
import { ContributionGoalTracker } from './ContributionGoalTracker.tsx';
import { StatusText } from './StatusText.tsx';

function shiftBillingMonth(baseMonth: string, offset: number): string {
  const [yStr, mStr] = baseMonth.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = (Number(mStr) || 1) - 1;
  const d = new Date(Date.UTC(year, month + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function matchProviderOption(extracted: string, channel: 'bank' | 'mfs'): string {
  const list = channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS;
  const norm = extracted.trim().toLowerCase();
  if (!norm) return list[0];
  const exactOrPartial = list.find(
    (opt) => opt.toLowerCase().includes(norm) || norm.includes(opt.toLowerCase())
  );
  return exactOrPartial || list[0];
}

interface ContributionsViewProps {
  contributions: Contribution[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  initialBillingMonth?: string | null;
  onRefresh: () => Promise<void>;
}

export function ContributionsView({
  contributions,
  config,
  user,
  loading,
  initialBillingMonth,
  onRefresh,
}: ContributionsViewProps) {
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isReviewer = user.role === 'admin' || user.role === 'manager';

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [billingMonth, setBillingMonth] = useState(initialBillingMonth || currentMonth);
  const [advanceMode, setAdvanceMode] = useState(false);
  const [advanceMonths, setAdvanceMonths] = useState<string[]>([initialBillingMonth || currentMonth]);

  useEffect(() => {
    if (initialBillingMonth) {
      setBillingMonth(initialBillingMonth);
      setAdvanceMonths([initialBillingMonth]);
      setAdvanceMode(false);
    }
  }, [initialBillingMonth]);

  const upcomingMonthOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => shiftBillingMonth(billingMonth, i)),
    [billingMonth]
  );

  const effectiveBillingMonths = useMemo(() => {
    if (!advanceMode) return [billingMonth];
    const unique = Array.from(new Set([billingMonth, ...advanceMonths])).sort();
    return unique.slice(0, 12);
  }, [advanceMode, billingMonth, advanceMonths]);

  const [amount, setAmount] = useState(String(config?.monthlyContributionAmount || 5000));
  const amountEditedRef = useRef(false);
  useEffect(() => {
    if (config && !amountEditedRef.current) {
      setAmount(String(config.monthlyContributionAmount * effectiveBillingMonths.length));
    }
  }, [config, effectiveBillingMonths.length]);

  const [channel, setChannel] = useState<'bank' | 'mfs'>('mfs');
  const [providerName, setProviderName] = useState<string>(MFS_PROVIDERS[0]);
  const [senderAccount, setSenderAccount] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState('');
  const [receiptAiResult, setReceiptAiResult] = useState<ReceiptAiExtraction | null>(null);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const depositFormRef = useRef<HTMLElement | null>(null);
  const senderInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  async function handleReceiptUploadAndScan(file: File) {
    setScanningReceipt(true);
    setReceiptNotice(null);
    setFeedback(null);
    try {
      const [uploadRes, aiRes] = await Promise.allSettled([
        api.uploadImage(file, `contrib-receipt-${Date.now()}`),
        api.verifyReceiptWithGemini(file),
      ]);

      if (uploadRes.status === 'fulfilled') {
        setReceiptPhotoUrl(uploadRes.value.url);
      }

      if (aiRes.status === 'fulfilled' && aiRes.value.extraction) {
        const ext = aiRes.value.extraction;
        setReceiptAiResult(ext);
        setChannel(ext.channel);
        setProviderName(matchProviderOption(ext.providerName, ext.channel));
        if (ext.referenceId) setReferenceId(ext.referenceId);
        if (ext.senderAccount) setSenderAccount(ext.senderAccount);
        if (ext.amount && ext.amount > 0) {
          amountEditedRef.current = true;
          setAmount(String(ext.amount));
        }
        setReceiptNotice(
          `Gemini AI extracted (${ext.confidence} confidence): ${ext.summary}`
        );
      } else if (uploadRes.status === 'fulfilled') {
        setReceiptNotice(
          'Receipt screenshot attached. Verify transfer fields manually before submitting.'
        );
      } else {
        setFeedback({
          type: 'error',
          text: 'Could not upload receipt image. Please check file size (<8 MB) and try again.',
        });
      }
    } finally {
      setScanningReceipt(false);
    }
  }

  function toggleAdvanceMonth(month: string) {
    if (month === billingMonth) return;
    setAdvanceMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await api.submitContribution({
        billingMonth,
        billingMonths: effectiveBillingMonths.length > 1 ? effectiveBillingMonths : undefined,
        amount: Number(amount),
        channel,
        providerName,
        senderAccount,
        referenceId,
        notes,
        receiptPhotoUrl: receiptPhotoUrl || undefined,
        receiptAiSummary: receiptAiResult?.summary || undefined,
      });
      setSenderAccount('');
      setReferenceId('');
      setNotes('');
      setReceiptPhotoUrl('');
      setReceiptAiResult(null);
      setReceiptNotice(null);
      setAdvanceMode(false);
      setAdvanceMonths([billingMonth]);
      amountEditedRef.current = false;
      setFeedback({
        type: 'success',
        text:
          effectiveBillingMonths.length > 1
            ? `${effectiveBillingMonths.length}-month advance contribution batch submitted and encrypted with AES-256-GCM. Awaiting manager verification.`
            : 'Contribution request submitted and encrypted with AES-256-GCM. Awaiting manager verification.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit contribution.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && !reviewNote.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please enter a correction message explaining why this contribution is denied before rejecting.',
      });
      return;
    }
    setReviewingId(id);
    setFeedback(null);
    try {
      await api.reviewContribution(id, decision, reviewNote.trim() || undefined);
      setReviewNote('');
      setFeedback({
        type: 'success',
        text: `Contribution ${decision === 'approved' ? 'approved and added to treasury liquidity' : 'denied with correction note sent to member'}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review contribution.',
      });
    } finally {
      setReviewingId(null);
    }
  }

  function handlePrefillForCorrection(item: Contribution) {
    setBillingMonth(item.billingMonth);
    setAdvanceMode(false);
    setAdvanceMonths([item.billingMonth]);
    amountEditedRef.current = true;
    setAmount(String(item.amount));
    setChannel(item.channel);
    setProviderName(item.providerName);
    setNotes(
      item.decryptedDetails?.notes ||
        `Resubmitted correction for ${formatBillingMonth(item.billingMonth)}`
    );
    setFeedback({
      type: 'success',
      text: `Loaded denied deposit (${formatBillingMonth(item.billingMonth)}) into the form. Verify your TrxID / slip and re-submit.`,
    });
    depositFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => senderInputRef.current?.focus(), 250);
  }

  const myContributions = useMemo(
    () => contributions.filter((c) => c.userId === user.id),
    [contributions, user.id]
  );
  const otherContributions = useMemo(
    () => contributions.filter((c) => c.userId !== user.id),
    [contributions, user.id]
  );

  const ownApprovedTotal = myContributions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.amount, 0);
  const ownActiveCount = myContributions.filter((c) => c.status === 'pending').length;
  const ownDeniedCount = myContributions.filter((c) => c.status === 'rejected').length;

  const othersApprovedTotal = otherContributions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.amount, 0);
  const othersApprovedCount = otherContributions.filter((c) => c.status === 'approved').length;

  const activeCount = contributions.filter((c) => c.status === 'pending').length;
  const deniedCount = contributions.filter((c) => c.status === 'rejected').length;
  const historyCount = contributions.filter((c) => c.status === 'approved').length;

  const filtered = contributions.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.memberName.toLowerCase().includes(q) ||
        c.memberCode.toLowerCase().includes(q) ||
        c.providerName.toLowerCase().includes(q) ||
        c.billingMonth.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <ContributionGoalTracker
          user={user}
          contributions={contributions}
          config={config}
          loading={loading}
          onSubmitContribution={(month) => {
            if (month) {
              setBillingMonth(month);
            }
            depositFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.setTimeout(() => senderInputRef.current?.focus(), 250);
          }}
        />
      )}

      {/* Own Summary & Other Members Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isAdmin && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="text-xs text-slate-500 dark:text-slate-400">Own Summary (Approved)</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(ownApprovedTotal, ccy)}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {myContributions.filter((c) => c.status === 'approved').length} approved · {ownActiveCount} active · {ownDeniedCount} denied
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isAdmin ? 'All Members Approved Pool' : 'Other Members Summary'}
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(othersApprovedTotal, ccy)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {othersApprovedCount} verified deposits
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Requests</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {activeCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Pending Manager review
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">Denied Requests</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-red-700 dark:text-red-400">
            {deniedCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Requires member correction &amp; resubmission
          </div>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Submit Contribution Form (Members & Managers only — Admin is not a contributor) */}
        {!isAdmin && (
          <section
            ref={depositFormRef}
            className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200"
          >
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Submit Capital Deposit
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pay via Bank or MFS and submit your TrxID for Manager approval. Account numbers and
              references are encrypted at rest.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Receipt Screenshot Upload + Gemini AI Scan */}
            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Bank / MFS Slip Proof (Optional AI Scan)</span>
                </span>
                {receiptPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptPhotoUrl('');
                      setReceiptAiResult(null);
                      setReceiptNotice(null);
                    }}
                    className="text-[11px] text-slate-500 hover:text-red-600 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <label className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                <FileImage className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>
                  {scanningReceipt
                    ? 'Uploading & Scanning Slip with Gemini AI…'
                    : receiptPhotoUrl
                      ? 'Replace Receipt Screenshot'
                      : 'Upload Slip & Auto-Fill TrxID'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={scanningReceipt}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleReceiptUploadAndScan(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              {receiptNotice && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  {receiptNotice}
                </p>
              )}
              {receiptPhotoUrl && (
                <a
                  href={receiptPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <span>View Attached Slip Image</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Primary Month
                </label>
                <input
                  type="month"
                  required
                  value={billingMonth}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBillingMonth(next);
                    if (!advanceMode) {
                      setAdvanceMonths([next]);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {effectiveBillingMonths.length > 1
                    ? `Total (${effectiveBillingMonths.length} mo, ${ccy})`
                    : `Amount (${ccy})`}
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={amount}
                  onChange={(e) => {
                    amountEditedRef.current = true;
                    setAmount(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>
            </div>

            {/* Multi-Month Advance Contribution Selector */}
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={advanceMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAdvanceMode(checked);
                    if (!checked) {
                      setAdvanceMonths([billingMonth]);
                    } else {
                      setAdvanceMonths([billingMonth, shiftBillingMonth(billingMonth, 1)]);
                    }
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600/30 cursor-pointer"
                />
                <span>Pay multiple months in advance (single transfer)</span>
              </label>

              {advanceMode && (
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {upcomingMonthOptions.map((m) => {
                      const active = effectiveBillingMonths.includes(m);
                      const isPrimary = m === billingMonth;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={isPrimary}
                          onClick={() => toggleAdvanceMonth(m)}
                          className={`px-2 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer disabled:cursor-default ${
                            active
                              ? 'bg-emerald-600 text-white font-medium'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {effectiveBillingMonths.length} month(s) selected ·{' '}
                    {formatMoney(
                      Math.round((Number(amount) || 0) / Math.max(1, effectiveBillingMonths.length)),
                      ccy
                    )}
                    /mo split evenly
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Payment Channel
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setChannel('mfs');
                    setProviderName(MFS_PROVIDERS[0]);
                  }}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    channel === 'mfs'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  MFS (Mobile Wallet)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannel('bank');
                    setProviderName(BANK_PROVIDERS[0]);
                  }}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    channel === 'bank'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Bank Transfer
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'MFS Provider' : 'Bank Name'}
              </label>
              <select
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                {(channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'Sender Mobile Number' : 'Sender Account / Routing Ref'}
              </label>
              <input
                ref={senderInputRef}
                type="text"
                required
                value={senderAccount}
                onChange={(e) => setSenderAccount(e.target.value)}
                placeholder={channel === 'mfs' ? '017XX-XXXXXX' : '2050-XXXX-XXXX'}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'MFS TrxID' : 'Bank Reference / Slip Number'}
              </label>
              <input
                type="text"
                required
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                placeholder={channel === 'mfs' ? 'e.g. BKX9984120A' : 'e.g. IBBL-BEFTN-8821'}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Optional Note
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Branch or transfer remark"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-60 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Encrypting & Submitting…' : 'Submit for Manager Approval'}</span>
            </button>
          </form>
        </section>
        )}

        {/* Encrypted Ledger & Manager Approval Queue */}
        <section
          className={`${
            isAdmin ? 'xl:col-span-12' : 'xl:col-span-8'
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isReviewer ? 'Cooperative Contribution Ledger & Approval Queue' : 'Monthly Contribution Requests & History'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect active requests, denied requests with Manager correction messages, and approved contribution history
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search member or bank…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'all', label: `All (${contributions.length})` },
                    { id: 'pending', label: `Active Requests (${activeCount})` },
                    { id: 'rejected', label: `Denied Requests (${deniedCount})` },
                    { id: 'approved', label: `History (${historyCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      filter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isReviewer && filtered.some((c) => c.status === 'pending') && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Correction note (optional when approving · REQUIRED when denying a request)…"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={44} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No contribution records match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Member</th>
                    <th className="py-2.5 pr-4">Month</th>
                    <th className="py-2.5 pr-4">Channel & Ref</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filtered.map((item) => {
                    const isExpanded = expandedId === item.id;
                    return (
                      <tr key={item.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td colSpan={6} className="p-0">
                          <div className="grid grid-cols-12 items-center py-3 gap-2">
                            <div className="col-span-12 sm:col-span-3 pr-2">
                              <div className="font-medium text-slate-900 dark:text-white truncate">
                                {item.memberName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {item.memberCode}
                              </div>
                            </div>

                            <div className="col-span-4 sm:col-span-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                              {formatBillingMonth(item.billingMonth)}
                            </div>

                            <div className="col-span-8 sm:col-span-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {item.providerName}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="uppercase">{item.channel}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono">{item.maskedReference}</span>
                            </div>

                            <div className="col-span-4 sm:col-span-1 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {formatMoney(item.amount, ccy)}
                            </div>

                            <div className="col-span-4 sm:col-span-2 sm:pl-3">
                              <StatusText status={item.status} />
                            </div>

                            <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1.5">
                              {isReviewer && item.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    title="Approve contribution"
                                    disabled={reviewingId === item.id}
                                    onClick={() => handleReview(item.id, 'approved')}
                                    className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Reject contribution"
                                    disabled={reviewingId === item.id}
                                    onClick={() => handleReview(item.id, 'rejected')}
                                    className="p-1.5 rounded-md border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isExpanded ? 'Hide' : 'Crypto'}
                              </button>
                            </div>
                          </div>

                          {item.status === 'rejected' && (
                            <div className="mb-2.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="text-red-800 dark:text-red-300">
                                <span className="font-semibold">Denied by {item.reviewerName || 'Manager'}:</span>{' '}
                                <span>{item.reviewNote || 'Correction requested by manager.'}</span>
                              </div>
                              {!isAdmin && item.userId === user.id && (
                                <button
                                  type="button"
                                  onClick={() => handlePrefillForCorrection(item)}
                                  className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
                                >
                                  Fix &amp; Resubmit
                                </button>
                              )}
                            </div>
                          )}

                          {isExpanded && (
                            <div className="mb-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                                  <Shield className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                  <span>Authorized Decrypted Payload & Ciphertext Envelope</span>
                                </span>
                                <span className="font-mono">
                                  Submitted {formatDateTime(item.submittedAt)}
                                </span>
                              </div>

                              {item.decryptedDetails ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
                                  <div>
                                    <span className="text-slate-500 block">Reference / TrxID</span>
                                    <span className="text-slate-900 dark:text-white">
                                      {item.decryptedDetails.referenceId}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Sender Account</span>
                                    <span className="text-slate-900 dark:text-white">
                                      {item.decryptedDetails.senderAccount}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Notes</span>
                                    <span className="text-slate-900 dark:text-white font-sans">
                                      {item.decryptedDetails.notes || '—'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-slate-500 italic">
                                  Decrypted details restricted to transaction owner, Manager, and Admin.
                                </div>
                              )}

                              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all space-y-1">
                                <div>
                                  AES-256-GCM Ciphertext: {item.encryptedDetails.ciphertext.slice(0, 72)}… (IV: {item.encryptedDetails.iv.slice(0, 12)}…)
                                </div>
                                <div>SHA-256 Entry Hash: {shortHash(item.entryHash)}</div>
                                {item.batchGroupId && (
                                  <div className="text-emerald-700 dark:text-emerald-400">
                                    Advance Batch ID: {item.batchGroupId}
                                  </div>
                                )}
                                {item.receiptAiSummary && (
                                  <div className="font-sans text-emerald-700 dark:text-emerald-400">
                                    Gemini AI Verification: {item.receiptAiSummary}
                                  </div>
                                )}
                                {item.receiptPhotoUrl && (
                                  <div className="pt-1 font-sans">
                                    <a
                                      href={item.receiptPhotoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                                    >
                                      <span>Open Attached Transfer Receipt</span>
                                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    </a>
                                  </div>
                                )}
                                {item.reviewerName && (
                                  <div className="font-sans text-slate-600 dark:text-slate-300">
                                    Reviewed by {item.reviewerName} on {formatDateTime(item.reviewedAt)} — {item.reviewNote}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
