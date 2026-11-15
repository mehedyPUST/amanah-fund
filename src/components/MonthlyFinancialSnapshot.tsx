'use client';

import { useMemo } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, LoanRequest } from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

export type SnapshotNavTarget = 'contributions' | 'loans';

interface MonthlyFinancialSnapshotProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  config: FundConfig | null;
  loading?: boolean;
  onNavigate?: (tab: SnapshotNavTarget) => void;
}

export function MonthlyFinancialSnapshot({
  contributions,
  loans,
  config,
  loading = false,
  onNavigate,
}: MonthlyFinancialSnapshotProps) {
  const ccy = config?.currency || 'BDT';

  const snapshot = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthContribs = contributions.filter(
      (c) => (c.billingMonth || c.submittedAt.slice(0, 7)) === currentMonth
    );
    const approvedContribs = monthContribs.filter((c) => c.status === 'approved');
    const pendingContribs = monthContribs.filter((c) => c.status === 'pending');

    const totalContributions = approvedContribs.reduce((sum, c) => sum + c.amount, 0);
    const pendingContributionsAmount = pendingContribs.reduce((sum, c) => sum + c.amount, 0);

    const monthWithdrawnLoans = loans.filter((l) => {
      if (l.status !== 'active' && l.status !== 'repaid') return false;
      const loanMonth = (l.disbursedAt || l.approvedAt || l.requestedAt).slice(0, 7);
      return loanMonth === currentMonth;
    });

    const monthAwaitingRelease = loans.filter((l) => {
      if (l.status !== 'approved_pending_disbursement') return false;
      const approvedMonth = (l.approvedAt || l.requestedAt).slice(0, 7);
      return approvedMonth === currentMonth;
    });

    const totalWithdrawnLoans = monthWithdrawnLoans.reduce((sum, l) => sum + l.amount, 0);
    const awaitingDisbursementAmount = monthAwaitingRelease.reduce((sum, l) => sum + l.amount, 0);

    const netMonthlyFlow = totalContributions - totalWithdrawnLoans;
    const totalVolume = totalContributions + totalWithdrawnLoans;
    const contribSharePct =
      totalVolume > 0 ? Math.round((totalContributions / totalVolume) * 100) : 0;
    const loanSharePct = totalVolume > 0 ? 100 - contribSharePct : 0;

    return {
      currentMonth,
      monthLabel: formatBillingMonth(currentMonth),
      totalContributions,
      approvedCount: approvedContribs.length,
      pendingContributionsAmount,
      pendingCount: pendingContribs.length,
      totalWithdrawnLoans,
      withdrawnCount: monthWithdrawnLoans.length,
      awaitingDisbursementAmount,
      netMonthlyFlow,
      totalVolume,
      contribSharePct,
      loanSharePct,
    };
  }, [contributions, loans]);

  if (loading) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton width={220} height={20} />
          <Skeleton width={120} height={20} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
        <Skeleton height={12} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="monthly-financial-snapshot-heading"
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Current Month Cash Position · {snapshot.monthLabel}</span>
          </div>
          <h3
            id="monthly-financial-snapshot-heading"
            className="text-base font-semibold text-slate-900 dark:text-white"
          >
            Monthly Financial Snapshot
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {onNavigate && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('contributions')}
                className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Deposits</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              <button
                type="button"
                onClick={() => onNavigate('loans')}
                className="text-amber-700 dark:text-amber-400 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Loan Activity</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Total Contributions ({snapshot.monthLabel})</span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(snapshot.totalContributions, ccy)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {snapshot.approvedCount} approved deposit{snapshot.approvedCount === 1 ? '' : 's'}
            {snapshot.pendingCount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-amber-700 dark:text-amber-400">
                  {formatMoney(snapshot.pendingContributionsAmount, ccy)} pending
                </span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5 md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Total Withdrawn Loans ({snapshot.monthLabel})</span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(snapshot.totalWithdrawnLoans, ccy)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {snapshot.withdrawnCount} disbursed loan{snapshot.withdrawnCount === 1 ? '' : 's'}
            {snapshot.awaitingDisbursementAmount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{formatMoney(snapshot.awaitingDisbursementAmount, ccy)} awaiting release</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5 md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Net Monthly Position
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums ${
              snapshot.netMonthlyFlow >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {snapshot.netMonthlyFlow >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(snapshot.netMonthlyFlow), ccy)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {snapshot.netMonthlyFlow >= 0
              ? 'Contributions exceed loan withdrawals this month'
              : 'Loan withdrawals exceed contributions this month'}
          </div>
        </div>
      </div>

      {/* Proportional Ratio Bar: Contributions vs Withdrawn Loans */}
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" aria-hidden="true" />
              <span>
                Contributions{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  ({snapshot.contribSharePct}%)
                </strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" aria-hidden="true" />
              <span>
                Withdrawn Loans{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  ({snapshot.loanSharePct}%)
                </strong>
              </span>
            </span>
          </div>
          <span className="font-mono tabular-nums">
            Total flow: {formatMoney(snapshot.totalVolume, ccy)}
          </span>
        </div>

        <div
          role="img"
          aria-label={`Monthly contributions (${snapshot.contribSharePct}%) versus withdrawn loans (${snapshot.loanSharePct}%)`}
          className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex"
        >
          {snapshot.totalVolume > 0 && (
            <>
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all duration-300"
                style={{ width: `${snapshot.contribSharePct}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                style={{ width: `${snapshot.loanSharePct}%` }}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
