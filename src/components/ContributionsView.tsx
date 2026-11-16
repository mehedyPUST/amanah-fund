'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ExternalLink,
  FileImage,
  FileText,
  Lock,
  Search,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, PublicUser, ReceiptAiExtraction } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  formatBillingMonth,
  formatDateTime,
  formatMoney,
  isPdfFileUrl,
  shortHash,
} from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ContributionGoalTracker } from './ContributionGoalTracker.tsx';
import { ProviderSelect } from './ProviderSelect.tsx';
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

type ContributionModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      inputLabel?: string;
      inputPlaceholder?: string;
      inputRequired?: boolean;
      inputMultiline?: boolean;
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

interface ContributionsViewProps {
  contributions: Contribution[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  initialBillingMonth?: string | null;
  onViewMemberProfile?: (memberId: string) => void;
  onRefresh: () => Promise<void>;
}

export function ContributionsView({
  contributions,
  config,
  user,
  loading,
  initialBillingMonth,
  onViewMemberProfile,
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

  const [modal, setModal] = useState<ContributionModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function showNotice(
    tone: 'emerald' | 'amber' | 'red' | 'slate',
    title: string,
    description: string,
    details?: ActionModalDetailItem[]
  ) {
    setModal({ mode: 'notice', tone, title, description, details });
  }

  async function runConfirmedModal(inputValue: string) {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
    } catch (err) {
      showNotice(
        'red',
        'Action Could Not Be Completed',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    } finally {
      setModalBusy(false);
    }
  }

  async function handleReceiptUploadAndScan(file: File) {
    setScanningReceipt(true);
    setReceiptNotice(null);
    try {
      const [uploadRes, aiRes] = await Promise.allSettled([
        api.uploadFile(file, {
          name: file.name,
          category: 'contribution-receipt',
          subject: `${user.memberCode}-${billingMonth}`,
        }),
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
          'Receipt file attached. Verify Transaction Number and sender account manually.'
        );
      } else {
        showNotice(
          'red',
          'Receipt Upload Failed',
          'Could not upload receipt PDF or image. Please check file size (<10 MB) and try again.'
        );
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showNotice('red', 'Invalid Amount', 'Please enter a valid positive contribution amount.');
      return;
    }
    if (!senderAccount.trim() || !referenceId.trim()) {
      showNotice(
        'red',
        'Missing Transfer Proof',
        'Please enter both your sender account/mobile number and the Transaction Number.'
      );
      return;
    }

    const monthsLabel =
      effectiveBillingMonths.length > 1
        ? effectiveBillingMonths.map(formatBillingMonth).join(', ')
        : formatBillingMonth(billingMonth);

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Confirm Contribution Deposit Submission',
      description:
        'Verify your payment details before encrypting with AES-256-GCM and routing to the Manager Desk for approval.',
      details: [
        { label: 'Billing Month(s)', value: monthsLabel },
        { label: 'Total Deposit', value: formatMoney(numericAmount, ccy) },
        { label: 'Channel & Provider', value: `${channel.toUpperCase()} · ${providerName}` },
        { label: 'Sender Account', value: senderAccount.trim() },
        { label: 'Transaction Number', value: referenceId.trim() },
      ],
      confirmLabel: 'Submit Contribution',
      run: async () => {
        const countMonths = effectiveBillingMonths.length;
        await api.submitContribution({
          billingMonth,
          billingMonths: countMonths > 1 ? effectiveBillingMonths : undefined,
          amount: numericAmount,
          channel,
          providerName,
          senderAccount: senderAccount.trim(),
          referenceId: referenceId.trim(),
          notes: notes.trim(),
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
        await onRefresh();
        showNotice(
          'emerald',
          countMonths > 1
            ? `${countMonths}-Month Advance Contribution Submitted`
            : 'Contribution Request Submitted',
          'Your deposit reference is AES-256-GCM encrypted and awaiting Manager approval. Fund balance updates upon approval.'
        );
      },
    });
  }

  function confirmReview(item: Contribution, decision: 'approved' | 'rejected') {
    const txNo = item.decryptedDetails?.referenceId || item.maskedReference;
    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: `Approve Contribution (${item.memberName})`,
        description:
          'Approving verifies the Transaction Number and adds this deposit directly to the cooperative fund balance.',
        details: [
          { label: 'Member', value: `${item.memberName} (${item.memberCode})` },
          { label: 'Month', value: formatBillingMonth(item.billingMonth) },
          { label: 'Amount', value: formatMoney(item.amount, ccy) },
          { label: 'Provider', value: `${item.channel.toUpperCase()} · ${item.providerName}` },
          { label: 'Transaction Number', value: txNo },
        ],
        inputLabel: 'Optional Approval Remark',
        inputPlaceholder: 'Verified bank/MFS transfer…',
        inputRequired: false,
        confirmLabel: 'Approve & Credit Balance',
        run: async (note) => {
          await api.reviewContribution(item.id, 'approved', note || undefined);
          await onRefresh();
          showNotice(
            'emerald',
            'Contribution Approved',
            `${item.memberName}'s deposit (${formatMoney(item.amount, ccy)} · Tx #${txNo}) has been approved and added to treasury liquidity.`
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Deny Contribution (${item.memberName})`,
        description:
          'Provide a mandatory correction message explaining why this contribution request is denied so the member can fix and resubmit.',
        details: [
          { label: 'Member', value: `${item.memberName} (${item.memberCode})` },
          { label: 'Month', value: formatBillingMonth(item.billingMonth) },
          { label: 'Amount', value: formatMoney(item.amount, ccy) },
          { label: 'Transaction Number', value: txNo },
        ],
        inputLabel: 'Correction Message for Member',
        inputPlaceholder: 'e.g. Transaction Number does not match bank statement…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Deny & Send Correction Note',
        run: async (note) => {
          await api.reviewContribution(item.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            'Contribution Denied',
            `Correction message sent to ${item.memberName} (${item.memberCode}).`
          );
        },
      });
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
    showNotice(
      'slate',
      'Form Pre-Filled for Correction',
      `Loaded denied deposit (${formatBillingMonth(item.billingMonth)}) into the form. Verify your Transaction Number and receipt slip, then resubmit.`
    );
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
      const txNo = (c.decryptedDetails?.referenceId || c.maskedReference).toLowerCase();
      return (
        c.memberName.toLowerCase().includes(q) ||
        c.memberCode.toLowerCase().includes(q) ||
        c.providerName.toLowerCase().includes(q) ||
        c.billingMonth.includes(q) ||
        txNo.includes(q)
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

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {!isAdmin && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800/70 transition-colors">
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Own Summary (Approved)</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(ownApprovedTotal, ccy)}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {myContributions.filter((c) => c.status === 'approved').length} approved · {ownActiveCount} active · {ownDeniedCount} denied
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-teal-300 dark:hover:border-teal-800/70 transition-colors">
          <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
            {isAdmin ? 'All Members Approved Pool' : 'Other Members Summary'}
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(othersApprovedTotal, ccy)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {othersApprovedCount} verified deposits
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-amber-300 dark:hover:border-amber-800/70 transition-colors">
          <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Active Requests</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {activeCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Pending Manager review
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-rose-300 dark:hover:border-rose-800/70 transition-colors">
          <div className="text-xs font-medium text-rose-700 dark:text-rose-400">Denied Requests</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            {deniedCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Requires member correction &amp; resubmission
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {!isAdmin && (
          <motion.section
            ref={depositFormRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-shadow duration-200"
          >
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Submit Capital Deposit
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pay via Bangladesh Bank or MFS and submit your Transaction Number for Manager approval. Details are AES-256-GCM encrypted at rest.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                        ? 'Replace Receipt (PDF or Photo)'
                        : 'Upload Slip (PDF/Photo) & Auto-Fill TrxID'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
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
                    {isPdfFileUrl(receiptPhotoUrl) ? (
                      <>
                        <FileText className="w-3 h-3" aria-hidden="true" />
                        <span>View Attached Slip PDF</span>
                      </>
                    ) : (
                      <span>View Attached Slip Image</span>
                    )}
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

                <AnimatePresence initial={false}>
                  {advanceMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden p-2.5 rounded-lg border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2"
                    >
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
                                  ? 'bg-emerald-600 text-white font-medium shadow-2xs'
                                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-400'
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                        {effectiveBillingMonths.length} month(s) selected ·{' '}
                        {formatMoney(
                          Math.round((Number(amount) || 0) / Math.max(1, effectiveBillingMonths.length)),
                          ccy
                        )}
                        /mo split evenly
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Channel
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('mfs');
                      setProviderName(MFS_PROVIDERS[0]);
                    }}
                    className={`relative py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      channel === 'mfs'
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {channel === 'mfs' && (
                      <motion.span
                        layoutId="contrib-channel-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                      />
                    )}
                    <span className="relative z-10">MFS (Mobile Wallet)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('bank');
                      setProviderName(BANK_PROVIDERS[0]);
                    }}
                    className={`relative py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      channel === 'bank'
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {channel === 'bank' && (
                      <motion.span
                        layoutId="contrib-channel-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                      />
                    )}
                    <span className="relative z-10">BD Bank Transfer</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {channel === 'mfs' ? 'MFS Wallet Provider' : 'Bangladesh Bank Name'}
                </label>
                <ProviderSelect
                  options={channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS}
                  value={providerName}
                  onChange={setProviderName}
                  placeholder={
                    channel === 'mfs'
                      ? 'Search MFS wallet…'
                      : `Search all ${BANK_PROVIDERS.length} BD banks…`
                  }
                />
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
                  Transaction Number ({channel === 'mfs' ? 'MFS TrxID' : 'Bank Ref / Slip No.'})
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
                disabled={modalBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>Review &amp; Submit Contribution</span>
              </button>
            </form>
          </motion.section>
        )}

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 }}
          className={`${
            isAdmin ? 'xl:col-span-12' : 'xl:col-span-8'
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isReviewer
                  ? 'Cooperative Contribution Ledger & Approval Queue'
                  : 'Monthly Contribution Requests & History'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect active requests, Transaction Numbers, denied requests with Manager correction messages, and approved history
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
                  placeholder="Search member, bank, Tx#…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                {(
                  [
                    { id: 'all', label: `All (${contributions.length})` },
                    { id: 'pending', label: `Active Requests (${activeCount})` },
                    { id: 'rejected', label: `Denied Requests (${deniedCount})` },
                    { id: 'approved', label: `History (${historyCount})` },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      className={`relative px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="contrib-filter-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800/70"
                >
                  <div className="col-span-4 space-y-1">
                    <Skeleton width="75%" height={14} />
                    <Skeleton width="45%" height={11} />
                  </div>
                  <div className="col-span-3">
                    <Skeleton width="80%" height={13} />
                  </div>
                  <div className="col-span-2">
                    <Skeleton width="80%" height={14} />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <Skeleton width={68} height={24} borderRadius={6} />
                  </div>
                </div>
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
                    <th className="py-2.5 pr-4">Bank / MFS &amp; Transaction No.</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filtered.map((item) => {
                    const isExpanded = expandedId === item.id;
                    const txNumber =
                      item.decryptedDetails?.referenceId || item.maskedReference;
                    return (
                      <tr key={item.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td colSpan={6} className="p-0">
                          <div className="grid grid-cols-12 items-center py-3 gap-2">
                            <div className="col-span-12 sm:col-span-3 pr-2">
                              {onViewMemberProfile ? (
                                <button
                                  type="button"
                                  onClick={() => onViewMemberProfile(item.userId)}
                                  className="font-medium text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline truncate block text-left cursor-pointer"
                                >
                                  {item.memberName}
                                </button>
                              ) : (
                                <div className="font-medium text-slate-900 dark:text-white truncate">
                                  {item.memberName}
                                </div>
                              )}
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
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                Tx #{txNumber}
                              </div>
                            </div>

                            <div className="col-span-4 sm:col-span-1 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {formatMoney(item.amount, ccy)}
                            </div>

                            <div className="col-span-4 sm:col-span-2 sm:pl-3">
                              <StatusText status={item.status} />
                            </div>

                            <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1.5">
                              {isReviewer &&
                                item.status === 'pending' &&
                                (isAdmin || item.userId !== user.id ? (
                                  <>
                                    <button
                                      type="button"
                                      title="Approve contribution"
                                      disabled={modalBusy}
                                      onClick={() => confirmReview(item, 'approved')}
                                      className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Deny with correction note"
                                      disabled={modalBusy}
                                      onClick={() => confirmReview(item, 'rejected')}
                                      className="p-1.5 rounded-md border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    title="Non-admin managers cannot approve their own deposit"
                                    className="text-[10px] font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap"
                                  >
                                    Peer Review
                                  </span>
                                ))}
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
                                <span className="font-semibold">
                                  Denied by {item.reviewerName || 'Manager'}:
                                </span>{' '}
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

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden mb-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-indigo-200/70 dark:border-indigo-900/40 text-xs space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                                  <span className="inline-flex items-center gap-1.5 font-medium text-indigo-800 dark:text-indigo-200">
                                    <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                                    <span>Authorized Decrypted Payload &amp; Ciphertext Envelope</span>
                                  </span>
                                  <span className="font-mono">
                                    Submitted {formatDateTime(item.submittedAt)}
                                  </span>
                                </div>

                                {item.decryptedDetails ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
                                    <div>
                                      <span className="text-slate-500 block">Transaction Number</span>
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
                                    <div className="text-teal-700 dark:text-teal-400">
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
                                        className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-medium hover:underline"
                                      >
                                        <span>
                                          {isPdfFileUrl(item.receiptPhotoUrl)
                                            ? 'Open Attached Receipt PDF'
                                            : 'Open Attached Transfer Receipt'}
                                        </span>
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      </div>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        inputMultiline={modal?.mode === 'confirm' ? modal.inputMultiline : false}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </div>
  );
}
