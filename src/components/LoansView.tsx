import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Lock, ShieldCheck, X, XCircle } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface LoansViewProps {
  loans: LoanRequest[];
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  user: PublicUser;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function LoansView({
  loans,
  eligibility,
  config,
  availableLiquidity,
  user,
  loading,
  onRefresh,
}: LoansViewProps) {
  const ccy = config?.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [amount, setAmount] = useState('20000');
  const [installmentMonths, setInstallmentMonths] = useState('5');
  const [purpose, setPurpose] = useState('');
  const [emergencyContext, setEmergencyContext] = useState('');
  const [channel, setChannel] = useState<'bank' | 'mfs'>('mfs');
  const [provider, setProvider] = useState('bKash');
  const [disbursementAccount, setDisbursementAccount] = useState('');

  const [submitting, setSubmitting] = useState(false);
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
  const [repayProvider, setRepayProvider] = useState('bKash');
  const [repayAccount, setRepayAccount] = useState('');
  const [repayRef, setRepayRef] = useState('');
  const [repayBusy, setRepayBusy] = useState(false);

  const parsedAmount = Number(amount) || 0;
  const parsedMonths = Math.max(1, Number(installmentMonths) || 1);
  const monthlyPreview = Math.round((parsedAmount / parsedMonths) * 100) / 100;

  async function handleLoanSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await api.requestLoan({
        amount: parsedAmount,
        installmentMonths: parsedMonths,
        purpose,
        emergencyContext,
        channel,
        provider,
        disbursementAccount,
      });
      setPurpose('');
      setEmergencyContext('');
      setDisbursementAccount('');
      setFeedback({
        type: 'success',
        text: 'Qard Hasan request passed eligibility verification and is now open for 2/3 member voting.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Loan request failed.',
      });
    } finally {
      setSubmitting(false);
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
        }
      );
      setPayingInstallment(null);
      setRepayAccount('');
      setRepayRef('');
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
        ['pending_vote', 'approved_pending_disbursement', 'active'].includes(l.status)
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
      loanBarColorClass = 'bg-sky-600';
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
      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Top Summary Card: Remaining Yearly Quota & Active Loan Status with Visual Progress Bars */}
      <section
        aria-label="Member Loan Quota and Active Request Summary"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6"
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
                      ? 'bg-rose-600'
                      : remainingYearlyQuota === 1
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
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
          {eligibility && (
            <div className="flex items-center gap-2 text-xs font-semibold">
              {eligibility.eligible ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Eligible to Request Loan</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Currently Ineligible</span>
                </span>
              )}
            </div>
          )}
        </div>

        {eligibility ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">1. Active Loan Check</span>
                <span
                  className={
                    eligibility.noActiveLoan
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-rose-700 dark:text-rose-400'
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

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">2. Annual Quota Check</span>
                <span
                  className={
                    eligibility.quotaAvailable
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-rose-700 dark:text-rose-400'
                  }
                >
                  {eligibility.quotaAvailable ? 'Available' : 'Exhausted'}
                </span>
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {eligibility.loansUsedThisYear} of {eligibility.maxLoansPerYear} loans used this year
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950">
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
          </div>
        ) : (
          <div className="mt-4">
            <Skeleton height={68} />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Request Qard Hasan Loan Form */}
        <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Request Qard Hasan Loan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              0% interest · Available liquidity:{' '}
              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                {formatMoney(availableLiquidity, ccy)}
              </span>
            </p>
          </div>

          <form onSubmit={handleLoanSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Principal ({ccy})
                </label>
                <input
                  type="number"
                  min={100}
                  max={Math.min(config?.maxLoanAmount || 100000, availableLiquidity || 100000)}
                  required
                  disabled={!eligibility?.eligible}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Installments (Mo)
                </label>
                <input
                  type="number"
                  min={1}
                  max={config?.maxInstallmentMonths || 12}
                  required
                  disabled={!eligibility?.eligible}
                  value={installmentMonths}
                  onChange={(e) => setInstallmentMonths(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Scheduled Monthly Installment (0% Interest)
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(monthlyPreview, ccy)} / mo
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Purpose Summary (Visible to Member Voters)
              </label>
              <input
                type="text"
                required
                disabled={!eligibility?.eligible}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Medical expense or tuition bridge"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payout Channel
                </label>
                <select
                  disabled={!eligibility?.eligible}
                  value={channel}
                  onChange={(e) => {
                    const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                    setChannel(ch);
                    setProvider(ch === 'mfs' ? 'bKash' : 'Islami Bank Bangladesh');
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                >
                  <option value="mfs">MFS</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Provider
                </label>
                <input
                  type="text"
                  required
                  disabled={!eligibility?.eligible}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Payout Account / Wallet Number (Encrypted)
              </label>
              <input
                type="text"
                required
                disabled={!eligibility?.eligible}
                value={disbursementAccount}
                onChange={(e) => setDisbursementAccount(e.target.value)}
                placeholder="017XX-XXXXXX or Bank Acct"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confidential Context (Encrypted for Treasury)
              </label>
              <textarea
                rows={2}
                disabled={!eligibility?.eligible}
                value={emergencyContext}
                onChange={(e) => setEmergencyContext(e.target.value)}
                placeholder="Optional supporting context encrypted at rest"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!eligibility?.eligible || submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>
                {!eligibility?.eligible
                  ? 'Eligibility Requirements Not Met'
                  : submitting
                    ? 'Submitting Proposal…'
                    : 'Submit for 2/3 Member Vote'}
              </span>
            </button>
          </form>
        </section>

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

                  {payingInstallment && payingInstallment.loanId === activeSelectedLoan.id && (
                    <form
                      onSubmit={handleSubmitRepayment}
                      className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Submit Repayment Proof for Installment #{payingInstallment.installmentNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPayingInstallment(null)}
                          className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <select
                          value={repayChannel}
                          onChange={(e) => {
                            const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                            setRepayChannel(ch);
                            setRepayProvider(ch === 'mfs' ? 'bKash' : 'Islami Bank Bangladesh');
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="mfs">MFS</option>
                          <option value="bank">Bank</option>
                        </select>
                        <input
                          type="text"
                          required
                          value={repayProvider}
                          onChange={(e) => setRepayProvider(e.target.value)}
                          placeholder="Provider / Bank"
                          className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
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
                      <div className="flex justify-end">
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
                            inst.status === 'scheduled' &&
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
                                  <span className="font-mono">
                                    {inst.repaymentProvider} ·{' '}
                                    {inst.decryptedReceipt?.referenceId || inst.maskedReference}
                                  </span>
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
                                    Pay Installment
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
                                      className="p-1 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 cursor-pointer"
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
