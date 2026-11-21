'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardSectionId,
  FundConfig,
  LoanRequest,
} from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

export type SnapshotNavTarget = DashboardSectionId;

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
  const t = useTranslations('Common.snapshot');
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
      <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <Skeleton width={210} height={14} />
            <Skeleton width={190} height={22} />
          </div>
          <Skeleton width={140} height={18} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-1.5">
              <Skeleton width="60%" height={12} />
              <Skeleton width="75%" height={26} />
              <Skeleton width="50%" height={12} />
            </div>
          ))}
        </div>
        <Skeleton height={12} borderRadius={999} />
      </section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-labelledby="monthly-financial-snapshot-heading"
      className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </span>
            <span>{t('currentMonthPosition', { month: snapshot.monthLabel })}</span>
          </div>
          <h3
            id="monthly-financial-snapshot-heading"
            className="text-base font-semibold text-slate-900 dark:text-white"
          >
            {t('heading')}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          {onNavigate && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('monthly-contribution')}
                className="min-h-[36px] sm:min-h-0 px-3 sm:px-0 py-1 sm:py-0 rounded-xl sm:rounded-none bg-emerald-50/80 sm:bg-transparent dark:bg-emerald-950/35 sm:dark:bg-transparent text-emerald-700 dark:text-emerald-400 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>{t('deposits')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300 dark:text-slate-700">
                ·
              </span>
              <button
                type="button"
                onClick={() => onNavigate('quard-hasan')}
                className="min-h-[36px] sm:min-h-0 px-3 sm:px-0 py-1 sm:py-0 rounded-xl sm:rounded-none bg-amber-50/80 sm:bg-transparent dark:bg-amber-950/35 sm:dark:bg-transparent text-amber-700 dark:text-amber-400 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>{t('loanActivity')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="space-y-1 sm:space-y-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('totalContributions', { month: snapshot.monthLabel })}</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(snapshot.totalContributions, ccy)}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {t('approvedDepositsCount', {
              count: snapshot.approvedCount,
              label: snapshot.approvedCount === 1 ? t('depositSingular') : t('depositPlural'),
            })}
            {snapshot.pendingCount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-amber-700 dark:text-amber-400">
                  {t('pendingAmount', {
                    amount: formatMoney(snapshot.pendingContributionsAmount, ccy),
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1 sm:space-y-1.5 min-w-0 border-l border-slate-100 dark:border-slate-800 pl-3 md:pl-5">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-amber-700 dark:text-amber-400">
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('withdrawnLoans', { month: snapshot.monthLabel })}</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(snapshot.totalWithdrawnLoans, ccy)}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {t('disbursedLoansCount', {
              count: snapshot.withdrawnCount,
              label: snapshot.withdrawnCount === 1 ? t('loanSingular') : t('loanPlural'),
            })}
            {snapshot.awaitingDisbursementAmount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-teal-700 dark:text-teal-400">
                  {t('awaitingRelease', {
                    amount: formatMoney(snapshot.awaitingDisbursementAmount, ccy),
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 pt-2.5 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 md:pl-5 space-y-1 sm:space-y-1.5">
          <div className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
            {t('netMonthlyPosition')}
          </div>
          <div
            className={`text-lg sm:text-2xl font-bold font-mono tabular-nums ${
              snapshot.netMonthlyFlow >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {snapshot.netMonthlyFlow >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(snapshot.netMonthlyFlow), ccy)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {snapshot.netMonthlyFlow >= 0 ? t('surplusDesc') : t('deficitDesc')}
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
                {t('contributions')}{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  ({snapshot.contribSharePct}%)
                </strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" aria-hidden="true" />
              <span>
                {t('withdrawnLoansShort')}{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  ({snapshot.loanSharePct}%)
                </strong>
              </span>
            </span>
          </div>
          <span className="font-mono tabular-nums">
            {t('totalFlow', { amount: formatMoney(snapshot.totalVolume, ccy) })}
          </span>
        </div>

        <div
          role="img"
          aria-label={t('ratioBarAria', {
            contribPct: snapshot.contribSharePct,
            loanPct: snapshot.loanSharePct,
          })}
          className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex"
        >
          {snapshot.totalVolume > 0 && (
            <>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: `${snapshot.contribSharePct}%`, originX: 0 }}
                className="h-full bg-gradient-to-r from-emerald-600 to-teal-500"
              />
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: `${snapshot.loanSharePct}%`, originX: 0 }}
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
              />
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}
