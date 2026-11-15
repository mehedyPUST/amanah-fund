'use client';

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  HandCoins,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface MyAmanahViewProps {
  overview: DashboardOverview | null;
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenLoanModal?: () => void;
}

export function MyAmanahView({
  overview,
  loans,
  user,
  loading,
  onNavigate,
  onOpenLoanModal,
}: MyAmanahViewProps) {
  if (loading || !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={116} borderRadius={12} />
          ))}
        </div>
        <Skeleton height={240} borderRadius={12} />
      </div>
    );
  }

  const ccy = overview.config.currency;
  const { personal } = overview;
  const { eligibility } = personal;

  const myActiveLoan = loans.find(
    (l) => l.borrowerId === user.id && l.status === 'active'
  );
  const myPendingLoan = loans.find(
    (l) =>
      l.borrowerId === user.id &&
      [
        'pending_guarantor',
        'pending_manager_review',
        'pending_vote',
        'approved_pending_disbursement',
      ].includes(l.status)
  );

  const isEligible = eligibility.eligible;
  const quotaReached = !eligibility.quotaAvailable;
  const hasActiveOrPending = !eligibility.noActiveLoan;

  return (
    <div className="space-y-6">
      {/* Identity & Eligibility Status Banner */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Wallet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>My Amanah · Personal Treasury Standing</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {user.name} · <span className="font-mono text-sm">{user.memberCode}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Complete snapshot of your deposits, contribution dues, active Qard Hasan installments,
            deadlines, and financing eligibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('monthly-contribution')}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Make Contribution</span>
          </button>
          {onOpenLoanModal && isEligible && (
            <button
              type="button"
              onClick={onOpenLoanModal}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <HandCoins className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Apply for Qard Hasan</span>
            </button>
          )}
        </div>
      </section>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Contribution */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-emerald-100">Total Contribution</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatMoney(personal.totalContributed, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-emerald-100/90 tabular-nums">
            {personal.approvedContributionsCount} approved deposit
            {personal.approvedContributionsCount === 1 ? '' : 's'}
            {personal.pendingContributionsCount > 0
              ? ` · ${personal.pendingContributionsCount} pending`
              : ''}
          </div>
        </div>

        {/* Last Contribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Last Contribution
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {personal.lastContribution ? formatMoney(personal.lastContribution.amount, ccy) : '—'}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            {personal.lastContribution ? (
              <>
                <span className="font-mono">
                  {formatBillingMonth(personal.lastContribution.billingMonth)}
                </span>
                <StatusText status={personal.lastContribution.status} />
              </>
            ) : (
              <span>No contribution submitted yet</span>
            )}
          </div>
        </div>

        {/* Due Contribution */}
        <div
          className={`rounded-xl p-5 border shadow-xs ${
            personal.dueContributionAmount > 0
              ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/60'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800'
          }`}
        >
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Due Contribution
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              personal.dueContributionAmount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatMoney(personal.dueContributionAmount, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            {personal.dueContributionMonths > 0
              ? `${personal.dueContributionMonths} unpaid month(s) · Target ${formatMoney(overview.config.monthlyContributionAmount, ccy)}/mo`
              : 'Cleared up to current month'}
          </div>
        </div>

        {/* Next Contribution Deadline */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Next Contribution Deadline</span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatShortDate(personal.nextContributionDeadline)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            Overall Next Deadline: {formatShortDate(personal.nextOverallDeadline)}
          </div>
        </div>
      </section>

      {/* Qard Hasan Personal Summary & Eligibility */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Active Qard Hasan &amp; Installment Standing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Principal, remaining balance, last installment paid, missed installments, and next
                repayment deadline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Repayments</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Active Qard Hasan (Main Amount / Due)
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {personal.activeLoanMainAmount > 0
                  ? `${formatMoney(personal.activeLoanMainAmount, ccy)} / ${formatMoney(personal.activeLoanDueAmount, ccy)}`
                  : 'No Active Qard Hasan'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {myActiveLoan
                  ? `${myActiveLoan.id} · Repaid ${formatMoney(myActiveLoan.totalRepaid, ccy)}`
                  : myPendingLoan
                    ? `Pending request ${myPendingLoan.id} (${myPendingLoan.status.replace(/_/g, ' ')})`
                    : `Lifetime repaid: ${formatMoney(personal.totalRepaidPersonal, ccy)}`}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Last Hasan Installment
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {personal.lastHasanInstallment
                  ? formatMoney(personal.lastHasanInstallment.amount, ccy)
                  : '—'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {personal.lastHasanInstallment
                  ? `${personal.lastHasanInstallment.loanId} #${personal.lastHasanInstallment.installmentNumber} · ${formatDateTime(personal.lastHasanInstallment.paidAt)}`
                  : 'No verified installment recorded yet'}
              </div>
            </div>

            <div
              className={`p-4 rounded-lg border ${
                personal.missedInstallmentsCount > 0
                  ? 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
              }`}
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">Missed Installment</div>
              <div
                className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${
                  personal.missedInstallmentsCount > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {personal.missedInstallmentsCount > 0
                  ? `${personal.missedInstallmentsCount} missed (${formatMoney(personal.missedInstallmentsAmount, ccy)})`
                  : '0 Missed'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {personal.missedInstallmentsCount > 0
                  ? 'Settle overdue installments immediately.'
                  : 'All installment schedules are in good standing.'}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Next Qard Hasan Deadline
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {personal.nextLoanDeadline ? formatShortDate(personal.nextLoanDeadline) : '—'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Overall Next Deadline: {formatShortDate(personal.nextOverallDeadline)}
              </div>
            </div>
          </div>
        </section>

        {/* Qard Hasan Eligibility Card */}
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Qard Hasan Eligibility
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automated quota and active-loan clearance evaluation
                </p>
              </div>
              {isEligible ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Eligible</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-400">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Not Eligible</span>
                </span>
              )}
            </div>

            {!isEligible && (
              <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    {quotaReached && hasActiveOrPending
                      ? 'Not Eligible — Annual Quota Reached & Active/Pending Qard Hasan Exists'
                      : quotaReached
                        ? 'Not Eligible — Annual Qard Hasan Quota Reached'
                        : hasActiveOrPending
                          ? 'Not Eligible — Active or Pending Qard Hasan Exists'
                          : 'Not Eligible for New Qard Hasan'}
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    {eligibility.reasons[0]}
                  </p>
                </div>
              </div>
            )}

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Active / Pending Loan</dt>
                <dd
                  className={`font-semibold ${
                    eligibility.noActiveLoan
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {eligibility.noActiveLoan ? 'None (Clear)' : eligibility.activeLoanId || 'Present'}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Annual Quota Usage</dt>
                <dd
                  className={`font-mono font-semibold ${
                    eligibility.quotaAvailable
                      ? 'text-slate-900 dark:text-white'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {eligibility.loansUsedThisYear} / {eligibility.maxLoansPerYear} used
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Overdue Installments</dt>
                <dd
                  className={`font-semibold ${
                    eligibility.noOverdueInstallments
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {eligibility.noOverdueInstallments
                    ? 'Clear (0)'
                    : `${eligibility.overdueCount || 1} Overdue`}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Cooperative Net Equity</dt>
                <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatMoney(personal.cooperativeEquity, ccy)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>0% Riba · Mudarabah/Qard Hasan</span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Open Quard Hasan →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
