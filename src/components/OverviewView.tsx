'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Calendar, CheckCircle2, Lock, Settings, ShieldCheck, Vote } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, DashboardOverview, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { TreasuryGrowthChart } from './TreasuryGrowthChart.tsx';
import { RecentTransactions } from './RecentTransactions.tsx';
import { ContributionGoalTracker } from './ContributionGoalTracker.tsx';

export type NavTab =
  | 'overview'
  | 'contributions'
  | 'loans'
  | 'voting'
  | 'halal'
  | 'members'
  | 'transactions'
  | 'notifications'
  | 'profile'
  | 'registrations'
  | 'audit'
  | 'admin';

interface OverviewViewProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onSubmitContributionMonth?: (billingMonth?: string) => void;
  onRefresh: () => Promise<void>;
}

export function OverviewView({
  overview,
  contributions,
  loans,
  user,
  loading,
  onNavigate,
  onSubmitContributionMonth,
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

  const { config, treasury, personal, phase, daysUntilMaturity, monthlySeries } = overview;
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
              onClick={() => onNavigate('halal')}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-amber-200/80 dark:border-amber-800/70 bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all duration-200 whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Halal Ventures</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contributions')}
              className="group px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Submit Capital Deposit</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Pending Member Signup Approvals Notice for Admins */}
      {isAdmin && treasury.pendingMembersCount > 0 && (
        <section className="bg-amber-50/85 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {treasury.pendingMembersCount} New Member Application
              {treasury.pendingMembersCount === 1 ? '' : 's'} Pending Approval
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Pending applicants cannot sign in until verified and activated in Onboarding Queue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('registrations')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 whitespace-nowrap cursor-pointer shrink-0"
          >
            Review Onboarding Queue →
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

      {/* 4-Column Central Fund Balance Accounting KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border border-emerald-500/30 rounded-xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="text-xs font-medium text-emerald-100">
            Central Fund Balance
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-white">
            {formatMoney(treasury.centralBalance, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-emerald-100/90 tabular-nums">
            + Contributions − Approved Loans + Repayments
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Approved Contributions (+)
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.totalContributionsPool, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {treasury.activeMembersCount} active · Pending{' '}
            {formatMoney(treasury.pendingContributionsAmount, ccy)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Approved Loans Deducted (−)
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(treasury.approvedLoansDeducted, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Active outstanding {formatMoney(treasury.activeLoansOutstanding, ccy)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 rounded-xl p-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
            Repayments Returned (+)
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

      {/* Treasury Growth & Monthly Contribution Visualization + Personal Standing */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 min-w-0">
          <TreasuryGrowthChart
            contributions={contributions}
            loans={loans}
            monthlySeries={monthlySeries}
            currency={ccy}
            currentUserId={user.id}
            centralBalance={treasury.centralBalance}
            loading={loading}
            onSubmitContribution={() => onNavigate('contributions')}
          />
        </div>

        <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
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
                      Loan Eligibility Locked
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {personal.eligibility.reasons[0]}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('loans')}
            className="group w-full py-2.5 px-4 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-white/80 dark:bg-slate-900/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-medium text-slate-800 dark:text-slate-200 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Open Qard Hasan & Repayments</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </section>
      </div>

      {/* Member Yearly Savings Goal & Monthly Progress Tracker */}
      <ContributionGoalTracker
        user={user}
        contributions={contributions}
        config={config}
        loading={loading}
        onSubmitContribution={(month) => {
          if (onSubmitContributionMonth) {
            onSubmitContributionMonth(month);
          } else {
            onNavigate('contributions');
          }
        }}
      />

      {/* Live Governance & Approval Queues */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Active Governance & Approval Queues
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            2/3 member vote quorum · Manager verification · AES-256-GCM encrypted records
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('voting')}
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
              Cast member vote →
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('contributions')}
            className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <span>Pending Deposits</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.pendingContributionsCount}
            </div>
            <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
              {isStaff ? 'Review Bank/MFS queue →' : 'View submission status →'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('voting')}
            className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-teal-700 dark:text-teal-400 font-medium">
              <span>Awaiting Disbursement</span>
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.pendingDisbursementsCount}
            </div>
            <div className="mt-1 text-xs text-teal-700 dark:text-teal-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
              Multi-sig treasury release →
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('loans')}
            className="group text-left p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-medium">
              <span>Pending Repayments</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.pendingRepaymentsCount}
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:translate-x-0.5 transition-transform duration-200">
              Inspect installment receipts →
            </div>
          </button>
        </div>
      </section>

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
