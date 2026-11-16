'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  isPdfFileUrl,
} from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ProviderSelect } from './ProviderSelect.tsx';
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
  onViewMemberProfile,
  onRefresh,
}: LoansViewProps) {
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [modal, setModal] = useState<LoanActionModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

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
        'Action Could Not Be Completed',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
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
          'Receipt Slip Scanned',
          `Gemini AI parsed slip (${ext.confidence} confidence): ${ext.summary}`
        );
      } else if (uploadRes.status === 'fulfilled') {
        showNotice(
          'slate',
          'Receipt File Attached',
          'Please verify the Transaction Number and sender account before submitting.'
        );
      } else {
        showNotice(
          'red',
          'Receipt Upload Failed',
          'Could not upload receipt PDF or image. Please check file size (<10 MB) and try again.'
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
        'Missing Repayment Details',
        'Please provide both your sender account/wallet number and the Transaction Number.'
      );
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Confirm Installment #${target.installmentNumber} Repayment`,
      description:
        'Verify your transfer details before encrypting and submitting to the Manager Desk for fund balance reconciliation.',
      details: [
        { label: 'Loan ID', value: target.loanId },
        { label: 'Installment', value: `#${target.installmentNumber} · ${formatMoney(target.amount, ccy)}` },
        { label: 'Channel & Provider', value: `${repayChannel.toUpperCase()} · ${repayProvider}` },
        { label: 'Sender Account', value: repayAccount.trim() },
        { label: 'Transaction Number', value: repayRef.trim() },
      ],
      confirmLabel: 'Submit Repayment Proof',
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
          'Installment Repayment Submitted',
          'Your repayment proof is AES-256-GCM encrypted and awaiting Manager verification.'
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
          ? `Co-Sign Guarantor Pledge (${loan.id})`
          : `Decline Guarantor Pledge (${loan.id})`,
      description:
        decision === 'accept'
          ? `Confirm co-signing ${loan.borrowerName}'s Qard Hasan request for ${formatMoney(loan.amount, ccy)}. Once co-signed, it advances to Manager review.`
          : `Confirm declining to act as guarantor for ${loan.borrowerName}'s Qard Hasan request.`,
      details: [
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Amount', value: formatMoney(loan.amount, ccy) },
        { label: 'Purpose', value: loan.purpose },
      ],
      confirmLabel: decision === 'accept' ? 'Confirm Co-Sign' : 'Confirm Decline',
      run: async () => {
        await api.respondAsGuarantor(loan.id, decision);
        await onRefresh();
        showNotice(
          decision === 'accept' ? 'emerald' : 'amber',
          decision === 'accept' ? 'Guarantor Pledge Co-Signed' : 'Guarantor Pledge Declined',
          decision === 'accept'
            ? `Co-signed guarantor pledge for ${loan.id}.`
            : `Declined guarantor pledge for ${loan.id}.`
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
        'Reason Too Short',
        'Please enter a clear reason (at least 6 characters) for extending the repayment timeline.'
      );
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: `Confirm Reschedule Request (${loanId})`,
      description:
        'Submit a 0% fee installment rescheduling request to the Manager/Admin for approval.',
      details: [
        { label: 'Loan ID', value: loanId },
        { label: 'Requested Remaining Months', value: `${months} months` },
        { label: 'Reason', value: reason },
      ],
      confirmLabel: 'Submit Reschedule Request',
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
          'Reschedule Request Submitted',
          `Rescheduling request for ${loanId} submitted for Manager/Admin review.`
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
          ? `Approve Rescheduling (${loanId})`
          : `Decline Rescheduling (${loanId})`,
      description:
        decision === 'approve'
          ? 'Approving will regenerate all remaining unpaid installments evenly at 0% interest.'
          : 'Declining will keep the borrower on the current installment schedule.',
      confirmLabel: decision === 'approve' ? 'Approve Reschedule' : 'Decline Reschedule',
      run: async () => {
        await api.reviewLoanReschedule(loanId, decision);
        await onRefresh();
        showNotice(
          decision === 'approve' ? 'emerald' : 'amber',
          decision === 'approve' ? 'Schedule Rescheduled' : 'Reschedule Declined',
          decision === 'approve'
            ? `Approved rescheduling for ${loanId}. Remaining installments regenerated.`
            : `Declined rescheduling request for ${loanId}.`
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
        title: `Accept Installment #${installmentNumber} Payment`,
        description:
          'Confirm verifying this installment receipt. Approving updates the borrower’s remaining balance and increases the cooperative liquid fund balance.',
        details: [
          { label: 'Loan & Borrower', value: `${loan.id} · ${loan.borrowerName}` },
          { label: 'Installment Amount', value: formatMoney(inst?.amount || 0, ccy) },
          { label: 'Provider', value: inst?.repaymentProvider || '—' },
          { label: 'Transaction Number', value: txNo },
        ],
        confirmLabel: 'Accept & Credit Balance',
        run: async () => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'approve');
          await onRefresh();
          showNotice(
            'emerald',
            `Installment #${installmentNumber} Verified`,
            `Installment #${installmentNumber} (${txNo}) verified and credited to principal & treasury balance.`
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Deny Installment #${installmentNumber} Receipt`,
        description:
          'Provide a clear correction message explaining what the borrower must fix (e.g., Transaction Number mismatch or unclear receipt slip).',
        details: [
          { label: 'Loan & Borrower', value: `${loan.id} · ${loan.borrowerName}` },
          { label: 'Transaction Number', value: txNo },
        ],
        inputLabel: 'Correction Note for Borrower',
        inputPlaceholder: 'Explain the issue so the member can correct and resubmit…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Deny & Send Correction Note',
        run: async (note) => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'reject', note);
          await onRefresh();
          showNotice(
            'amber',
            `Installment #${installmentNumber} Denied`,
            `Installment #${installmentNumber} was denied with your correction note sent to ${loan.borrowerName}.`
          );
        },
      });
    }
  }

  function confirmQuickLoanVote(loan: LoanRequest, decision: 'upvote' | 'downvote') {
    setModal({
      mode: 'confirm',
      tone: decision === 'upvote' ? 'emerald' : 'red',
      title: `Confirm Secret ${decision === 'upvote' ? 'Upvote' : 'Downvote'} (${loan.id})`,
      description:
        'Your ballot is confidential — other members only see that the poll is ongoing until the Manager reveals the final result.',
      details: [
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Requested Amount', value: formatMoney(loan.amount, ccy) },
        { label: 'Purpose', value: loan.purpose },
      ],
      confirmLabel: decision === 'upvote' ? 'Cast Secret Upvote' : 'Cast Secret Downvote',
      run: async () => {
        await api.voteLoan(loan.id, decision);
        await onRefresh();
        showNotice(
          'emerald',
          'Secret Ballot Recorded',
          `Your ${decision === 'upvote' ? 'UPVOTE' : 'DOWNVOTE'} ballot was recorded securely for ${loan.id}.`
        );
      },
    });
  }

  const myGuarantorRequests = loans.filter(
    (l) =>
      l.status === 'pending_guarantor' &&
      l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
  );

  const visibleLoans = scope === 'mine' ? loans.filter((l) => l.borrowerId === user.id) : loans;
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
    loans.find(
      (l) =>
        l.borrowerId === user.id &&
        [
          'pending_guarantor',
          'pending_manager_review',
          'pending_vote',
          'approved_pending_disbursement',
          'active',
        ].includes(l.status)
    ) || null;

  let loanProgressPct = 0;
  let loanProgressCaption = 'No active or pending Qard Hasan loan request on your account.';
  let loanBarColorClass = 'bg-slate-400 dark:bg-slate-600';

  if (myActiveOrPendingLoan) {
    if (myActiveOrPendingLoan.status === 'pending_guarantor') {
      loanProgressPct = 15;
      loanProgressCaption = 'Awaiting co-signing guarantor acceptance before Manager review.';
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'pending_manager_review') {
      loanProgressPct = 30;
      loanProgressCaption = 'Awaiting Manager review to open the secret 2/3 member ballot.';
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
        loanProgressCaption = `2/3 Ballot Result: ${approveCount} of ${myActiveOrPendingLoan.requiredApprovals} required approvals (${loanProgressPct}%)`;
      } else {
        const cast = myActiveOrPendingLoan.totalVotesCast ?? myActiveOrPendingLoan.votes.length;
        loanProgressPct = Math.min(
          95,
          Math.round((cast / Math.max(1, myActiveOrPendingLoan.totalEligibleVoters)) * 100)
        );
        loanProgressCaption = `Poll Ongoing · ${cast} member ballot(s) cast secretly (results hidden until revealed)`;
      }
      loanBarColorClass = 'bg-amber-500';
    } else if (myActiveOrPendingLoan.status === 'approved_pending_disbursement') {
      loanProgressPct = 100;
      loanProgressCaption = '2/3 Quorum Approved · Awaiting Manager disbursement confirmation';
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
                    disabled={modalBusy}
                    onClick={() => confirmGuarantorRespond(loan, 'accept')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Accept Co-Sign
                  </button>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmGuarantorRespond(loan, 'decline')}
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

      {!isAdmin && (
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
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${
                      remainingYearlyQuota === 0
                        ? 'bg-rose-600'
                        : remainingYearlyQuota === 1
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                          : 'bg-gradient-to-r from-indigo-600 to-teal-500'
                    }`}
                    style={{ width: `${quotaRemainingPct}%`, originX: 0 }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {remainingYearlyQuota > 0
                      ? `${remainingYearlyQuota} Qard Hasan slot${remainingYearlyQuota === 1 ? '' : 's'} available this year`
                      : `Annual limit of ${maxLoansPerYear} loans reached`}
                  </span>
                  <span className="font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                    {quotaRemainingPct}% left
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Application &amp; Loan Status
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
                  {myActiveOrPendingLoan && (
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
                        Withdraw to submit a new application.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const loanId = myActiveOrPendingLoan.id;
                          setModal({
                            mode: 'confirm',
                            tone: 'amber',
                            title: 'Withdraw Loan Application?',
                            description: `This will cancel ${loanId} and free your eligibility so you can submit a new Qard Hasan request. This cannot be undone.`,
                            details: [
                              { label: 'Application', value: loanId },
                              {
                                label: 'Amount',
                                value: formatMoney(myActiveOrPendingLoan.amount, ccy),
                              },
                              {
                                label: 'Status',
                                value: myActiveOrPendingLoan.status.replace(/_/g, ' '),
                              },
                            ],
                            confirmLabel: 'Yes, Withdraw Application',
                            run: async () => {
                              await api.withdrawLoan(loanId);
                              await onRefresh();
                              setModal({
                                mode: 'notice',
                                tone: 'emerald',
                                title: 'Application Withdrawn',
                                description: `${loanId} was withdrawn. You can now open a new Qard Hasan request.`,
                              });
                            },
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px] font-medium hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer shrink-0"
                      >
                        Withdraw Application
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}
        </section>
      )}

      {!isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Automated Qard Hasan Eligibility Verification
              </h2>
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
                      <span>Currently Not Eligible</span>
                    </span>
                  )}
                </div>
              )}
              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={onOpenLoanModal}
                  className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer"
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
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {!isAdmin && (
          <div className="xl:col-span-4">
            <RequestQardHasanLoanForm
              user={user}
              eligibility={eligibility}
              config={config}
              availableLiquidity={availableLiquidity}
              onSubmitted={async (loan) => {
                // Select the new request immediately so it appears in the
                // member's portfolio list while the parent refreshes.
                setSelectedLoanId(loan.id);
                setScope('mine');
                try {
                  await onRefresh();
                } catch (err) {
                  console.error('Loan created; portfolio refresh failed:', err);
                }
              }}
            />
          </div>
        )}

        <section
          className={`${
            isAdmin ? 'xl:col-span-12' : 'xl:col-span-8'
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Loan Portfolio &amp; Repayment Schedules
              </h3>
            </div>

            {!isAdmin && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                {(
                  [
                    { id: 'mine', label: 'My Loans' },
                    { id: 'all', label: 'All Cooperative Loans' },
                  ] as const
                ).map((tab) => {
                  const active = scope === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setScope(tab.id)}
                      className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="loans-scope-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
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
                      <th className="py-2.5 px-4">Loan ID &amp; Borrower</th>
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
                        Installment Schedule · {activeSelectedLoan.id}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeSelectedLoan.installmentMonths} monthly installments at{' '}
                        {formatMoney(activeSelectedLoan.monthlyInstallment, ccy)}/mo (0% interest)
                        {activeSelectedLoan.decryptedSensitiveNotes
                          ? ` · ${activeSelectedLoan.decryptedSensitiveNotes.channel.toUpperCase()} · ${activeSelectedLoan.decryptedSensitiveNotes.provider}`
                          : ''}
                      </p>
                    </div>
                    {activeSelectedLoan.disbursementSignature && (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                        <span>
                          Disbursed by {activeSelectedLoan.disbursementSignature.signedByName}
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
                      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {revealed || isAdmin ? '2/3 Member Vote' : 'Poll Ongoing (Secret Ballot)'}
                            </span>
                            <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                              ·
                            </span>
                            {revealed || isAdmin ? (
                              <>
                                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {upvotes}/{activeSelectedLoan.requiredApprovals} Upvotes
                                </span>
                                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums text-red-700 dark:text-red-400">
                                  {downvotes} Downvotes
                                </span>
                              </>
                            ) : (
                              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                {cast} of {activeSelectedLoan.totalEligibleVoters} ballots cast
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
                                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
                                  : 'bg-gradient-to-r from-amber-500 to-indigo-500'
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
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Upvote</span>
                            </button>
                            <button
                              type="button"
                              disabled={modalBusy}
                              onClick={() => confirmQuickLoanVote(activeSelectedLoan, 'downvote')}
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
                            isAdmin || activeSelectedLoan.borrowerId !== user.id ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={modalBusy}
                                  onClick={() =>
                                    confirmReviewReschedule(activeSelectedLoan.id, 'approve')
                                  }
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={modalBusy}
                                  onClick={() =>
                                    confirmReviewReschedule(activeSelectedLoan.id, 'reject')
                                  }
                                  className="px-2.5 py-1 rounded border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-medium cursor-pointer disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
                                Peer / Admin Review Required
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
                                disabled={modalBusy}
                                className="w-full py-1.5 px-3 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Submit Request
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
                        className="p-4 rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/20 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            Submit Repayment Proof for Installment #{payingInstallment.installmentNumber} (
                            {formatMoney(payingInstallment.amount, ccy)})
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-teal-700 dark:text-teal-400 cursor-pointer">
                              <Sparkles className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {scanningRepaySlip ? 'Scanning…' : 'Scan Slip PDF/Photo (AI)'}
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
                              Cancel
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Channel
                            </label>
                            <select
                              value={repayChannel}
                              onChange={(e) => {
                                const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                                setRepayChannel(ch);
                                setRepayProvider(ch === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            >
                              <option value="mfs">MFS Wallet</option>
                              <option value="bank">BD Bank</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              {repayChannel === 'mfs' ? 'MFS Wallet' : 'Bangladesh Bank'}
                            </label>
                            <ProviderSelect
                              compact
                              options={repayChannel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS}
                              value={repayProvider}
                              onChange={setRepayProvider}
                              placeholder={
                                repayChannel === 'mfs'
                                  ? 'Search MFS…'
                                  : `Search ${BANK_PROVIDERS.length} BD banks…`
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Sender Acct / Mobile
                            </label>
                            <input
                              type="text"
                              required
                              value={repayAccount}
                              onChange={(e) => setRepayAccount(e.target.value)}
                              placeholder="017XX-XXXXXX / Acct #"
                              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Transaction Number
                            </label>
                            <input
                              type="text"
                              required
                              value={repayRef}
                              onChange={(e) => setRepayRef(e.target.value)}
                              placeholder="TrxID / Bank Ref No."
                              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {repayReceiptUrl ? (
                            <a
                              href={repayReceiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400 hover:underline"
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
                            disabled={modalBusy}
                            className="px-4 py-1.5 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                          >
                            Review &amp; Submit Installment Receipt
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3">Bank / MFS &amp; Transaction Number</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-right">Action</th>
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
                                        <span>{isPdfFileUrl(inst.receiptPhotoUrl) ? 'Slip PDF' : 'Slip'}</span>
                                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  '—'
                                )}
                                {inst.rejectionNote && (
                                  <div className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                                    Correction note: {inst.rejectionNote}
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
                                    {inst.status === 'overdue' ? 'Pay Overdue' : 'Pay Installment'}
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
                                      title="Verify payment"
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
                                      title="Deny payment with correction note"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {!canPay && !canVerify && (
                                  <span className="text-slate-500 dark:text-slate-400">
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
