'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  HandCoins,
  Lock,
  Settings,
  ShieldCheck,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { ContributionLeaderboard } from './ContributionLeaderboard.tsx';
import { RecentTransactions } from './RecentTransactions.tsx';
import { RepaymentSchedule } from './RepaymentSchedule.tsx';

export type NavTab = DashboardSectionId;

interface OverviewViewProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenLoanModal?: () => void;
  onViewMemberProfile?: (userId: string) => void;
  onRefresh: () => Promise<void>;
}

export function OverviewView({
  overview,
  contributions,
  loans,
  user,
  loading,
  onNavigate,
  onOpenLoanModal,
  onViewMemberProfile,
  onRefresh,
}: OverviewViewProps) {
  const [quotaInput, setQuotaInput] = useState(
    String(overview?.config.maxLoansPerYear ?? 3)
  );
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  useEffect(() => {
    if (overview?.config.maxLoansPerYear !== undefined) {
      setQuotaInput(String(overview.config.maxLoansPerYear));
    }
  }, [overview?.config.maxLoansPerYear]);

  async function handleQuickQuotaSave(e: FormEvent) {
    e.preventDefault();
    setSavingQuota(true);
    setQuotaMessage(null);
    try {
      const nextLimit = Number(quotaInput);
      await api.updateConfig({ maxLoansPerYear: nextLimit });
      setQuotaMessage(`Saved: ${nextLimit} loans per member per year.`);
      await onRefresh();
    } catch (err) {
      setQuotaMessage(
        err instanceof Error ? err.message : 'Could not update annual loan limit.'
      );
    } finally {
      setSavingQuota(false);
    }
  }

  if (loading || !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
            >
              <Skeleton width="55%" height={14} />
              <div className="mt-3">
                <Skeleton width="75%" height={28} />
              </div>
              <div className="mt-2">
                <Skeleton width="65%" height={12} />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <Skeleton height={220} />
        </div>
      </div>
    );
  }

  const { config, treasury, personal, phase, daysUntilMaturity } = overview;
  const ccy = config.currency;
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isAdmin = user.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Phase & Pre-Specified Maturity Date Banner */}
      <section className="bg-gradient-to-br from-emerald-50/75 via-white to-white dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {phase === 'qard_hasan'
                  ? 'Phase 1 · Active Qard Hasan Lending'
                  : 'Phase 2 · Post-Maturity Halal Investment'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Target Maturity: {formatShortDate(config.maturityDate)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400 font-medium">
                {daysUntilMaturity} days remaining
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {config.fundName}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {config.halalInvestmentThesis}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('statistics')}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-amber-200/80 dark:border-amber-800/70 bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all duration-200 whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Statistics</span>
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => onNavigate('site-settings')}
                className="group px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Site Settings</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('monthly-contribution')}
                className="group px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Monthly Contribution</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Overdue Installment Warning */}
      {treasury.overdueInstallmentsCount > 0 && (
        <section className="bg-red-50/85 dark:bg-red-950/35 border border-red-200 dark:border-red-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-red-900 dark:text-red-200">
                {treasury.overdueInstallmentsCount} Overdue Qard Hasan Installment
                {treasury.overdueInstallmentsCount === 1 ? '' : 's'} Detected
              </div>
              <p className="text-xs text-red-800 dark:text-red-300">
                {!isAdmin && !personal.eligibility.noOverdueInstallments
                  ? `You have ${personal.eligibility.overdueCount} overdue installment(s). Settle them in Quard Hasan before requesting new financing.`
                  : 'Cooperative repayment scheduler flagged past-due installments requiring follow-up.'}
              </p>
            </div>
          </div>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap cursor-pointer shrink-0"
            >
              Inspect Repayments →
            </button>
          )}
        </section>
      )}

      {/* Pending Member Signup Approvals Notice for Admins */}
      {isAdmin && treasury.pendingMembersCount > 0 && (
        <section className="bg-amber-50/85 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {treasury.pendingMembersCount} New Member Application
              {treasury.pendingMembersCount === 1 ? '' : 's'} Pending Approval
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Pending applicants cannot sign in until verified and activated in Member Registry.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('member-registry')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 whitespace-nowrap cursor-pointer shrink-0"
          >
            Review Member Registry →
          </button>
        </section>
      )}

      {/* Admin Quick Control: Maximum Loans Per Member Per Year */}
      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Administrator Quota Control</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Maximum Qard Hasan Loans Per Member Per Year
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Default is 3 loans/year. Changes persist to the database and immediately enforce
                member loan eligibility across the platform.
              </p>
            </div>

            <form
              onSubmit={handleQuickQuotaSave}
              className="flex flex-wrap items-center gap-2.5 shrink-0"
            >
              <label htmlFor="admin-annual-loan-limit" className="sr-only">
                Maximum loans per year
              </label>
              <input
                id="admin-annual-loan-limit"
                type="number"
                min={1}
                max={12}
                required
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                className="w-24 px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
              <button
                type="submit"
                disabled={savingQuota}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 whitespace-nowrap cursor-pointer"
              >
                {savingQuota ? 'Saving…' : 'Update Annual Limit'}
              </button>
            </form>
          </div>
          {quotaMessage && (
            <p className="mt-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {quotaMessage}
            </p>
          )}
        </section>
      )}

      {/* 4-Column Amanah Treasury Headline KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border border-emerald-500/30 rounded-xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-100">
            <span>Amanah Height (Total Raised)</span>
            <Wallet className="w-4 h-4 text-emerald-100" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-white">
            {formatMoney(treasury.amanahHeight, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-emerald-100/90 tabular-nums">
            {treasury.contributingMembersCount} contributing members · Pending{' '}
            {formatMoney(treasury.pendingContributionsAmount, ccy)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span>Current Balance</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.currentBalance, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Amanah Height − Quard Hasan Current
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400">
            <span>Quard Hasan Total Current</span>
            <HandCoins className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.quardHasanTotalCurrent, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {treasury.activeBorrowers.length} active borrower
            {treasury.activeBorrowers.length === 1 ? '' : 's'} · Disbursed{' '}
            {formatMoney(treasury.totalLoansDisbursed, ccy)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-xs font-medium text-teal-700 dark:text-teal-400">
            <span>Repayments Returned (+)</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.totalRepaid, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {treasury.approvedLoansDeducted > 0
              ? `${Math.round((treasury.totalRepaid / treasury.approvedLoansDeducted) * 100)}% restored to central fund`
              : '100% revolving principal'}
          </div>
        </div>
      </section>

      {/* This Month Treasury Pulse: Contribution, Due, Hasan Installment, Clearance */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>This Month Contribution ({treasury.thisMonthKey})</span>
            <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.thisMonthContributionCollected, ccy)}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              / {formatMoney(treasury.thisMonthContributionTarget, ccy)}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full"
              style={{
                width: `${
                  treasury.thisMonthContributionTarget > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (treasury.thisMonthContributionCollected /
                            treasury.thisMonthContributionTarget) *
                            100
                        )
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            This Month Due (Remaining / Target)
          </div>
          <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(treasury.thisMonthDueRemaining, ccy)}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              / {formatMoney(treasury.thisMonthDueTarget, ccy)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {treasury.thisMonthDueRemaining === 0
              ? 'All monthly contribution targets collected'
              : 'Pending collection from members this cycle'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            This Month Hasan Installment (Collected / Need)
          </div>
          <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.thisMonthHasanInstallmentCollected, ccy)}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              / {formatMoney(treasury.thisMonthHasanInstallmentNeed, ccy)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {treasury.thisMonthHasanInstallmentNeed > 0
              ? 'Installments due & collected this month'
              : 'No installments due this month'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>This Month Clearance</span>
            <Users className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {treasury.thisMonthClearanceClearedMembers}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              / {treasury.thisMonthClearanceTotalMembers} cleared members
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full"
              style={{
                width: `${
                  treasury.thisMonthClearanceTotalMembers > 0
                    ? Math.round(
                        (treasury.thisMonthClearanceClearedMembers /
                          treasury.thisMonthClearanceTotalMembers) *
                          100
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* Active Qard Hasan Borrowers + This Month Member Clearance */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Active Quard Hasan Members
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Current borrowers with Main Principal / Remaining Due balance
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {treasury.activeBorrowers.length} active
            </span>
          </div>

          {treasury.activeBorrowers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No active Qard Hasan loans are currently outstanding.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {treasury.activeBorrowers.map((b) => (
                <div
                  key={b.loanId}
                  className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    {onViewMemberProfile ? (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(b.borrowerId)}
                        className="font-semibold text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                      >
                        {b.borrowerName}{' '}
                        <span className="font-mono font-normal text-slate-500">
                          ({b.borrowerCode})
                        </span>
                      </button>
                    ) : (
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {b.borrowerName}{' '}
                        <span className="font-mono font-normal text-slate-500">
                          ({b.borrowerCode})
                        </span>
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {b.loanId}
                      {b.nextDueDate ? ` · Next due ${formatShortDate(b.nextDueDate)}` : ''}
                      {b.missedInstallmentsCount > 0 && (
                        <span className="text-red-600 dark:text-red-400 ml-1.5">
                          · {b.missedInstallmentsCount} overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {formatMoney(b.mainAmount, ccy)}{' '}
                      <span className="text-slate-400 font-normal">/</span>{' '}
                      <span className="text-amber-700 dark:text-amber-400">
                        {formatMoney(b.dueAmount, ccy)} due
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Repaid {formatMoney(b.totalRepaid, ccy)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                This Month Member Clearance ({treasury.thisMonthKey})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Contributing members cleared for the current monthly cycle (Admin excluded)
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              {treasury.thisMonthClearanceClearedMembers}/{treasury.thisMonthClearanceTotalMembers}
            </span>
          </div>

          {treasury.thisMonthMemberClearance.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No active contributing members found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto pr-1">
              {treasury.thisMonthMemberClearance.map((entry) => (
                <div
                  key={entry.userId}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    {onViewMemberProfile ? (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(entry.userId)}
                        className="font-medium text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left truncate"
                      >
                        {entry.memberName}{' '}
                        <span className="font-mono text-slate-500 font-normal">
                          ({entry.memberCode})
                        </span>
                      </button>
                    ) : (
                      <span className="font-medium text-slate-900 dark:text-white">
                        {entry.memberName} ({entry.memberCode})
                      </span>
                    )}
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {formatMoney(entry.contributedAmount, ccy)} /{' '}
                      {formatMoney(entry.targetAmount, ccy)}
                    </div>
                  </div>

                  <span
                    className={`font-semibold text-[11px] uppercase tracking-wide shrink-0 ${
                      entry.status === 'cleared'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : entry.status === 'pending'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {entry.status === 'cleared'
                      ? 'Cleared'
                      : entry.status === 'pending'
                        ? 'Pending Review'
                        : 'Due'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Personal Standing (Members & Managers) or Admin Governance Notice + Approval Queues */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {isAdmin ? (
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Administrator Account · Non-Contributing Governance</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Platform Oversight &amp; Configuration
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Administrators do not submit monthly contributions or take Qard Hasan loans. Use
                Site Settings to update cooperative policy variables, User &amp; Role Management to
                assign Managers/Members, and Opinion Ballot to audit individual votes.
              </p>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs pt-1">
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Pending Profile Edits</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {treasury.pendingProfileRequestsCount}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Open Decision Polls</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {treasury.openDecisionPollsCount}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Upcoming Meetings</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {treasury.upcomingMeetingsCount}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => onNavigate('member-registry')}
                className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Manage Users &amp; Roles</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('site-settings')}
                className="flex-1 py-2.5 px-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Site Settings</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Your Member Standing
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {user.name} · <span className="font-mono">{user.memberCode}</span>
                </p>
              </div>

              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 text-sm">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Your Approved Deposits</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMoney(personal.totalContributed, ccy)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Active Loan Balance</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(personal.activeLoanBalance, ccy)}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Cooperative Net Equity</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMoney(personal.cooperativeEquity, ccy)}
                    {personal.totalProfitDistributed > 0 && (
                      <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 ml-1.5">
                        (+{formatMoney(personal.totalProfitDistributed, ccy)} profit)
                      </span>
                    )}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Annual Loan Quota</span>
                  <span className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                    {personal.eligibility.loansUsedThisYear} / {personal.eligibility.maxLoansPerYear}{' '}
                    used
                  </span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {personal.eligibility.eligible ? (
                    <>
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Eligible for Qard Hasan Request
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock
                        className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-amber-700 dark:text-amber-400">
                        Not Eligible for Qard Hasan
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {personal.eligibility.reasons[0]}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={onOpenLoanModal}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Request Qard Hasan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('my-amanah')}
                className="group flex-1 py-2.5 px-4 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-white/80 dark:bg-slate-900/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-medium text-slate-800 dark:text-slate-200 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Open My Amanah</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>
        )}

        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Active Governance &amp; Approval Queues
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                2/3 anonymized ballots · AES-256-GCM encrypted records
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => onNavigate('ballot')}
                className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <span>Open 2/3 Ballots</span>
                  <Vote className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingVotesCount}
                </div>
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
                  Cast anonymized vote →
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    user.role === 'manager'
                      ? 'manager-desk'
                      : isAdmin
                        ? 'transaction-history'
                        : 'monthly-contribution'
                  )
                }
                className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>Pending Deposits</span>
                  <ShieldCheck
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingContributionsCount}
                </div>
                <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
                  {user.role === 'manager'
                    ? 'Review in Manager Desk →'
                    : isAdmin
                      ? 'Inspect Transaction Ledger →'
                      : 'View submission status →'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onNavigate(user.role === 'manager' ? 'manager-desk' : 'ballot')
                }
                className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-teal-700 dark:text-teal-400 font-medium">
                  <span>Awaiting Disbursement</span>
                  <ShieldCheck
                    className="w-4 h-4 text-teal-600 dark:text-teal-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingDisbursementsCount}
                </div>
                <div className="mt-1 text-xs text-teal-700 dark:text-teal-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
                  {user.role === 'manager'
                    ? 'Confirm disbursement in Manager Desk →'
                    : 'Multi-sig treasury release →'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    user.role === 'manager'
                      ? 'manager-desk'
                      : isAdmin
                        ? 'transaction-history'
                        : 'quard-hasan'
                  )
                }
                className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <span>Pending Repayments</span>
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingRepaymentsCount}
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
                  {user.role === 'manager'
                    ? 'Verify installments in Manager Desk →'
                    : 'Inspect installment receipts →'}
                </div>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Repayment Schedule & Contribution Leaderboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-6 flex [&>section]:w-full">
          <RepaymentSchedule
            loans={loans}
            config={config}
            user={user}
            loading={loading}
            onNavigate={onNavigate}
            onOpenLoanModal={onOpenLoanModal}
          />
        </div>
        <div className="xl:col-span-6 flex [&>section]:w-full">
          <ContributionLeaderboard
            entries={overview.leaderboard || []}
            config={config}
            loading={loading}
            onNavigate={onNavigate}
            onViewMemberProfile={onViewMemberProfile}
          />
        </div>
      </div>

      {/* User's Latest Monthly Contributions & Loan Payments */}
      <RecentTransactions
        contributions={contributions}
        loans={loans}
        config={config}
        user={user}
        loading={loading}
        onNavigate={onNavigate}
      />
    </div>
  );
}
