'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Plus,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  formatMoney,
  formatShortDate,
  isPdfFileUrl,
} from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ProviderSelect } from './ProviderSelect.tsx';
import { RepaymentSchedule } from './RepaymentSchedule.tsx';
import { StatusText } from './StatusText.tsx';

interface LoansViewProps {
  loans: LoanRequest[];
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  user: PublicUser;
  loading: boolean;
  onOpenLoanModal?: () => void;
  onLoanCreated?: (loan: LoanRequest) => void;
  onViewMemberProfile?: (memberId: string) => void;
  onRefresh: () => Promise<void>;
}

type LoanActionModalState =
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

export function LoansView({
  loans,
  eligibility,
  config,
  availableLiquidity,
  user,
  loading,
  onOpenLoanModal,
  onLoanCreated,
  onViewMemberProfile,
  onRefresh,
}: LoansViewProps) {
  const t = useTranslations('Loans');
  const tCommon = useTranslations('Common');
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [modal, setModal] = useState<LoanActionModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [optimisticLoan, setOptimisticLoan] = useState<LoanRequest | null>(null);

  useEffect(() => {
    if (optimisticLoan && loans.some((l) => l.id === optimisticLoan.id)) {
      setOptimisticLoan(null);
    }
  }, [loans, optimisticLoan]);

  const effectiveLoans = useMemo(() => {
    if (!optimisticLoan) return loans;
    if (loans.some((l) => l.id === optimisticLoan.id)) return loans;
    return [optimisticLoan, ...loans];
  }, [loans, optimisticLoan]);

  const [payingInstallment, setPayingInstallment] = useState<{
    loanId: string;
    installmentNumber: number;
    amount: number;
  } | null>(null);
  const [repayChannel, setRepayChannel] = useState<'bank' | 'mfs'>('mfs');
  const [repayProvider, setRepayProvider] = useState<string>(MFS_PROVIDERS[0]);
  const [repayAccount, setRepayAccount] = useState('');
  const [repayRef, setRepayRef] = useState('');
  const [repayReceiptUrl, setRepayReceiptUrl] = useState('');
  const [scanningRepaySlip, setScanningRepaySlip] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleMonths, setRescheduleMonths] = useState('6');
  const [rescheduleReason, setRescheduleReason] = useState('');

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

  async function handleRepaySlipScan(file: File) {
    setScanningRepaySlip(true);
    try {
      const [uploadRes, aiRes] = await Promise.allSettled([
        api.uploadFile(file, {
          name: file.name,
          category: 'loan-repayment-slip',
          subject: payingInstallment
            ? `${user.memberCode}-${payingInstallment.loanId}-inst-${payingInstallment.installmentNumber}`
            : user.memberCode,
        }),
        api.verifyReceiptWithGemini(file),
      ]);
      if (uploadRes.status === 'fulfilled') {
        setRepayReceiptUrl(uploadRes.value.url);
      }
      if (aiRes.status === 'fulfilled' && aiRes.value.extraction) {
        const ext = aiRes.value.extraction;
        setRepayChannel(ext.channel);
        const list = ext.channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS;
        const norm = ext.providerName.trim().toLowerCase();
        const matched =
          list.find((p) => p.toLowerCase().includes(norm) || norm.includes(p.toLowerCase())) ||
          list[0];
        setRepayProvider(matched);
        if (ext.referenceId) setRepayRef(ext.referenceId);
        if (ext.senderAccount) setRepayAccount(ext.senderAccount);
        showNotice(
          'emerald',
          t('slipScannedTitle'),
          t('slipScannedDesc', { confidence: ext.confidence, summary: ext.summary })
        );
      } else if (uploadRes.status === 'fulfilled') {
        showNotice(
          'slate',
          t('receiptAttachedTitle'),
          t('receiptAttachedDesc')
        );
      } else {
        showNotice(
          'red',
          t('receiptUploadFailed'),
          t('receiptUploadFailedDesc')
        );
      }
    } finally {
      setScanningRepaySlip(false);
    }
  }

  function handleSubmitRepayment(e: FormEvent) {
    e.preventDefault();
    if (!payingInstallment) return;
    const target = payingInstallment;
    if (!repayAccount.trim() || !repayRef.trim()) {
      showNotice(
        'red',
        t('missingRepaymentTitle'),
        t('missingRepaymentDesc')
      );
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmRepaymentTitle', { num: target.installmentNumber }),
      description: t('confirmRepaymentDesc'),
      details: [
        { label: t('detailLoanId'), value: target.loanId },
        { label: t('detailInstallment'), value: `#${target.installmentNumber} · ${formatMoney(target.amount, ccy)}` },
        { label: t('detailChannelProvider'), value: `${repayChannel.toUpperCase()} · ${repayProvider}` },
        { label: t('detailSenderAccount'), value: repayAccount.trim() },
        { label: t('detailTxNumber'), value: repayRef.trim() },
      ],
      confirmLabel: t('submitRepaymentProofBtn'),
      run: async () => {
        await api.submitInstallmentRepayment(target.loanId, target.installmentNumber, {
          channel: repayChannel,
          providerName: repayProvider,
          senderAccount: repayAccount.trim(),
          referenceId: repayRef.trim(),
          receiptPhotoUrl: repayReceiptUrl || undefined,
        });
        setPayingInstallment(null);
        setRepayAccount('');
        setRepayRef('');
        setRepayReceiptUrl('');
        await onRefresh();
        showNotice(
          'emerald',
          t('repaymentSubmittedTitle'),
          t('repaymentSubmittedDesc')
        );
      },
    });
  }

  function confirmGuarantorRespond(loan: LoanRequest, decision: 'accept' | 'decline') {
    setModal({
      mode: 'confirm',
      tone: decision === 'accept' ? 'emerald' : 'red',
      title:
        decision === 'accept'
          ? t('coSignTitle', { id: loan.id })
          : t('declinePledgeTitle', { id: loan.id }),
      description:
        decision === 'accept'
          ? t('coSignDesc', { name: loan.borrowerName, amount: formatMoney(loan.amount, ccy) })
          : t('declinePledgeDesc', { name: loan.borrowerName }),
      details: [
        { label: t('detailBorrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('detailAmount'), value: formatMoney(loan.amount, ccy) },
        { label: t('detailPurpose'), value: loan.purpose },
      ],
      confirmLabel: decision === 'accept' ? t('confirmCoSignBtn') : t('confirmDeclineBtn'),
      run: async () => {
        await api.respondAsGuarantor(loan.id, decision);
        await onRefresh();
        showNotice(
          decision === 'accept' ? 'emerald' : 'amber',
          decision === 'accept' ? t('pledgeCoSignedTitle') : t('pledgeDeclinedTitle'),
          decision === 'accept'
            ? t('pledgeCoSignedDesc', { id: loan.id })
            : t('pledgeDeclinedDesc', { id: loan.id })
        );
      },
    });
  }

  function handleRequestReschedule(loanId: string, e: FormEvent) {
    e.preventDefault();
    const months = Number(rescheduleMonths);
    const reason = rescheduleReason.trim();
    if (!reason || reason.length < 6) {
      showNotice(
        'red',
        t('reasonShortTitle'),
        t('reasonShortDesc')
      );
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('confirmRescheduleTitle', { id: loanId }),
      description: t('confirmRescheduleDesc'),
      details: [
        { label: t('detailLoanId'), value: loanId },
        { label: t('detailRequestedMonths'), value: t('monthsCount', { count: months }) },
        { label: t('detailReason'), value: reason },
      ],
      confirmLabel: t('submitRescheduleBtn'),
      run: async () => {
        await api.requestLoanReschedule(loanId, {
          requestedMonths: months,
          reason,
        });
        setRescheduleOpen(false);
        setRescheduleReason('');
        await onRefresh();
        showNotice(
          'emerald',
          t('rescheduleSubmittedTitle'),
          t('rescheduleSubmittedDesc', { id: loanId })
        );
      },
    });
  }

  function confirmReviewReschedule(loanId: string, decision: 'approve' | 'reject') {
    setModal({
      mode: 'confirm',
      tone: decision === 'approve' ? 'emerald' : 'red',
      title:
        decision === 'approve'
          ? t('approveRescheduleTitle', { id: loanId })
          : t('declineRescheduleTitle', { id: loanId }),
      description:
        decision === 'approve'
          ? t('approveRescheduleDesc')
          : t('declineRescheduleDesc'),
      confirmLabel: decision === 'approve' ? t('approveRescheduleBtn') : t('declineRescheduleBtn'),
      run: async () => {
        await api.reviewLoanReschedule(loanId, decision);
        await onRefresh();
        showNotice(
          decision === 'approve' ? 'emerald' : 'amber',
          decision === 'approve' ? t('rescheduleApprovedTitle') : t('rescheduleDeclinedTitle'),
          decision === 'approve'
            ? t('rescheduleApprovedDesc', { id: loanId })
            : t('rescheduleDeclinedDesc', { id: loanId })
        );
      },
    });
  }

  function confirmVerifyInstallment(
    loan: LoanRequest,
    installmentNumber: number,
    decision: 'approve' | 'reject'
  ) {
    const inst = loan.installments.find((i) => i.installmentNumber === installmentNumber);
    const txNo = inst?.decryptedReceipt?.referenceId || inst?.maskedReference || '—';
    if (decision === 'approve') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: t('acceptInstTitle', { num: installmentNumber }),
        description: t('acceptInstDesc'),
        details: [
          { label: t('detailLoanBorrower'), value: `${loan.id} · ${loan.borrowerName}` },
          { label: t('detailInstAmount'), value: formatMoney(inst?.amount || 0, ccy) },
          { label: t('detailProvider'), value: inst?.repaymentProvider || '—' },
          { label: t('detailTxNumber'), value: txNo },
        ],
        confirmLabel: t('acceptCreditBtn'),
        run: async () => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'approve');
          await onRefresh();
          showNotice(
            'emerald',
            t('instVerifiedTitle', { num: installmentNumber }),
            t('instVerifiedDesc', { num: installmentNumber, txNo })
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: t('denyInstTitle', { num: installmentNumber }),
        description: t('denyInstDesc'),
        details: [
          { label: t('detailLoanBorrower'), value: `${loan.id} · ${loan.borrowerName}` },
          { label: t('detailTxNumber'), value: txNo },
        ],
        inputLabel: t('correctionNoteBorrower'),
        inputPlaceholder: t('correctionNotePlaceholder'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('denySendNoteBtn'),
        run: async (note) => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'reject', note);
          await onRefresh();
          showNotice(
            'amber',
            t('instDeniedTitle', { num: installmentNumber }),
            t('instDeniedDesc', { num: installmentNumber, name: loan.borrowerName })
          );
        },
      });
    }
  }

  function confirmQuickLoanVote(loan: LoanRequest, decision: 'upvote' | 'downvote') {
    setModal({
      mode: 'confirm',
      tone: decision === 'upvote' ? 'emerald' : 'red',
      title:
        decision === 'upvote'
          ? t('confirmUpvoteTitle', { id: loan.id })
          : t('confirmDownvoteTitle', { id: loan.id }),
      description: t('secretBallotDesc'),
      details: [
        { label: t('detailBorrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('detailRequestedAmount'), value: formatMoney(loan.amount, ccy) },
        { label: t('detailPurpose'), value: loan.purpose },
      ],
      confirmLabel: decision === 'upvote' ? t('castSecretUpvote') : t('castSecretDownvote'),
      run: async () => {
        await api.voteLoan(loan.id, decision);
        await onRefresh();
        showNotice(
          'emerald',
          t('ballotRecordedTitle'),
          decision === 'upvote'
            ? t('ballotRecordedUpvote', { id: loan.id })
            : t('ballotRecordedDownvote', { id: loan.id })
        );
      },
    });
  }

  const isBorrowerLoan = (l: LoanRequest) =>
    l.borrowerId === user.id || (Boolean(user.memberCode) && l.borrowerCode === user.memberCode);

  const myGuarantorRequests = effectiveLoans.filter(
    (l) =>
      l.status === 'pending_guarantor' &&
      l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
  );

  const visibleLoans = scope === 'mine' ? effectiveLoans.filter(isBorrowerLoan) : effectiveLoans;
  const activeSelectedLoan =
    visibleLoans.find((l) => l.id === selectedLoanId) || visibleLoans[0] || null;

  const currentYear = new Date().getFullYear();
  const maxLoansPerYear = eligibility?.maxLoansPerYear ?? config?.maxLoansPerYear ?? 3;
  const usedLoansThisYear = eligibility?.loansUsedThisYear ?? 0;
  const remainingYearlyQuota = Math.max(0, maxLoansPerYear - usedLoansThisYear);
  const quotaRemainingPct =
    maxLoansPerYear > 0
      ? Math.min(100, Math.round((remainingYearlyQuota / maxLoansPerYear) * 100))
      : 0;

  const myActiveOrPendingLoan =
    effectiveLoans.find(
      (l) =>
        isBorrowerLoan(l) &&
        [
          'pending_guarantor',
          'pending_manager_review',
          'pending_vote',
          'approved_pending_disbursement',
          'active',
        ].includes(l.status)
    ) ||
    (eligibility?.activeLoanId
      ? effectiveLoans.find(
          (l) => l.id === eligibility.activeLoanId && l.status !== 'rejected' && l.status !== 'repaid'
        ) || null
      : null);

  const hasSyncedEligibilityActive = Boolean(
    !myActiveOrPendingLoan && eligibility && !eligibility.noActiveLoan && eligibility.activeLoanId
  );

  let loanProgressPct = 0;
  let loanProgressCaption = t('progressNone');
  let loanBarColorClass = 'bg-slate-400 dark:bg-slate-600';

  if (myActiveOrPendingLoan) {
    if (myActiveOrPendingLoan.status === 'pending_guarantor') {
      loanProgressPct = 15;
      loanProgressCaption = t('progressGuarantor');
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'pending_manager_review') {
      loanProgressPct = 30;
      loanProgressCaption = t('progressManager');
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'pending_vote') {
      const revealed = Boolean(myActiveOrPendingLoan.voteResultRevealed);
      const approveCount =
        myActiveOrPendingLoan.approveCount ??
        myActiveOrPendingLoan.votes.filter((v) => v.decision === 'approve').length;
      if (revealed || isAdmin) {
        loanProgressPct = Math.min(
          100,
          Math.round((approveCount / Math.max(1, myActiveOrPendingLoan.requiredApprovals)) * 100)
        );
        loanProgressCaption = t('progressBallotRevealed', {
          approved: approveCount,
          required: myActiveOrPendingLoan.requiredApprovals,
          pct: loanProgressPct,
        });
      } else {
        const cast = myActiveOrPendingLoan.totalVotesCast ?? myActiveOrPendingLoan.votes.length;
        loanProgressPct = Math.min(
          95,
          Math.round((cast / Math.max(1, myActiveOrPendingLoan.totalEligibleVoters)) * 100)
        );
        loanProgressCaption = t('progressBallotSecret', { cast });
      }
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'approved_pending_disbursement') {
      loanProgressPct = 100;
      loanProgressCaption = t('progressApprovedDisburse');
      loanBarColorClass = 'bg-teal-600 dark:bg-teal-500';
    } else if (myActiveOrPendingLoan.status === 'active') {
      const paidInstallments = myActiveOrPendingLoan.installments.filter(
        (i) => i.status === 'paid'
      ).length;
      loanProgressPct =
        myActiveOrPendingLoan.amount > 0
          ? Math.min(
              100,
              Math.round((myActiveOrPendingLoan.totalRepaid / myActiveOrPendingLoan.amount) * 100)
            )
          : 0;
      loanProgressCaption = t('progressActiveRepaid', {
        repaid: formatMoney(myActiveOrPendingLoan.totalRepaid, ccy),
        total: formatMoney(myActiveOrPendingLoan.amount, ccy),
        paid: paidInstallments,
        count: myActiveOrPendingLoan.installments.length,
        pct: loanProgressPct,
      });
      loanBarColorClass = 'bg-emerald-600';
    }
  } else if (hasSyncedEligibilityActive && eligibility?.activeLoanId) {
    loanProgressPct = 30;
    loanProgressCaption = eligibility.reasons[0] || t('progressQueued');
    loanBarColorClass = 'bg-amber-500';
  }

  return (
    <div className="space-y-6">
      {myGuarantorRequests.length > 0 && (
        <section className="bg-amber-50/80 dark:bg-amber-950/35 backdrop-blur-xl border border-amber-200/80 dark:border-amber-900/60 ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-5 space-y-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>
              {myGuarantorRequests.length > 1
                ? t('pendingGuarantorMulti', { count: myGuarantorRequests.length })
                : t('pendingGuarantorSingle', { count: myGuarantorRequests.length })}
            </span>
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {myGuarantorRequests.map((loan) => (
              <div
                key={loan.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {loan.borrowerName} ({loan.borrowerCode}) ·{' '}
                    <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {loan.id} · {loan.purpose} ({t('monthlyInstallmentsCount', { count: loan.installmentMonths })})
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 [&>button]:min-h-[44px] sm:[&>button]:min-h-0">
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmGuarantorRespond(loan, 'accept')}
                    className="px-3.5 py-2 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {t('acceptCoSign')}
                  </button>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmGuarantorRespond(loan, 'decline')}
                    className="px-3.5 py-2 sm:py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {t('decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isAdmin && (
        <section
          aria-label={t('quotaSummaryAria')}
          className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200"
        >
          {!eligibility && loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton height={76} />
              <Skeleton height={76} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x md:divide-slate-100 dark:md:divide-slate-800">
              <div className="space-y-2.5 md:pr-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('remainingYearlyQuota', { year: currentYear })}
                    </div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {t('remainingOfMax', { remaining: remainingYearlyQuota, max: maxLoansPerYear })}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {t('usedCountShort', { used: usedLoansThisYear })}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label={t('remainingYearlyQuota', { year: currentYear })}
                  aria-valuenow={remainingYearlyQuota}
                  aria-valuemin={0}
                  aria-valuemax={maxLoansPerYear}
                  className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${
                      remainingYearlyQuota === 0
                        ? 'bg-rose-600'
                        : remainingYearlyQuota === 1
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    }`}
                    style={{ width: `${quotaRemainingPct}%`, originX: 0 }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {remainingYearlyQuota > 0
                      ? remainingYearlyQuota === 1
                        ? t('slotsAvailableSingle', { count: remainingYearlyQuota })
                        : t('slotsAvailableMulti', { count: remainingYearlyQuota })
                      : t('annualLimitReached', { max: maxLoansPerYear })}
                  </span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {t('pctLeft', { pct: quotaRemainingPct })}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('appAndLoanStatus')}
                    </div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                      {myActiveOrPendingLoan
                        ? `${myActiveOrPendingLoan.id} · ${formatMoney(myActiveOrPendingLoan.amount, ccy)}`
                        : hasSyncedEligibilityActive && eligibility?.activeLoanId
                          ? t('activeRequestLabel', { id: eligibility.activeLoanId })
                          : t('noActiveRequest')}
                    </div>
                  </div>
                  {myActiveOrPendingLoan ? (
                    <StatusText status={myActiveOrPendingLoan.status} />
                  ) : hasSyncedEligibilityActive ? (
                    <StatusText status="pending_manager_review" />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t('clearStanding')}</span>
                    </span>
                  )}
                </div>

                <div
                  role="progressbar"
                  aria-label={t('appAndLoanStatus')}
                  aria-valuenow={loanProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${loanBarColorClass}`}
                    style={{ width: `${loanProgressPct}%`, originX: 0 }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">{loanProgressCaption}</span>
                  {(myActiveOrPendingLoan || hasSyncedEligibilityActive) && (
                    <span className="font-mono tabular-nums shrink-0 text-teal-700 dark:text-teal-400">
                      {loanProgressPct}%
                    </span>
                  )}
                </div>

                {myActiveOrPendingLoan &&
                  (myActiveOrPendingLoan.status === 'pending_manager_review' ||
                    myActiveOrPendingLoan.status === 'pending_guarantor') && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('withdrawHint')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const loanId = myActiveOrPendingLoan.id;
                          setModal({
                            mode: 'confirm',
                            tone: 'amber',
                            title: t('withdrawTitle'),
                            description: t('withdrawDesc', { id: loanId }),
                            details: [
                              { label: t('detailApplication'), value: loanId },
                              {
                                label: t('detailAmount'),
                                value: formatMoney(myActiveOrPendingLoan.amount, ccy),
                              },
                              {
                                label: t('detailStatus'),
                                value: myActiveOrPendingLoan.status.replace(/_/g, ' '),
                              },
                            ],
                            confirmLabel: t('confirmWithdrawBtn'),
                            run: async () => {
                              await api.withdrawLoan(loanId);
                              if (optimisticLoan?.id === loanId) {
                                setOptimisticLoan(null);
                              }
                              await onRefresh();
                              setModal({
                                mode: 'notice',
                                tone: 'emerald',
                                title: t('withdrawnTitle'),
                                description: t('withdrawnDesc', { id: loanId }),
                              });
                            },
                          });
                        }}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs sm:text-[11px] font-medium hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer shrink-0"
                      >
                        {t('withdrawBtn')}
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}
        </section>
      )}

      {!isAdmin && (
        <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('eligibilityHeading')}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {eligibility && (
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {eligibility.eligible ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>{t('eligibleToRequest')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400">
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      <span>{t('currentlyNotEligible')}</span>
                    </span>
                  )}
                </div>
              )}
              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={onOpenLoanModal}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('openRequestModal')}</span>
                </button>
              )}
            </div>
          </div>

          {eligibility ? (
            <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/60 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{t('check1Title')}</span>
                  <span
                    className={
                      eligibility.noActiveLoan
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'font-medium text-red-700 dark:text-red-400'
                    }
                  >
                    {eligibility.noActiveLoan ? t('passed') : t('blocked')}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {eligibility.noActiveLoan
                    ? t('noActiveOnAccount')
                    : t('activePendingId', { id: eligibility.activeLoanId || '' })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/60 hover:border-amber-300 dark:hover:border-amber-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{t('check2Title')}</span>
                  <span
                    className={
                      eligibility.quotaAvailable
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'font-medium text-red-700 dark:text-red-400'
                    }
                  >
                    {eligibility.quotaAvailable ? t('available') : t('exhausted')}
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {t('loansUsedThisYear', {
                    used: eligibility.loansUsedThisYear,
                    max: eligibility.maxLoansPerYear,
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/60 hover:border-teal-300 dark:hover:border-teal-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{t('check3Title')}</span>
                  <span
                    className={
                      eligibility.beforeMaturityDate
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'font-medium text-amber-700 dark:text-amber-400'
                    }
                  >
                    {eligibility.beforeMaturityDate ? t('qardActiveWindow') : t('postMaturity')}
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">
                  {t('maturityPrefix', { date: formatShortDate(config?.maturityDate) })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/60 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{t('check4Title')}</span>
                  <span
                    className={
                      eligibility.noOverdueInstallments
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'font-medium text-red-700 dark:text-red-400'
                    }
                  >
                    {eligibility.noOverdueInstallments ? t('clear') : t('overdue')}
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {eligibility.noOverdueInstallments
                    ? t('zeroOverdue')
                    : t('overdueCountLabel', { count: eligibility.overdueCount || 1 })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Skeleton height={68} />
            </div>
          )}
        </section>
      )}

      <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('portfolioHeading')}
            </h3>
          </div>

          {!isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/75 dark:border-slate-700/75">
                {(
                  [
                    { id: 'mine', label: t('myLoans') },
                    { id: 'all', label: t('allLoans') },
                  ] as const
                ).map((tab) => {
                  const active = scope === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setScope(tab.id)}
                      className={`relative px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="loans-scope-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={onOpenLoanModal}
                  className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('openRequestModal')}</span>
                </button>
              )}
            </div>
          )}
        </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80"
                >
                  <div className="col-span-5 space-y-1">
                    <Skeleton width="70%" height={14} />
                    <Skeleton width="50%" height={11} />
                  </div>
                  <div className="col-span-2">
                    <Skeleton width="80%" height={14} />
                  </div>
                  <div className="col-span-2">
                    <Skeleton width="80%" height={14} />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <Skeleton width={76} height={22} borderRadius={6} />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleLoans.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {scope === 'mine' ? t('emptyMine') : t('emptyAll')}
            </div>
          ) : (
            <>
              <div className="lg:hidden space-y-2.5">
                {visibleLoans.map((loan) => {
                  const isSelected = activeSelectedLoan?.id === loan.id;
                  return (
                    <div
                      key={loan.id}
                      onClick={() => setSelectedLoanId(loan.id)}
                      className={`rounded-xl border p-3.5 space-y-2.5 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-xs'
                          : 'border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            {onViewMemberProfile ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewMemberProfile(loan.borrowerId);
                                }}
                                className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                              >
                                {loan.borrowerName}
                              </button>
                            ) : (
                              <span>{loan.borrowerName}</span>
                            )}
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              · {loan.borrowerCode}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {loan.id} · {loan.purpose}
                          </div>
                        </div>
                        <StatusText status={loan.status} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('principal')}</div>
                          <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(loan.amount, ccy)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('repaid')}</div>
                          <div className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatMoney(loan.totalRepaid, ccy)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('remaining')}</div>
                          <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(loan.remainingBalance, ccy)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden lg:block overflow-x-auto border border-slate-200/85 dark:border-slate-800/85 rounded-xl bg-white/55 dark:bg-slate-950/35">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4">{t('colLoanBorrower')}</th>
                      <th className="py-2.5 px-4 text-right">{t('principal')}</th>
                      <th className="py-2.5 px-4 text-right">{t('repaid')}</th>
                      <th className="py-2.5 px-4 text-right">{t('remaining')}</th>
                      <th className="py-2.5 px-4">{t('colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleLoans.map((loan) => {
                      const isSelected = activeSelectedLoan?.id === loan.id;
                      return (
                        <tr
                          key={loan.id}
                          onClick={() => setSelectedLoanId(loan.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/35'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                              {onViewMemberProfile ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewMemberProfile(loan.borrowerId);
                                  }}
                                  className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                                >
                                  {loan.borrowerName}
                                </button>
                              ) : (
                                <span>{loan.borrowerName}</span>
                              )}
                              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                · {loan.borrowerCode}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                              {loan.id} · {loan.purpose}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(loan.amount, ccy)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatMoney(loan.totalRepaid, ccy)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(loan.remainingBalance, ccy)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusText status={loan.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {activeSelectedLoan && (
                <div className="pt-2 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t('installmentScheduleTitle', { id: activeSelectedLoan.id })}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('installmentsAtZero', {
                          months: activeSelectedLoan.installmentMonths,
                          amount: formatMoney(activeSelectedLoan.monthlyInstallment, ccy),
                        })}
                        {activeSelectedLoan.decryptedSensitiveNotes
                          ? ` · ${activeSelectedLoan.decryptedSensitiveNotes.channel.toUpperCase()} · ${activeSelectedLoan.decryptedSensitiveNotes.provider}`
                          : ''}
                      </p>
                    </div>
                    {activeSelectedLoan.disbursementSignature && (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                        <span>
                          {t('disbursedBy', { name: activeSelectedLoan.disbursementSignature.signedByName })}
                          {activeSelectedLoan.disbursementSignature.transactionNumber
                            ? ` · Tx #${activeSelectedLoan.disbursementSignature.transactionNumber}`
                            : ''}
                        </span>
                      </span>
                    )}
                  </div>

                  {activeSelectedLoan.status === 'pending_vote' && (() => {
                    const revealed = Boolean(activeSelectedLoan.voteResultRevealed);
                    const upvotes =
                      activeSelectedLoan.approveCount ??
                      activeSelectedLoan.votes.filter((v) => v.decision === 'approve').length;
                    const downvotes =
                      activeSelectedLoan.rejectCount ??
                      activeSelectedLoan.votes.filter((v) => v.decision === 'reject').length;
                    const myVote = activeSelectedLoan.votes.find(
                      (v) => v.isSelf || v.voterId === user.id
                    );
                    const cast = activeSelectedLoan.totalVotesCast ?? activeSelectedLoan.votes.length;
                    const pct = revealed || isAdmin
                      ? Math.min(100, Math.round((upvotes / activeSelectedLoan.requiredApprovals) * 100))
                      : Math.min(95, Math.round((cast / Math.max(1, activeSelectedLoan.totalEligibleVoters)) * 100));

                    return (
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {revealed || isAdmin ? t('twoThirdsVote') : t('pollOngoingSecret')}
                            </span>
                            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                              ·
                            </span>
                            {revealed || isAdmin ? (
                              <>
                                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {t('upvotesRatio', { upvotes, required: activeSelectedLoan.requiredApprovals })}
                                </span>
                                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums text-red-700 dark:text-red-400">
                                  {t('downvotesCount', { count: downvotes })}
                                </span>
                              </>
                            ) : (
                              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                {t('ballotsCastRatio', { cast, total: activeSelectedLoan.totalEligibleVoters })}
                              </span>
                            )}
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <motion.div
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                              className={`h-full rounded-full ${
                                revealed || isAdmin
                                  ? 'bg-emerald-600'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${pct}%`, originX: 0 }}
                            />
                          </div>
                        </div>

                        {!isAdmin && user.status === 'active' && !myVote && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={modalBusy}
                              onClick={() => confirmQuickLoanVote(activeSelectedLoan, 'upvote')}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-150 active:scale-[0.98] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('upvote')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={modalBusy}
                              onClick={() => confirmQuickLoanVote(activeSelectedLoan, 'downvote')}
                              className="px-3.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-150 text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('downvote')}</span>
                            </button>
                          </div>
                        )}
                        {myVote && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                            {myVote.decision === 'approve' ? t('youUpvoted') : t('youDownvoted')}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {activeSelectedLoan.guarantors && activeSelectedLoan.guarantors.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>{t('coSigningGuarantors')}</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        {activeSelectedLoan.guarantors.map((g) => (
                          <span key={g.memberId} className="font-mono text-slate-700 dark:text-slate-300">
                            {g.memberName} ({g.memberCode}) ·{' '}
                            <span
                              className={
                                g.status === 'accepted'
                                  ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                  : g.status === 'declined'
                                    ? 'text-red-700 dark:text-red-400 font-semibold'
                                    : 'text-amber-700 dark:text-amber-400 font-semibold'
                              }
                            >
                              {g.status}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeSelectedLoan.status === 'active' && (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <CalendarClock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span>{t('rescheduleHeading')}</span>
                        </span>
                        {(activeSelectedLoan.borrowerId === user.id || isStaff) &&
                          activeSelectedLoan.rescheduleRequest?.status !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => setRescheduleOpen((prev) => !prev)}
                              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {rescheduleOpen ? t('closeForm') : t('requestExtension')}
                            </button>
                          )}
                      </div>

                      {activeSelectedLoan.rescheduleRequest && (
                        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {t('rescheduleToMonths', { months: activeSelectedLoan.rescheduleRequest.requestedMonths })} ·{' '}
                              <span className="uppercase font-mono text-[11px]">
                                {activeSelectedLoan.rescheduleRequest.status}
                              </span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">
                              {t('reasonPrefix', { reason: activeSelectedLoan.rescheduleRequest.reason })}
                            </div>
                          </div>
                          {isStaff && activeSelectedLoan.rescheduleRequest.status === 'pending' && (
                            isAdmin || activeSelectedLoan.borrowerId !== user.id ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={modalBusy}
                                  onClick={() =>
                                    confirmReviewReschedule(activeSelectedLoan.id, 'approve')
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                                >
                                  {t('approve')}
                                </button>
                                <button
                                  type="button"
                                  disabled={modalBusy}
                                  onClick={() =>
                                    confirmReviewReschedule(activeSelectedLoan.id, 'reject')
                                  }
                                  className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-medium cursor-pointer disabled:opacity-50"
                                >
                                  {t('reject')}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
                                {t('peerAdminReview')}
                              </span>
                            )
                          )}
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {rescheduleOpen && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            onSubmit={(e) => handleRequestReschedule(activeSelectedLoan.id, e)}
                            className="overflow-hidden grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1"
                          >
                            <div className="sm:col-span-3">
                              <input
                                type="number"
                                min={1}
                                max={36}
                                required
                                value={rescheduleMonths}
                                onChange={(e) => setRescheduleMonths(e.target.value)}
                                placeholder={t('monthsPlaceholder')}
                                className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div className="sm:col-span-6">
                              <input
                                type="text"
                                required
                                minLength={6}
                                value={rescheduleReason}
                                onChange={(e) => setRescheduleReason(e.target.value)}
                                placeholder={t('rescheduleReasonPlaceholder')}
                                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <button
                                type="submit"
                                disabled={modalBusy}
                                className="w-full py-1.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                {t('submitRequest')}
                              </button>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {payingInstallment && payingInstallment.loanId === activeSelectedLoan.id && (
                      <motion.form
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={handleSubmitRepayment}
                        className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/20 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {t('submitRepayHeading', {
                              num: payingInstallment.installmentNumber,
                              amount: formatMoney(payingInstallment.amount, ccy),
                            })}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-teal-700 dark:text-teal-400 cursor-pointer">
                              <Sparkles className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {scanningRepaySlip ? t('scanning') : t('scanSlipAi')}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                                disabled={scanningRepaySlip}
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleRepaySlipScan(file);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setPayingInstallment(null)}
                              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {t('cancel')}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              {t('channelLabel')}
                            </label>
                            <select
                              value={repayChannel}
                              onChange={(e) => {
                                const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                                setRepayChannel(ch);
                                setRepayProvider(ch === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]);
                              }}
                              className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            >
                              <option value="mfs">{t('mfsWalletShort')}</option>
                              <option value="bank">{t('bdBankShort')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              {repayChannel === 'mfs' ? t('mfsWalletShort') : t('bdBankLabel')}
                            </label>
                            <ProviderSelect
                              compact
                              options={repayChannel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS}
                              value={repayProvider}
                              onChange={setRepayProvider}
                              placeholder={
                                repayChannel === 'mfs'
                                  ? t('searchMfsShort')
                                  : t('searchBdBanksShort', { count: BANK_PROVIDERS.length })
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              {t('senderAcctMobile')}
                            </label>
                            <input
                              type="text"
                              required
                              value={repayAccount}
                              onChange={(e) => setRepayAccount(e.target.value)}
                              placeholder={t('senderPlaceholder')}
                              className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              {t('txNumberLabel')}
                            </label>
                            <input
                              type="text"
                              required
                              value={repayRef}
                              onChange={(e) => setRepayRef(e.target.value)}
                              placeholder={t('txPlaceholder')}
                              className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {repayReceiptUrl ? (
                            <a
                              href={repayReceiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400 hover:underline"
                            >
                              <FileImage className="w-3 h-3" aria-hidden="true" />
                              <span>{t('slipAttached')}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="hidden sm:inline" />
                          )}
                          <button
                            type="submit"
                            disabled={modalBusy}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                          >
                            {t('reviewSubmitReceipt')}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  <div className="lg:hidden space-y-2.5">
                    {activeSelectedLoan.installments.map((inst) => {
                      const canPay =
                        !isAdmin &&
                        activeSelectedLoan.status === 'active' &&
                        (inst.status === 'scheduled' || inst.status === 'overdue') &&
                        (activeSelectedLoan.borrowerId === user.id || user.role === 'manager');
                      const canVerify =
                        isStaff &&
                        inst.status === 'pending_verification' &&
                        (isAdmin || activeSelectedLoan.borrowerId !== user.id);
                      const txNumber =
                        inst.decryptedReceipt?.referenceId || inst.maskedReference;

                      return (
                        <div
                          key={inst.installmentNumber}
                          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/70 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-semibold text-slate-900 dark:text-white font-mono">
                                {t('installmentRowTitle', { num: inst.installmentNumber })} · {formatShortDate(inst.dueDate)}
                              </div>
                              <div className="mt-0.5">
                                <StatusText status={inst.status} />
                              </div>
                            </div>
                            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                              {formatMoney(inst.amount, ccy)}
                            </div>
                          </div>

                          {(inst.repaymentProvider || inst.rejectionNote || inst.verifierName) && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                              {inst.repaymentProvider && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{inst.repaymentProvider}</span>
                                  {txNumber && (
                                    <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                                      · Tx #{txNumber}
                                    </span>
                                  )}
                                  {inst.receiptPhotoUrl && (
                                    <a
                                      href={inst.receiptPhotoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>{isPdfFileUrl(inst.receiptPhotoUrl) ? t('slipPdf') : t('slip')}</span>
                                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    </a>
                                  )}
                                </div>
                              )}
                              {inst.rejectionNote && (
                                <div className="text-red-700 dark:text-red-400">
                                  {t('correctionNotePrefix', { note: inst.rejectionNote })}
                                </div>
                              )}
                              {!canPay && !canVerify && inst.verifierName && (
                                <div>{t('verifiedBy', { name: inst.verifierName })}</div>
                              )}
                            </div>
                          )}

                          {canPay && (
                            <button
                              type="button"
                              onClick={() =>
                                setPayingInstallment({
                                  loanId: activeSelectedLoan.id,
                                  installmentNumber: inst.installmentNumber,
                                  amount: inst.amount,
                                })
                              }
                              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs font-semibold cursor-pointer"
                            >
                              {inst.status === 'overdue' ? t('payOverdueInstallment') : t('payInstallment')}
                            </button>
                          )}

                          {canVerify && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={modalBusy}
                                onClick={() =>
                                  confirmVerifyInstallment(
                                    activeSelectedLoan,
                                    inst.installmentNumber,
                                    'approve'
                                  )
                                }
                                className="min-h-[44px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-4 h-4" aria-hidden="true" />
                                <span>{t('verify')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={modalBusy}
                                onClick={() =>
                                  confirmVerifyInstallment(
                                    activeSelectedLoan,
                                    inst.installmentNumber,
                                    'reject'
                                  )
                                }
                                className="min-h-[44px] px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <X className="w-4 h-4" aria-hidden="true" />
                                <span>{t('deny')}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden lg:block overflow-x-auto border border-slate-200/85 dark:border-slate-800/85 rounded-xl bg-white/55 dark:bg-slate-950/35">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">{t('colDueDate')}</th>
                          <th className="py-2.5 px-3 text-right">{t('colAmount')}</th>
                          <th className="py-2.5 px-3">{t('colBankTx')}</th>
                          <th className="py-2.5 px-3">{t('colStatus')}</th>
                          <th className="py-2.5 px-3 text-right">{t('colAction')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeSelectedLoan.installments.map((inst) => {
                          const canPay =
                            !isAdmin &&
                            activeSelectedLoan.status === 'active' &&
                            (inst.status === 'scheduled' || inst.status === 'overdue') &&
                            (activeSelectedLoan.borrowerId === user.id || user.role === 'manager');
                          const canVerify =
                            isStaff &&
                            inst.status === 'pending_verification' &&
                            (isAdmin || activeSelectedLoan.borrowerId !== user.id);
                          const txNumber =
                            inst.decryptedReceipt?.referenceId || inst.maskedReference;

                          return (
                            <tr key={inst.installmentNumber}>
                              <td className="py-2.5 px-3 font-mono font-medium">
                                #{inst.installmentNumber}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                                {formatShortDate(inst.dueDate)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                                {formatMoney(inst.amount, ccy)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                {inst.repaymentProvider ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>{inst.repaymentProvider}</span>
                                    {txNumber && (
                                      <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                                        · Tx #{txNumber}
                                      </span>
                                    )}
                                    {inst.receiptPhotoUrl && (
                                      <a
                                        href={inst.receiptPhotoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                      >
                                        <span>{isPdfFileUrl(inst.receiptPhotoUrl) ? t('slipPdf') : t('slip')}</span>
                                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  '—'
                                )}
                                {inst.rejectionNote && (
                                  <div className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                                    {t('correctionNotePrefix', { note: inst.rejectionNote })}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <StatusText status={inst.status} />
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {canPay && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPayingInstallment({
                                        loanId: activeSelectedLoan.id,
                                        installmentNumber: inst.installmentNumber,
                                        amount: inst.amount,
                                      })
                                    }
                                    className="px-2.5 py-1 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium cursor-pointer"
                                  >
                                    {inst.status === 'overdue' ? t('payOverdue') : t('payInstallment')}
                                  </button>
                                )}
                                {canVerify && (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={modalBusy}
                                      onClick={() =>
                                        confirmVerifyInstallment(
                                          activeSelectedLoan,
                                          inst.installmentNumber,
                                          'approve'
                                        )
                                      }
                                      className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                      title={t('verifyTooltip')}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={modalBusy}
                                      onClick={() =>
                                        confirmVerifyInstallment(
                                          activeSelectedLoan,
                                          inst.installmentNumber,
                                          'reject'
                                        )
                                      }
                                      className="p-1 rounded border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 cursor-pointer"
                                      title={t('denyTooltip')}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {!canPay && !canVerify && (
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {inst.verifierName ? t('verifiedBy', { name: inst.verifierName }) : '—'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

      <RepaymentSchedule
        loans={loans}
        config={config}
        user={user}
        loading={loading}
        onOpenLoanModal={onOpenLoanModal}
        hideFooterLink
      />

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
