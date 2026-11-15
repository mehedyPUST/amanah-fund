'use client';

import { useState, type FormEvent } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  FileImage,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  formatMoney,
  formatShortDate,
} from '../utils/format.ts';
import { RequestQardHasanLoanForm } from './RequestQardHasanLoanForm.tsx';
import { StatusText } from './StatusText.tsx';

interface LoansViewProps {
  loans: LoanRequest[];
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  user: PublicUser;
  loading: boolean;
  onOpenLoanModal?: () => void;
  onRefresh: () => Promise<void>;
}

export function LoansView({
  loans,
  eligibility,
  config,
  availableLiquidity,
  user,
  loading,
  onOpenLoanModal,
  onRefresh,
}: LoansViewProps) {
  const ccy = config?.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  // Installment payment form state
  const [payingInstallment, setPayingInstallment] = useState<{
    loanId: string;
    installmentNumber: number;
  } | null>(null);
  const [repayChannel, setRepayChannel] = useState<'bank' | 'mfs'>('mfs');
  const [repayProvider, setRepayProvider] = useState<string>(MFS_PROVIDERS[0]);
  const [repayAccount, setRepayAccount] = useState('');
  const [repayRef, setRepayRef] = useState('');
  const [repayReceiptUrl, setRepayReceiptUrl] = useState('');
  const [scanningRepaySlip, setScanningRepaySlip] = useState(false);
  const [repayBusy, setRepayBusy] = useState(false);
  const [guarantorBusyId, setGuarantorBusyId] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleMonths, setRescheduleMonths] = useState('6');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  async function handleRepaySlipScan(file: File) {
    setScanningRepaySlip(true);
    setFeedback(null);
    try {
      const [uploadRes, aiRes] = await Promise.allSettled([
        api.uploadImage(file, `repay-receipt-${Date.now()}`),
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
        setFeedback({
          type: 'success',
          text: `Gemini AI parsed slip (${ext.confidence}): ${ext.summary}`,
        });
      } else if (uploadRes.status === 'fulfilled') {
        setFeedback({
          type: 'success',
          text: 'Receipt image attached. Verify TrxID and sender account before submitting.',
        });
      }
    } finally {
      setScanningRepaySlip(false);
    }
  }

  async function handleSubmitRepayment(e: FormEvent) {
    e.preventDefault();
    if (!payingInstallment) return;
    setRepayBusy(true);
    setFeedback(null);
    try {
      await api.submitInstallmentRepayment(
        payingInstallment.loanId,
        payingInstallment.installmentNumber,
        {
          channel: repayChannel,
          providerName: repayProvider,
          senderAccount: repayAccount,
          referenceId: repayRef,
          receiptPhotoUrl: repayReceiptUrl || undefined,
        }
      );
      setPayingInstallment(null);
      setRepayAccount('');
      setRepayRef('');
      setRepayReceiptUrl('');
      setFeedback({
        type: 'success',
        text: 'Installment repayment receipt encrypted and submitted for Manager verification.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit installment repayment.',
      });
    } finally {
      setRepayBusy(false);
    }
  }

  async function handleGuarantorRespond(loanId: string, decision: 'accept' | 'decline') {
    setGuarantorBusyId(loanId);
    setFeedback(null);
    try {
      await api.respondAsGuarantor(loanId, decision);
      setFeedback({
        type: 'success',
        text:
          decision === 'accept'
            ? `Co-signed guarantor pledge for ${loanId}.`
            : `Declined guarantor pledge for ${loanId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to record guarantor response.',
      });
    } finally {
      setGuarantorBusyId(null);
    }
  }

  async function handleRequestReschedule(loanId: string, e: FormEvent) {
    e.preventDefault();
    setRescheduleBusy(true);
    setFeedback(null);
    try {
      await api.requestLoanReschedule(loanId, {
        requestedMonths: Number(rescheduleMonths),
        reason: rescheduleReason,
      });
      setRescheduleOpen(false);
      setRescheduleReason('');
      setFeedback({
        type: 'success',
        text: `Rescheduling request for ${loanId} submitted for Manager/Admin review.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not submit rescheduling request.',
      });
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function handleReviewReschedule(loanId: string, decision: 'approve' | 'reject') {
    setRescheduleBusy(true);
    setFeedback(null);
    try {
      await api.reviewLoanReschedule(loanId, decision);
      setFeedback({
        type: 'success',
        text:
          decision === 'approve'
            ? `Approved rescheduling for ${loanId}. Remaining installments regenerated.`
            : `Declined rescheduling request for ${loanId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review rescheduling request.',
      });
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function handleVerifyInstallment(
    loanId: string,
    installmentNumber: number,
    decision: 'approve' | 'reject'
  ) {
    setRepayBusy(true);
    setFeedback(null);
    try {
      await api.verifyInstallmentRepayment(loanId, installmentNumber, decision);
      setFeedback({
        type: 'success',
        text:
          decision === 'approve'
            ? `Installment #${installmentNumber} verified and credited to principal balance.`
            : `Installment #${installmentNumber} submission rejected.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to verify installment.',
      });
    } finally {
      setRepayBusy(false);
    }
  }

  const [voteBusyId, setVoteBusyId] = useState<string | null>(null);

  async function handleQuickLoanVote(loanId: string, decision: 'upvote' | 'downvote') {
    setVoteBusyId(loanId);
    setFeedback(null);
    try {
      await api.voteLoan(loanId, decision);
      setFeedback({
        type: 'success',
        text: `Your ${decision === 'upvote' ? 'UPVOTE' : 'DOWNVOTE'} was recorded for ${loanId} (2/3 majority tally updated).`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to cast loan vote.',
      });
    } finally {
      setVoteBusyId(null);
    }
  }

  const myGuarantorRequests = loans.filter(
    (l) =>
      l.status === 'pending_guarantor' &&
      l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
  );

  const visibleLoans = scope === 'mine' ? loans.filter((l) => l.borrowerId === user.id) : loans;
  const activeSelectedLoan =
    visibleLoans.find((l) => l.id === selectedLoanId) || visibleLoans[0] || null;

  // Top summary card computations: remaining yearly quota + active loan request status
  const currentYear = new Date().getFullYear();
  const maxLoansPerYear = eligibility?.maxLoansPerYear ?? config?.maxLoansPerYear ?? 3;
  const usedLoansThisYear = eligibility?.loansUsedThisYear ?? 0;
  const remainingYearlyQuota = Math.max(0, maxLoansPerYear - usedLoansThisYear);
  const quotaRemainingPct =
    maxLoansPerYear > 0
      ? Math.min(100, Math.round((remainingYearlyQuota / maxLoansPerYear) * 100))
      : 0;

  const myActiveOrPendingLoan =
    loans.find(
      (l) =>
        l.borrowerId === user.id &&
        ['pending_guarantor', 'pending_vote', 'approved_pending_disbursement', 'active'].includes(
          l.status
        )
    ) || null;

  let loanProgressPct = 0;
  let loanProgressCaption = 'No active or pending Qard Hasan loan request on your account.';
  let loanBarColorClass = 'bg-slate-400 dark:bg-slate-600';

  if (myActiveOrPendingLoan) {
    if (myActiveOrPendingLoan.status === 'pending_vote') {
      const approveCount = myActiveOrPendingLoan.votes.filter(
        (v) => v.decision === 'approve'
      ).length;
      loanProgressPct = Math.min(
        100,
        Math.round((approveCount / Math.max(1, myActiveOrPendingLoan.requiredApprovals)) * 100)
      );
      loanProgressCaption = `2/3 Ballot Progress: ${approveCount} of ${myActiveOrPendingLoan.requiredApprovals} required approvals (${loanProgressPct}%)`;
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'approved_pending_disbursement') {
      loanProgressPct = 100;
      loanProgressCaption = '2/3 Quorum Approved · Ready for treasury multi-sig disbursement';
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
      loanProgressCaption = `Repaid ${formatMoney(myActiveOrPendingLoan.totalRepaid, ccy)} of ${formatMoney(myActiveOrPendingLoan.amount, ccy)} (${paidInstallments}/${myActiveOrPendingLoan.installments.length} installments · ${loanProgressPct}%)`;
      loanBarColorClass = 'bg-emerald-600';
    }
  }

  return (
    <div className="space-y-6">
      {/* Pending Guarantor Co-Sign Action Card */}
      {myGuarantorRequests.length > 0 && (
        <section className="bg-amber-50/85 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>
              Pending Guarantor Co-Sign Request{myGuarantorRequests.length > 1 ? 's' : ''} (
              {myGuarantorRequests.length})
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
                    {loan.id} · {loan.purpose} ({loan.installmentMonths} monthly installments)
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={guarantorBusyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'accept')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Accept Co-Sign
                  </button>
                  <button
                    type="button"
                    disabled={guarantorBusyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'decline')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* Top Summary Card: Remaining Yearly Quota & Active Loan Status with Visual Progress Bars */}
      <section
        aria-label="Member Loan Quota and Active Request Summary"
        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200"
      >
        {!eligibility && loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton height={76} />
            <Skeleton height={76} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x md:divide-slate-100 dark:md:divide-slate-800">
            {/* Left: Remaining Yearly Quota */}
            <div className="space-y-2.5 md:pr-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Remaining Yearly Loan Quota ({currentYear})
                  </div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {remainingYearlyQuota} of {maxLoansPerYear} remaining
                  </div>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {usedLoansThisYear} used
                </span>
              </div>

              <div
                role="progressbar"
                aria-label="Remaining yearly loan quota"
                aria-valuenow={remainingYearlyQuota}
                aria-valuemin={0}
                aria-valuemax={maxLoansPerYear}
                className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    remainingYearlyQuota === 0
                      ? 'bg-red-600'
                      : remainingYearlyQuota === 1
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-emerald-600 to-emerald-500'
                  }`}
                  style={{ width: `${quotaRemainingPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {remainingYearlyQuota > 0
                    ? `${remainingYearlyQuota} Qard Hasan slot${remainingYearlyQuota === 1 ? '' : 's'} available this year`
                    : `Annual limit of ${maxLoansPerYear} loans reached`}
                </span>
                <span className="font-mono tabular-nums">{quotaRemainingPct}% left</span>
              </div>
            </div>

            {/* Right: Active Loan Request Status */}
            <div className="space-y-2.5 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Active Loan Request Status
                  </div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                    {myActiveOrPendingLoan
                      ? `${myActiveOrPendingLoan.id} · ${formatMoney(myActiveOrPendingLoan.amount, ccy)}`
                      : 'No Active Request'}
                  </div>
                </div>
                {myActiveOrPendingLoan ? (
                  <StatusText status={myActiveOrPendingLoan.status} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Clear Standing</span>
                  </span>
                )}
              </div>

              <div
                role="progressbar"
                aria-label="Active loan request progress"
                aria-valuenow={loanProgressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${loanBarColorClass}`}
                  style={{ width: `${loanProgressPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{loanProgressCaption}</span>
                {myActiveOrPendingLoan && (
                  <span className="font-mono tabular-nums shrink-0">{loanProgressPct}%</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Eligibility Engine Summary */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Automated Qard Hasan Eligibility Verification
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Zero-interest mutual loans require zero active loans, available annual quota, and a
              2/3 member vote.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {eligibility && (
              <div className="flex items-center gap-2 text-xs font-semibold">
                {eligibility.eligible ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>Eligible to Request Loan</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400">
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    <span>Currently Ineligible</span>
                  </span>
                )}
              </div>
            )}
            {onOpenLoanModal && (
              <button
                type="button"
                onClick={onOpenLoanModal}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                Open Request Modal
              </button>
            )}
          </div>
        </div>

        {eligibility ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">1. Active Loan Check</span>
                <span
                  className={
                    eligibility.noActiveLoan
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-red-700 dark:text-red-400'
                  }
                >
                  {eligibility.noActiveLoan ? 'Passed' : 'Blocked'}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                {eligibility.noActiveLoan
                  ? 'No active or pending loan on your account.'
                  : `Active/pending loan: ${eligibility.activeLoanId}`}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-amber-300 dark:hover:border-amber-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">2. Annual Quota Check</span>
                <span
                  className={
                    eligibility.quotaAvailable
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-red-700 dark:text-red-400'
                  }
                >
                  {eligibility.quotaAvailable ? 'Available' : 'Exhausted'}
                </span>
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {eligibility.loansUsedThisYear} of {eligibility.maxLoansPerYear} loans used this year
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-300 dark:hover:border-teal-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">3. Fund Lifecycle Window</span>
                <span
                  className={
                    eligibility.beforeMaturityDate
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-amber-700 dark:text-amber-400'
                  }
                >
                  {eligibility.beforeMaturityDate ? 'Qard Hasan Active' : 'Post-Maturity'}
                </span>
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">
                Maturity: {formatShortDate(config?.maturityDate)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">4. Repayment Standing</span>
                <span
                  className={
                    eligibility.noOverdueInstallments
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-red-700 dark:text-red-400'
                  }
                >
                  {eligibility.noOverdueInstallments ? 'Clear' : 'Overdue'}
                </span>
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {eligibility.noOverdueInstallments
                  ? '0 overdue installments'
                  : `${eligibility.overdueCount || 1} overdue installment(s)`}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Skeleton height={68} />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-4">
          <RequestQardHasanLoanForm
            user={user}
            eligibility={eligibility}
            config={config}
            availableLiquidity={availableLiquidity}
            onSubmitted={async (loan) => {
              setSelectedLoanId(loan.id);
              await onRefresh();
            }}
          />
        </div>

        {/* Repayment Schedule & Loan Portfolio */}
        <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Loan Portfolio & Repayment Schedules
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track scheduled monthly installments, remaining balances, and payment verifications
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'mine'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                My Loans
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All Cooperative Loans
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={60} />
              ))}
            </div>
          ) : visibleLoans.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              {scope === 'mine'
                ? 'You have no Qard Hasan loans recorded. Switch to "All Cooperative Loans" or submit an eligible request.'
                : 'No cooperative loan requests found.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4">Loan ID & Borrower</th>
                      <th className="py-2.5 px-4 text-right">Principal</th>
                      <th className="py-2.5 px-4 text-right">Repaid</th>
                      <th className="py-2.5 px-4 text-right">Remaining</th>
                      <th className="py-2.5 px-4">Status</th>
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
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {loan.borrowerName}{' '}
                              <span className="font-mono text-xs text-slate-500">
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
                        Installment Schedule · {activeSelectedLoan.id}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeSelectedLoan.installmentMonths} monthly installments at{' '}
                        {formatMoney(activeSelectedLoan.monthlyInstallment, ccy)}/mo (0% interest)
                      </p>
                    </div>
                    {activeSelectedLoan.disbursementSignature && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>
                          Disbursed by {activeSelectedLoan.disbursementSignature.signedByName}
                        </span>
                      </span>
                    )}
                  </div>

                  {activeSelectedLoan.status === 'pending_vote' && (() => {
                    const upvotes = activeSelectedLoan.votes.filter(
                      (v) => v.decision === 'approve'
                    ).length;
                    const downvotes = activeSelectedLoan.votes.filter(
                      (v) => v.decision === 'reject'
                    ).length;
                    const myVote = activeSelectedLoan.votes.find(
                      (v) => v.isSelf || v.voterId === user.id
                    );
                    const pct = Math.min(
                      100,
                      Math.round((upvotes / activeSelectedLoan.requiredApprovals) * 100)
                    );
                    return (
                      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              2/3 Member Vote
                            </span>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {upvotes}/{activeSelectedLoan.requiredApprovals} Upvotes
                            </span>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-red-700 dark:text-red-400">
                              {downvotes} Downvotes
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {user.status === 'active' && !myVote && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={voteBusyId === activeSelectedLoan.id}
                              onClick={() => void handleQuickLoanVote(activeSelectedLoan.id, 'upvote')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Upvote</span>
                            </button>
                            <button
                              type="button"
                              disabled={voteBusyId === activeSelectedLoan.id}
                              onClick={() =>
                                void handleQuickLoanVote(activeSelectedLoan.id, 'downvote')
                              }
                              className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Downvote</span>
                            </button>
                          </div>
                        )}
                        {myVote && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                            You {myVote.decision === 'approve' ? 'Upvoted' : 'Downvoted'}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {activeSelectedLoan.guarantors && activeSelectedLoan.guarantors.length > 0 && (
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Co-Signing Guarantors:</span>
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
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <CalendarClock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span>Repayment Schedule Flexibility (0% Fee Rescheduling)</span>
                        </span>
                        {(activeSelectedLoan.borrowerId === user.id || isStaff) &&
                          activeSelectedLoan.rescheduleRequest?.status !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => setRescheduleOpen((prev) => !prev)}
                              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {rescheduleOpen ? 'Close Form' : 'Request Schedule Extension'}
                            </button>
                          )}
                      </div>

                      {activeSelectedLoan.rescheduleRequest && (
                        <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-900 dark:text-white">
                              Reschedule to {activeSelectedLoan.rescheduleRequest.requestedMonths}{' '}
                              remaining months ·{' '}
                              <span className="uppercase font-mono text-[11px]">
                                {activeSelectedLoan.rescheduleRequest.status}
                              </span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">
                              Reason: {activeSelectedLoan.rescheduleRequest.reason}
                            </div>
                          </div>
                          {isStaff && activeSelectedLoan.rescheduleRequest.status === 'pending' && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={rescheduleBusy}
                                onClick={() =>
                                  void handleReviewReschedule(activeSelectedLoan.id, 'approve')
                                }
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={rescheduleBusy}
                                onClick={() =>
                                  void handleReviewReschedule(activeSelectedLoan.id, 'reject')
                                }
                                className="px-2.5 py-1 rounded border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {rescheduleOpen && (
                        <form
                          onSubmit={(e) => void handleRequestReschedule(activeSelectedLoan.id, e)}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1"
                        >
                          <div className="sm:col-span-3">
                            <input
                              type="number"
                              min={1}
                              max={36}
                              required
                              value={rescheduleMonths}
                              onChange={(e) => setRescheduleMonths(e.target.value)}
                              placeholder="Months (1-36)"
                              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              required
                              minLength={6}
                              value={rescheduleReason}
                              onChange={(e) => setRescheduleReason(e.target.value)}
                              placeholder="Reason for adjusting remaining installment months…"
                              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <button
                              type="submit"
                              disabled={rescheduleBusy}
                              className="w-full py-1.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                            >
                              {rescheduleBusy ? 'Submitting…' : 'Submit Request'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {payingInstallment && payingInstallment.loanId === activeSelectedLoan.id && (
                    <form
                      onSubmit={handleSubmitRepayment}
                      className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Submit Repayment Proof for Installment #{payingInstallment.installmentNumber}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 cursor-pointer">
                            <Sparkles className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {scanningRepaySlip ? 'Scanning…' : 'Scan Slip (AI)'}
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
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
                            className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <select
                          value={repayChannel}
                          onChange={(e) => {
                            const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                            setRepayChannel(ch);
                            setRepayProvider(ch === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]);
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="mfs">MFS</option>
                          <option value="bank">Bank</option>
                        </select>
                        <select
                          value={repayProvider}
                          onChange={(e) => setRepayProvider(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {(repayChannel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS).map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          required
                          value={repayAccount}
                          onChange={(e) => setRepayAccount(e.target.value)}
                          placeholder="Sender Acct / Phone"
                          className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          required
                          value={repayRef}
                          onChange={(e) => setRepayRef(e.target.value)}
                          placeholder="TrxID / Slip Ref"
                          className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {repayReceiptUrl ? (
                          <a
                            href={repayReceiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
                          >
                            <FileImage className="w-3 h-3" aria-hidden="true" />
                            <span>Slip attached</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span />
                        )}
                        <button
                          type="submit"
                          disabled={repayBusy}
                          className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                        >
                          {repayBusy ? 'Encrypting…' : 'Submit Installment Receipt'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3">Receipt</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeSelectedLoan.installments.map((inst) => {
                          const canPay =
                            activeSelectedLoan.status === 'active' &&
                            (inst.status === 'scheduled' || inst.status === 'overdue') &&
                            (activeSelectedLoan.borrowerId === user.id || isStaff);
                          const canVerify =
                            isStaff && inst.status === 'pending_verification';

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
                                    <span className="font-mono">
                                      {inst.repaymentProvider} ·{' '}
                                      {inst.decryptedReceipt?.referenceId || inst.maskedReference}
                                    </span>
                                    {inst.receiptPhotoUrl && (
                                      <a
                                        href={inst.receiptPhotoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                      >
                                        <span>Slip</span>
                                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  '—'
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
                                      })
                                    }
                                    className="px-2.5 py-1 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium cursor-pointer"
                                  >
                                    {inst.status === 'overdue' ? 'Pay Overdue' : 'Pay Installment'}
                                  </button>
                                )}
                                {canVerify && (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={repayBusy}
                                      onClick={() =>
                                        handleVerifyInstallment(
                                          activeSelectedLoan.id,
                                          inst.installmentNumber,
                                          'approve'
                                        )
                                      }
                                      className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                      title="Verify payment"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={repayBusy}
                                      onClick={() =>
                                        handleVerifyInstallment(
                                          activeSelectedLoan.id,
                                          inst.installmentNumber,
                                          'reject'
                                        )
                                      }
                                      className="p-1 rounded border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 cursor-pointer"
                                      title="Reject payment"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {!canPay && !canVerify && (
                                  <span className="text-slate-400">
                                    {inst.verifierName ? `Verified by ${inst.verifierName}` : '—'}
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
      </div>
    </div>
  );
}
