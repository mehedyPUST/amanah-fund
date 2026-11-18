'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  HandCoins,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { useTranslations } from 'next-intl';
import type {
  DashboardSectionId,
  FundConfig,
  InstallmentItem,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { MotionCard } from './MotionCard.tsx';

interface RepaymentScheduleProps {
  loans: LoanRequest[];
  config: FundConfig | null;
  user: PublicUser;
  loading?: boolean;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenLoanModal?: () => void;
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.round((parsed.getTime() - utcToday) / (1000 * 60 * 60 * 24));
}

function describeDueTiming(
  inst: InstallmentItem,
  t: (key: string, values?: Record<string, string | number>) => string
): {
  label: string;
  tone: 'paid' | 'pending' | 'overdue' | 'soon' | 'upcoming';
} {
  if (inst.status === 'paid') {
    return {
      label: inst.paidAt ? t('paidDate', { date: formatShortDate(inst.paidAt) }) : t('paid'),
      tone: 'paid',
    };
  }
  if (inst.status === 'pending_verification') {
    return {
      label: t('awaitingVerification'),
      tone: 'pending',
    };
  }
  const days = getDaysUntil(inst.dueDate);
  if (inst.status === 'overdue' || days < 0) {
    const overdueDays = Math.abs(days);
    return {
      label: overdueDays === 0 ? t('overdue') : t('overdueByDays', { days: overdueDays }),
      tone: 'overdue',
    };
  }
  if (days === 0) {
    return { label: t('dueToday'), tone: 'soon' };
  }
  if (days <= 7) {
    return { label: t('dueInDays', { days }), tone: 'soon' };
  }
  return { label: t('inDays', { days }), tone: 'upcoming' };
}

export function RepaymentSchedule({
  loans,
  config,
  user,
  loading = false,
  onNavigate,
  onOpenLoanModal,
}: RepaymentScheduleProps) {
  const t = useTranslations('Loans.schedule');
  const ccy = config?.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [viewFilter, setViewFilter] = useState<'upcoming' | 'all'>('upcoming');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const myActiveLoans = useMemo(
    () =>
      loans.filter(
        (l) =>
          l.borrowerId === user.id &&
          (l.status === 'active' || l.status === 'approved_pending_disbursement')
      ),
    [loans, user.id]
  );

  const allActiveLoans = useMemo(
    () =>
      loans.filter(
        (l) => l.status === 'active' || l.status === 'approved_pending_disbursement'
      ),
    [loans]
  );

  const scopedLoans = scope === 'all' && isStaff ? allActiveLoans : myActiveLoans;
  const activeLoan =
    scopedLoans.find((l) => l.id === selectedLoanId) || scopedLoans[0] || null;

  const myRepaidCount = useMemo(
    () => loans.filter((l) => l.borrowerId === user.id && l.status === 'repaid').length,
    [loans, user.id]
  );

  if (loading) {
    return (
      <section className="amanah-card-teal border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton width={170} height={12} />
            <Skeleton width={190} height={20} />
          </div>
          <Skeleton width={140} height={28} borderRadius={8} />
        </div>
        <Skeleton height={100} borderRadius={12} />
        <Skeleton height={44} borderRadius={8} />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} borderRadius={8} />
          ))}
        </div>
      </section>
    );
  }

  const paidCount = activeLoan
    ? activeLoan.installments.filter((i) => i.status === 'paid').length
    : 0;
  const totalCount = activeLoan ? activeLoan.installments.length : 0;
  const paidPct =
    activeLoan && activeLoan.amount > 0
      ? Math.min(100, Math.round((activeLoan.totalRepaid / activeLoan.amount) * 100))
      : 0;

  const nextDueInstallment = activeLoan
    ? activeLoan.installments.find((i) => i.status !== 'paid') || null
    : null;
  const nextDueTiming = nextDueInstallment ? describeDueTiming(nextDueInstallment, t) : null;

  const visibleInstallments = activeLoan
    ? viewFilter === 'upcoming'
      ? activeLoan.installments.filter((i) => i.status !== 'paid')
      : activeLoan.installments
    : [];

  return (
    <MotionCard
      as="section"
      hue="teal"
      aria-label={t('title')}
      className="backdrop-blur-md border rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
              {t('title')}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isStaff && allActiveLoans.length > 0 && (
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {(
                  [
                    { id: 'mine', label: t('myLoan') },
                    { id: 'all', label: t('allActive', { count: allActiveLoans.length }) },
                  ] as const
                ).map((tab) => {
                  const active = scope === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setScope(tab.id);
                        setSelectedLoanId(null);
                      }}
                      className={`relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="repayment-scope-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeLoan && (
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {(
                  [
                    { id: 'upcoming', label: t('upcoming') },
                    { id: 'all', label: t('allCount', { count: totalCount }) },
                  ] as const
                ).map((tab) => {
                  const active = viewFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setViewFilter(tab.id)}
                      className={`relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="repayment-view-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selector when viewing All Active Loans as staff */}
        {scope === 'all' && isStaff && scopedLoans.length > 1 && activeLoan && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-subtle">
            {scopedLoans.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedLoanId(l.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  activeLoan.id === l.id
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {l.borrowerName} · <span className="font-mono">{l.id}</span>
              </button>
            ))}
          </div>
        )}

        {!activeLoan ? (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('noDeadlinesTitle')}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {myRepaidCount > 0
                  ? myRepaidCount === 1
                    ? t('zeroBalanceRepaidSingle', { count: myRepaidCount })
                    : t('zeroBalanceRepaidMulti', { count: myRepaidCount })
                  : t('zeroBalance')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={onOpenLoanModal}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer transition-colors"
                >
                  {t('requestLoan')}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('quard-hasan')}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                {t('openQardHasan')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Remaining Balance & Payoff Progress Block */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {activeLoan.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeLoan.borrowerName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {activeLoan.status === 'approved_pending_disbursement'
                        ? t('approvedAwaiting')
                        : t('activeRepayment')}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(activeLoan.remainingBalance, ccy)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t('remainingOf')}{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                        {formatMoney(activeLoan.amount, ccy)}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t('totalRepaid')}</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {formatMoney(activeLoan.totalRepaid, ccy)} ({paidPct}%)
                  </div>
                </div>
              </div>

              {/* Segmented Installment Visual Progress Track */}
              <div className="space-y-1.5">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, totalCount)}, minmax(0, 1fr))`,
                  }}
                  role="img"
                  aria-label={t('paidOfTotalAria', { paid: paidCount, total: totalCount })}
                >
                  {activeLoan.installments.map((inst) => {
                    const timing = describeDueTiming(inst, t);
                    const colorClass =
                      timing.tone === 'paid'
                        ? 'bg-emerald-600 dark:bg-emerald-500'
                        : timing.tone === 'pending'
                          ? 'bg-amber-500'
                          : timing.tone === 'overdue'
                            ? 'bg-red-600 dark:bg-red-500'
                            : timing.tone === 'soon'
                              ? 'bg-amber-400'
                              : 'bg-slate-200 dark:bg-slate-800';
                    return (
                      <div
                        key={inst.installmentNumber}
                        title={`#${inst.installmentNumber} · ${formatShortDate(inst.dueDate)} · ${timing.label}`}
                        className={`h-2 rounded-sm transition-colors ${colorClass}`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>
                    {t('settledCount', { paid: paidCount, total: totalCount })}
                  </span>
                  <span>
                    {t('remainingCount', { count: totalCount - paidCount })}
                  </span>
                </div>
              </div>
            </div>

            {/* Next Deadline Spotlight */}
            {nextDueInstallment && nextDueTiming && (
              <div
                className={`rounded-lg border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  nextDueTiming.tone === 'overdue'
                    ? 'bg-red-50/75 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                    : nextDueTiming.tone === 'pending' || nextDueTiming.tone === 'soon'
                      ? 'bg-amber-50/75 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                      : 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {nextDueTiming.tone === 'overdue' ? (
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                  <div className="text-xs min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {t('nextDeadline', { num: nextDueInstallment.installmentNumber })}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 ml-1.5">
                      · {formatShortDate(nextDueInstallment.dueDate)} ({nextDueTiming.label})
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white shrink-0">
                  {formatMoney(nextDueInstallment.amount, ccy)}
                </span>
              </div>
            )}

            {/* Installment Deadlines Timeline */}
            <div className="max-h-60 overflow-y-auto scrollbar-subtle divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl">
              {visibleInstallments.length === 0 ? (
                <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('allSettled')}
                </div>
              ) : (
                visibleInstallments.map((inst) => {
                  const timing = describeDueTiming(inst, t);
                  return (
                    <div
                      key={inst.installmentNumber}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-md font-mono tabular-nums text-[11px] font-semibold flex items-center justify-center shrink-0 ${
                            timing.tone === 'paid'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : timing.tone === 'overdue'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
                                : timing.tone === 'pending' || timing.tone === 'soon'
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          #{inst.installmentNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white font-mono tabular-nums">
                            {formatShortDate(inst.dueDate)}
                          </div>
                          <div
                            className={`text-[11px] flex items-center gap-1 ${
                              timing.tone === 'paid'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : timing.tone === 'overdue'
                                  ? 'text-red-700 dark:text-red-400 font-medium'
                                  : timing.tone === 'pending' || timing.tone === 'soon'
                                    ? 'text-amber-700 dark:text-amber-400 font-medium'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {timing.tone === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                            <span>{timing.label}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(inst.amount, ccy)}
                        </div>
                        {inst.paidAmount > 0 && inst.status !== 'paid' && (
                          <div className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {t('paidPartial', { amount: formatMoney(inst.paidAmount, ccy) })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {activeLoan && (
        <div className="pt-1 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <HandCoins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t('footerHint')}</span>
          </span>
          <button
            type="button"
            onClick={() => onNavigate('quard-hasan')}
            className="group text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <span>{t('openQardHasan')}</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
    </MotionCard>
  );
}
