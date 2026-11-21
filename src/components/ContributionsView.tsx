'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ExternalLink,
  FileImage,
  FileText,
  Lock,
  Plus,
  Search,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ContributionGoalTracker } from './ContributionGoalTracker.tsx';
import { MotionCard } from './MotionCard.tsx';
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
  const t = useTranslations('Contributions');
  const tCommon = useTranslations('Common');
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isReviewer = user.role === 'admin' || user.role === 'manager';

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [billingMonth, setBillingMonth] = useState(initialBillingMonth || currentMonth);
  const [advanceMode, setAdvanceMode] = useState(false);
  const [advanceMonths, setAdvanceMonths] = useState<string[]>([initialBillingMonth || currentMonth]);

  const [mounted, setMounted] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const depositModalTokenRef = useRef<symbol | null>(null);
  if (!depositModalTokenRef.current) {
    depositModalTokenRef.current = Symbol('SubmitCapitalDepositModal');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialBillingMonth) {
      setBillingMonth(initialBillingMonth);
      setAdvanceMonths([initialBillingMonth]);
      setAdvanceMode(false);
      if (!isAdmin) {
        setPrefillBanner(null);
        setDepositModalOpen(true);
      }
    }
  }, [initialBillingMonth, isAdmin]);

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
  const senderInputRef = useRef<HTMLInputElement | null>(null);

  const [modal, setModal] = useState<ContributionModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useBodyScrollLock(depositModalOpen);

  useEffect(() => {
    if (!depositModalOpen || !depositModalTokenRef.current) return;
    const token = depositModalTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) {
        e.preventDefault();
        e.stopPropagation();
        setDepositModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [depositModalOpen]);

  function openDepositModal(targetMonth?: string) {
    if (targetMonth) {
      setBillingMonth(targetMonth);
      setAdvanceMonths([targetMonth]);
      setAdvanceMode(false);
    }
    setPrefillBanner(null);
    setDepositModalOpen(true);
    window.setTimeout(() => {
      senderInputRef.current?.focus();
    }, 180);
  }

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
        t('actionFailed'),
        err instanceof Error ? err.message : t('unexpectedError')
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
          t('aiExtracted', { confidence: ext.confidence, summary: ext.summary })
        );
      } else if (uploadRes.status === 'fulfilled') {
        setReceiptNotice(t('receiptAttachedManual'));
      } else {
        showNotice(
          'red',
          t('receiptUploadFailed'),
          t('receiptUploadFailedDesc')
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
      showNotice('red', t('invalidAmount'), t('invalidAmountDesc'));
      return;
    }
    if (!senderAccount.trim() || !referenceId.trim()) {
      showNotice(
        'red',
        t('missingTransferProof'),
        t('missingTransferProofDesc')
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
      title: t('confirmDepositTitle'),
      description: t('confirmDepositDesc'),
      details: [
        { label: t('detailBillingMonths'), value: monthsLabel },
        { label: t('detailTotalDeposit'), value: formatMoney(numericAmount, ccy) },
        { label: t('detailChannelProvider'), value: `${channel.toUpperCase()} · ${providerName}` },
        { label: t('detailSenderAccount'), value: senderAccount.trim() },
        { label: t('detailTxNumber'), value: referenceId.trim() },
      ],
      confirmLabel: t('submitContributionBtn'),
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
        setPrefillBanner(null);
        setDepositModalOpen(false);
        await onRefresh();
        showNotice(
          'emerald',
          countMonths > 1
            ? t('advanceSubmittedTitle', { count: countMonths })
            : t('submittedTitle'),
          t('submittedDesc')
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
        title: t('approveTitle', { name: item.memberName }),
        description: t('approveDesc'),
        details: [
          { label: t('detailMember'), value: `${item.memberName} (${item.memberCode})` },
          { label: t('detailMonth'), value: formatBillingMonth(item.billingMonth) },
          { label: t('detailAmount'), value: formatMoney(item.amount, ccy) },
          { label: t('detailProvider'), value: `${item.channel.toUpperCase()} · ${item.providerName}` },
          { label: t('detailTxNumber'), value: txNo },
        ],
        inputLabel: t('approvalRemarkLabel'),
        inputPlaceholder: t('approvalRemarkPlaceholder'),
        inputRequired: false,
        confirmLabel: t('approveCreditBtn'),
        run: async (note) => {
          await api.reviewContribution(item.id, 'approved', note || undefined);
          await onRefresh();
          showNotice(
            'emerald',
            t('approvedNoticeTitle'),
            t('approvedNoticeDesc', {
              name: item.memberName,
              amount: formatMoney(item.amount, ccy),
              txNo,
            })
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: t('denyTitle', { name: item.memberName }),
        description: t('denyDesc'),
        details: [
          { label: t('detailMember'), value: `${item.memberName} (${item.memberCode})` },
          { label: t('detailMonth'), value: formatBillingMonth(item.billingMonth) },
          { label: t('detailAmount'), value: formatMoney(item.amount, ccy) },
          { label: t('detailTxNumber'), value: txNo },
        ],
        inputLabel: t('correctionMsgLabel'),
        inputPlaceholder: t('correctionMsgPlaceholder'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('denySendNoteBtn'),
        run: async (note) => {
          await api.reviewContribution(item.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            t('deniedNoticeTitle'),
            t('deniedNoticeDesc', { name: item.memberName, code: item.memberCode })
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
        t('resubmitNote', { month: formatBillingMonth(item.billingMonth) })
    );
    setPrefillBanner(t('prefilledDesc', { month: formatBillingMonth(item.billingMonth) }));
    setDepositModalOpen(true);
    window.setTimeout(() => {
      senderInputRef.current?.focus();
    }, 180);
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
          onSubmitContribution={(month) => openDepositModal(month)}
        />
      )}

      <section className={`grid grid-cols-2 ${isAdmin ? 'sm:grid-cols-3' : 'lg:grid-cols-4'} gap-2.5 sm:gap-4`}>
        {!isAdmin && (
          <MotionCard
            hue="emerald"
            delay={0.02}
            className="backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-3.5 sm:p-4 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('ownSummary')}</div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(ownApprovedTotal, ccy)}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 leading-snug">
              {t('ownSummaryCounts', {
                approved: myContributions.filter((c) => c.status === 'approved').length,
                active: ownActiveCount,
                denied: ownDeniedCount,
              })}
            </div>
          </MotionCard>
        )}

        <MotionCard
          hue="violet"
          delay={0.06}
          className="backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-3.5 sm:p-4 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs font-medium text-violet-700 dark:text-violet-400">
            {isAdmin ? t('allMembersApprovedPool') : t('otherMembersSummary')}
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(othersApprovedTotal, ccy)}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {t('verifiedDepositsCount', { count: othersApprovedCount })}
          </div>
        </MotionCard>

        <MotionCard
          hue="amber"
          delay={0.1}
          className="backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-3.5 sm:p-4 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs font-medium text-amber-700 dark:text-amber-400">{t('activeRequests')}</div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {activeCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t('pendingManagerReview')}
          </div>
        </MotionCard>

        <MotionCard
          hue="rose"
          delay={0.14}
          className={`backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-3.5 sm:p-4 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] hover:shadow-md transition-all duration-200 ${isAdmin ? 'col-span-2 sm:col-span-1' : ''}`}
        >
          <div className="text-[11px] sm:text-xs font-medium text-rose-700 dark:text-rose-400">{t('deniedRequests')}</div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            {deniedCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t('requiresCorrection')}
          </div>
        </MotionCard>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.04 }}
        className="amanah-card-violet backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {isReviewer ? t('reviewerLedgerHeading') : t('memberLedgerHeading')}
            </h2>
            {!isAdmin && (
              <button
                type="button"
                onClick={() => openDepositModal()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('submitCapitalDeposit')}</span>
              </button>
            )}
          </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs rounded-xl border border-slate-200/90 dark:border-slate-700/85 bg-white/95 dark:bg-slate-950/90 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>

              <div className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/75 dark:border-slate-700/75 w-full sm:w-fit">
                {(
                  [
                    { id: 'all', label: t('tabAllCount', { count: contributions.length }) },
                    { id: 'pending', label: t('tabActiveCount', { count: activeCount }) },
                    { id: 'rejected', label: t('tabDeniedCount', { count: deniedCount }) },
                    { id: 'approved', label: t('tabHistoryCount', { count: historyCount }) },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      className={`relative px-3 py-1.5 sm:px-2.5 sm:py-1 min-h-[36px] sm:min-h-0 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="contrib-filter-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
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
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {t('emptyFiltered')}
            </div>
          ) : (
            <>
              <div className="lg:hidden space-y-2.5">
                {filtered.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const txNumber = item.decryptedDetails?.referenceId || item.maskedReference;
                  const canReviewRow =
                    isReviewer &&
                    item.status === 'pending' &&
                    (isAdmin || item.userId !== user.id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/75 p-3.5 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          {onViewMemberProfile ? (
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(item.userId)}
                              className="font-semibold text-sm text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline truncate block text-left cursor-pointer"
                            >
                              {item.memberName}
                            </button>
                          ) : (
                            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {item.memberName}
                            </div>
                          )}
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {item.memberCode} · {formatBillingMonth(item.billingMonth)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(item.amount, ccy)}
                          </div>
                          <div className="mt-0.5">
                            <StatusText status={item.status} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {item.providerName}
                          </span>
                          <span> · {item.channel.toUpperCase()}</span>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Tx #{txNumber}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.receiptPhotoUrl && (
                            <a
                              href={item.receiptPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 text-[11px] font-medium"
                            >
                              <span>{isPdfFileUrl(item.receiptPhotoUrl) ? t('pdfSlip') : t('slip')}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {isExpanded ? t('hide') : t('crypto')}
                          </button>
                        </div>
                      </div>

                      {item.status === 'rejected' && (
                        <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/30 space-y-2 text-xs">
                          <div className="text-red-800 dark:text-red-300">
                            <span className="font-semibold">
                              {t('deniedByPrefix', { name: item.reviewerName || t('managerFallback') })}
                            </span>{' '}
                            <span>{item.reviewNote || t('correctionFallback')}</span>
                          </div>
                          {!isAdmin && item.userId === user.id && (
                            <button
                              type="button"
                              onClick={() => handlePrefillForCorrection(item)}
                              className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              {t('fixResubmit')}
                            </button>
                          )}
                        </div>
                      )}

                      {canReviewRow && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmReview(item, 'approved')}
                            className="min-h-[44px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" aria-hidden="true" />
                            <span>{t('approve')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmReview(item, 'rejected')}
                            className="min-h-[44px] px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                            <span>{t('deny')}</span>
                          </button>
                        </div>
                      )}

                      {isReviewer && item.status === 'pending' && !canReviewRow && (
                        <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {t('peerReviewFull')}
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-indigo-200/70 dark:border-indigo-900/40 text-xs space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1 text-slate-600 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1.5 font-medium text-indigo-800 dark:text-indigo-200">
                                <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                                <span>{t('aesEnvelope')}</span>
                              </span>
                              <span className="font-mono text-[11px]">{formatDateTime(item.submittedAt)}</span>
                            </div>
                            {item.decryptedDetails ? (
                              <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">Tx#: </span>
                                  <span className="text-slate-900 dark:text-white">{item.decryptedDetails.referenceId}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">{t('detailSenderAccount')}: </span>
                                  <span className="text-slate-900 dark:text-white">{item.decryptedDetails.senderAccount}</span>
                                </div>
                                {item.decryptedDetails.notes && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('notes')}: </span>
                                    <span className="text-slate-900 dark:text-white font-sans">{item.decryptedDetails.notes}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                                {t('decryptedRestricted')}
                              </div>
                            )}
                            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all space-y-1">
                              <div>Ciphertext: {item.encryptedDetails.ciphertext.slice(0, 48)}…</div>
                              <div>Entry Hash: {shortHash(item.entryHash)}</div>
                              {item.reviewerName && (
                                <div className="font-sans text-[11px] text-slate-600 dark:text-slate-300">
                                  {t('reviewedByLine', { name: item.reviewerName, note: item.reviewNote || '' })}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/55 dark:bg-slate-950/35">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pl-4 pr-4">{t('colMember')}</th>
                      <th className="py-2.5 pr-4">{t('colMonth')}</th>
                      <th className="py-2.5 pr-4">{t('colBankTx')}</th>
                      <th className="py-2.5 pr-4 text-right">{t('colAmount')}</th>
                      <th className="py-2.5 pr-4">{t('colStatus')}</th>
                      <th className="py-2.5 pr-4 text-right">{t('colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {filtered.map((item) => {
                      const isExpanded = expandedId === item.id;
                      const txNumber =
                        item.decryptedDetails?.referenceId || item.maskedReference;
                      return (
                        <tr key={item.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/35 transition-colors">
                          <td colSpan={6} className="px-4 py-0">
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
                                        title={t('approveTooltip')}
                                        disabled={modalBusy}
                                        onClick={() => confirmReview(item, 'approved')}
                                        className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        title={t('denyTooltip')}
                                        disabled={modalBusy}
                                        onClick={() => confirmReview(item, 'rejected')}
                                        className="p-1.5 rounded-md border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      title={t('peerReviewTitle')}
                                      className="text-[10px] font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap"
                                    >
                                      {t('peerReviewShort')}
                                    </span>
                                  ))}
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                  className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  {isExpanded ? t('hide') : t('crypto')}
                                </button>
                              </div>
                            </div>

                            {item.status === 'rejected' && (
                              <div className="mb-2.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="text-red-800 dark:text-red-300">
                                  <span className="font-semibold">
                                    {t('deniedByPrefix', { name: item.reviewerName || t('managerFallback') })}
                                  </span>{' '}
                                  <span>{item.reviewNote || t('correctionFallback')}</span>
                                </div>
                                {!isAdmin && item.userId === user.id && (
                                  <button
                                    type="button"
                                    onClick={() => handlePrefillForCorrection(item)}
                                    className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
                                  >
                                    {t('fixResubmit')}
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
                                      <span>{t('authorizedPayload')}</span>
                                    </span>
                                    <span className="font-mono">
                                      {t('submittedAtPrefix', { date: formatDateTime(item.submittedAt) })}
                                    </span>
                                  </div>

                                  {item.decryptedDetails ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
                                      <div>
                                        <span className="text-slate-500 dark:text-slate-400 block">{t('detailTxNumber')}</span>
                                        <span className="text-slate-900 dark:text-white">
                                          {item.decryptedDetails.referenceId}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 dark:text-slate-400 block">{t('detailSenderAccount')}</span>
                                        <span className="text-slate-900 dark:text-white">
                                          {item.decryptedDetails.senderAccount}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 dark:text-slate-400 block">{t('notes')}</span>
                                        <span className="text-slate-900 dark:text-white font-sans">
                                          {item.decryptedDetails.notes || '—'}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-slate-500 dark:text-slate-400 italic">
                                      {t('decryptedRestricted')}
                                    </div>
                                  )}

                                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all space-y-1">
                                    <div>
                                      AES-256-GCM Ciphertext: {item.encryptedDetails.ciphertext.slice(0, 72)}… (IV: {item.encryptedDetails.iv.slice(0, 12)}…)
                                    </div>
                                    <div>SHA-256 Entry Hash: {shortHash(item.entryHash)}</div>
                                    {item.batchGroupId && (
                                      <div className="text-teal-700 dark:text-teal-400">
                                        {t('advanceBatchId', { id: item.batchGroupId })}
                                      </div>
                                    )}
                                    {item.receiptAiSummary && (
                                      <div className="font-sans text-emerald-700 dark:text-emerald-400">
                                        {t('aiVerification', { summary: item.receiptAiSummary })}
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
                                              ? t('openReceiptPdf')
                                              : t('openTransferReceipt')}
                                          </span>
                                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                        </a>
                                      </div>
                                    )}
                                    {item.reviewerName && (
                                      <div className="font-sans text-slate-600 dark:text-slate-300">
                                        {t('reviewedByOnLine', {
                                          name: item.reviewerName,
                                          date: formatDateTime(item.reviewedAt),
                                          note: item.reviewNote || '',
                                        })}
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
            </>
          )}
      </motion.section>

      {mounted &&
        !isAdmin &&
        createPortal(
          <AnimatePresence>
            {depositModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="submit-capital-deposit-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => setDepositModalOpen(false)}
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
                  aria-hidden="true"
                />

                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 10 }}
                  transition={{ duration: 0.18 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-10 w-full max-w-xl bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/80 dark:ring-white/10 rounded-2xl shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)] overflow-hidden my-auto max-h-[90vh] flex flex-col"
                >
                  <div className="px-5 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 flex items-start justify-between gap-4 shrink-0">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span>{t('aesEnvelope')}</span>
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          ·
                        </span>
                        <span className="font-mono">{user.memberCode}</span>
                      </div>
                      <h2
                        id="submit-capital-deposit-modal-title"
                        className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white"
                      >
                        {t('submitCapitalDeposit')}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDepositModalOpen(false)}
                      aria-label={tCommon('closeDialog')}
                      className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="px-5 sm:px-6 py-5 overflow-y-auto space-y-4">
                    {prefillBanner && (
                      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                        <div className="font-semibold">{t('prefilledTitle')}</div>
                        <p className="text-amber-800 dark:text-amber-300 leading-relaxed">{prefillBanner}</p>
                      </div>
                    )}

                    <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span>{t('slipProofLabel')}</span>
                        </span>
                        {receiptPhotoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptPhotoUrl('');
                              setReceiptAiResult(null);
                              setReceiptNotice(null);
                            }}
                            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          >
                            {t('clear')}
                          </button>
                        )}
                      </div>

                      <label className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                        <FileImage className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>
                          {scanningReceipt
                            ? t('uploadingScanning')
                            : receiptPhotoUrl
                              ? t('replaceReceipt')
                              : t('uploadAutoFill')}
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
                              <span>{t('viewSlipPdf')}</span>
                            </>
                          ) : (
                            <span>{t('viewSlipImage')}</span>
                          )}
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t('primaryMonth')}
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
                          className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {effectiveBillingMonths.length > 1
                            ? t('totalMonthsAmount', { count: effectiveBillingMonths.length, ccy })
                            : t('amountWithCcy', { ccy })}
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
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
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
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600/30 cursor-pointer"
                        />
                        <span>{t('payMultipleAdvance')}</span>
                      </label>

                      <AnimatePresence initial={false}>
                        {advanceMode && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2"
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
                                    className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer disabled:cursor-default ${
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
                              {t('monthsSelectedSplit', {
                                count: effectiveBillingMonths.length,
                                perMonth: formatMoney(
                                  Math.round((Number(amount) || 0) / Math.max(1, effectiveBillingMonths.length)),
                                  ccy
                                ),
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('paymentChannel')}
                      </label>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/75 dark:border-slate-700/75">
                        <button
                          type="button"
                          onClick={() => {
                            setChannel('mfs');
                            setProviderName(MFS_PROVIDERS[0]);
                          }}
                          className={`relative py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            channel === 'mfs'
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {channel === 'mfs' && (
                            <motion.span
                              layoutId="contrib-channel-pill"
                              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                            />
                          )}
                          <span className="relative z-10">{t('mfsWallet')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChannel('bank');
                            setProviderName(BANK_PROVIDERS[0]);
                          }}
                          className={`relative py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            channel === 'bank'
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {channel === 'bank' && (
                            <motion.span
                              layoutId="contrib-channel-pill"
                              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                            />
                          )}
                          <span className="relative z-10">{t('bdBankTransfer')}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {channel === 'mfs' ? t('mfsWalletProvider') : t('bdBankName')}
                      </label>
                      <ProviderSelect
                        options={channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS}
                        value={providerName}
                        onChange={setProviderName}
                        placeholder={
                          channel === 'mfs'
                            ? t('searchMfsWallet')
                            : t('searchAllBdBanks', { count: BANK_PROVIDERS.length })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {channel === 'mfs' ? t('senderMobileLabel') : t('senderAccountRouting')}
                      </label>
                      <input
                        ref={senderInputRef}
                        type="text"
                        required
                        value={senderAccount}
                        onChange={(e) => setSenderAccount(e.target.value)}
                        placeholder={channel === 'mfs' ? '017XX-XXXXXX' : '2050-XXXX-XXXX'}
                        className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {channel === 'mfs' ? t('txNumberMfs') : t('txNumberBank')}
                      </label>
                      <input
                        type="text"
                        required
                        value={referenceId}
                        onChange={(e) => setReferenceId(e.target.value)}
                        placeholder={channel === 'mfs' ? 'e.g. BKX9984120A' : 'e.g. IBBL-BEFTN-8821'}
                        className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('optionalNote')}
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('optionalNotePlaceholder')}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                      />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setDepositModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        {tCommon('cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={modalBusy}
                        className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Lock className="w-4 h-4" aria-hidden="true" />
                        <span>{t('reviewSubmitBtn')}</span>
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
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
