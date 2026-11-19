'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
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
  const t = useTranslations('MyAmanah');

  if (loading || !overview) {
    return (
      <div className="space-y-6">
        <div className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton width={200} height={14} />
            <Skeleton width={260} height={24} />
            <Skeleton width="70%" height={12} />
          </div>
          <div className="flex gap-2.5">
            <Skeleton width={136} height={36} borderRadius={8} />
            <Skeleton width={150} height={36} borderRadius={8} />
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 space-y-2"
            >
              <Skeleton width="55%" height={12} />
              <Skeleton width="75%" height={28} />
              <Skeleton width="65%" height={12} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7">
            <Skeleton height={270} borderRadius={16} />
          </div>
          <div className="xl:col-span-5">
            <Skeleton height={270} borderRadius={16} />
          </div>
        </div>
      </div>
    );
  }

  const ccy = overview.config.currency;
  const { personal } = overview;
  const { eligibility } = personal;

  const isMyLoan = (l: LoanRequest) =>
    l.borrowerId === user.id || (Boolean(user.memberCode) && l.borrowerCode === user.memberCode);

  const myActiveLoan = loans.find(
    (l) => isMyLoan(l) && l.status === 'active'
  );
  const myPendingLoan = loans.find(
    (l) =>
      isMyLoan(l) &&
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Identity & Eligibility Status Banner */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
              <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </span>
            <span>{t('eyebrow')}</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {user.name} · <span className="font-mono text-sm text-emerald-700 dark:text-emerald-300">{user.memberCode}</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('monthly-contribution')}
            className={`min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${!(onOpenLoanModal && isEligible) ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <CreditCard className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('makeContribution')}</span>
          </button>
          {onOpenLoanModal && isEligible && (
            <button
              type="button"
              onClick={onOpenLoanModal}
              className="min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all active:scale-[0.98] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HandCoins className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t('applyQardHasan')}</span>
            </button>
          )}
        </div>
      </section>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t('totalContribution')}
          </div>
          <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(personal.totalContributed, ccy)}
          </div>
          <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums leading-snug">
            {t('approvedDepositsCount', {
              count: personal.approvedContributionsCount,
              label: personal.approvedContributionsCount === 1 ? t('depositSingular') : t('depositPlural'),
            })}
            {personal.pendingContributionsCount > 0
              ? t('pendingSuffix', { count: personal.pendingContributionsCount })
              : ''}
          </div>
        </div>

        <div className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="text-[11px] sm:text-xs font-medium text-violet-700 dark:text-violet-400">
            {t('lastContribution')}
          </div>
          <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {personal.lastContribution ? formatMoney(personal.lastContribution.amount, ccy) : '—'}
          </div>
          <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-1.5">
            {personal.lastContribution ? (
              <>
                <span className="font-mono">
                  {formatBillingMonth(personal.lastContribution.billingMonth)}
                </span>
                <StatusText status={personal.lastContribution.status} />
              </>
            ) : (
              <span>{t('noContributionYet')}</span>
            )}
          </div>
        </div>

        <div
          className={`${
            personal.dueContributionAmount > 0 ? 'amanah-card-amber' : 'amanah-card-teal'
          } rounded-xl sm:rounded-2xl p-3 sm:p-5 border shadow-xs hover:shadow-md transition-all duration-200`}
        >
          <div
            className={`text-[11px] sm:text-xs font-medium ${
              personal.dueContributionAmount > 0
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-teal-700 dark:text-teal-400'
            }`}
          >
            {t('dueContribution')}
          </div>
          <div
            className={`mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono tabular-nums ${
              personal.dueContributionAmount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-teal-700 dark:text-teal-400'
            }`}
          >
            {formatMoney(personal.dueContributionAmount, ccy)}
          </div>
          <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 leading-snug">
            {personal.dueContributionMonths > 0
              ? t('unpaidMonthsTarget', {
                  months: personal.dueContributionMonths,
                  amount: formatMoney(overview.config.monthlyContributionAmount, ccy),
                })
              : t('clearedCurrentMonth')}
          </div>
        </div>

        <div className="amanah-card-sky border rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="text-[11px] sm:text-xs font-medium text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('nextDeadline')}</span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatShortDate(personal.nextContributionDeadline)}
          </div>
          <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono leading-snug">
            {t('overallDeadline', { date: formatShortDate(personal.nextOverallDeadline) })}
          </div>
        </div>
      </section>

      {/* Qard Hasan Personal Summary & Eligibility */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-7 bg-white/92 dark:bg-slate-900/85 border border-slate-200/85 dark:border-slate-800/85 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('activeQardSectionTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{t('manageRepayments')}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-px bg-slate-200/75 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-white/95 dark:bg-slate-900/90 p-3 sm:p-4">
              <div className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                {personal.activeLoanMainAmount > 0
                  ? t('activeLoanMainDue')
                  : myPendingLoan
                    ? t('activeLoanRequest')
                    : t('activeLoan')}
              </div>
              <div className="mt-1.5 text-sm sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                {personal.activeLoanMainAmount > 0 ? (
                  `${formatMoney(personal.activeLoanMainAmount, ccy)} / ${formatMoney(personal.activeLoanDueAmount, ccy)}`
                ) : myPendingLoan ? (
                  <>
                    <span>{formatMoney(myPendingLoan.amount, ccy)}</span>
                    <StatusText status={myPendingLoan.status} />
                  </>
                ) : hasActiveOrPending && eligibility.activeLoanId ? (
                  <>
                    <span>{eligibility.activeLoanId}</span>
                    <StatusText status="pending_manager_review" />
                  </>
                ) : (
                  t('noActiveLoan')
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {myActiveLoan
                  ? t('repaidPrefix', {
                      id: myActiveLoan.id,
                      amount: formatMoney(myActiveLoan.totalRepaid, ccy),
                    })
                  : myPendingLoan
                    ? t('monthsTerm', {
                        id: myPendingLoan.id,
                        months: myPendingLoan.installmentMonths,
                        purpose: myPendingLoan.purpose,
                      })
                    : hasActiveOrPending && eligibility.activeLoanId
                      ? t('activePendingOnAccount')
                      : t('lifetimeRepaid', {
                          amount: formatMoney(personal.totalRepaidPersonal, ccy),
                        })}
              </div>
            </div>

            <div className="bg-white/95 dark:bg-slate-900/90 p-3 sm:p-4">
              <div className="text-[11px] sm:text-xs text-violet-700 dark:text-violet-400 font-medium">
                {t('lastHasanInstallment')}
              </div>
              <div className="mt-1.5 text-sm sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {personal.lastHasanInstallment
                  ? formatMoney(personal.lastHasanInstallment.amount, ccy)
                  : '—'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono leading-snug">
                {personal.lastHasanInstallment
                  ? `${personal.lastHasanInstallment.loanId} #${personal.lastHasanInstallment.installmentNumber} · ${formatDateTime(personal.lastHasanInstallment.paidAt)}`
                  : t('noInstallmentRecorded')}
              </div>
            </div>

            <div className="bg-white/95 dark:bg-slate-900/90 p-3 sm:p-4">
              <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 font-medium">
                {t('missedInstallment')}
              </div>
              <div
                className={`mt-1.5 text-sm sm:text-lg font-bold font-mono tabular-nums ${
                  personal.missedInstallmentsCount > 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {personal.missedInstallmentsCount > 0
                  ? t('missedCountAmount', {
                      count: personal.missedInstallmentsCount,
                      amount: formatMoney(personal.missedInstallmentsAmount, ccy),
                    })
                  : t('zeroMissed')}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {personal.missedInstallmentsCount > 0
                  ? t('settleOverdueNote')
                  : t('allScheduleGood')}
              </div>
            </div>

            <div className="bg-white/95 dark:bg-slate-900/90 p-3 sm:p-4">
              <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 font-medium">
                {t('nextLoanDeadline')}
              </div>
              <div className="mt-1.5 text-sm sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {personal.nextLoanDeadline ? formatShortDate(personal.nextLoanDeadline) : '—'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono leading-snug">
                {t('overallDeadline', { date: formatShortDate(personal.nextOverallDeadline) })}
              </div>
            </div>
          </div>
        </section>

        {/* Qard Hasan Eligibility Card */}
        <section className="xl:col-span-5 bg-white/92 dark:bg-slate-900/85 border border-slate-200/85 dark:border-slate-800/85 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between space-y-5 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('eligibilityTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('eligibilitySub')}
                </p>
              </div>
              {isEligible ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('eligibleBadge')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 shrink-0">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('notEligibleBadge')}</span>
                </span>
              )}
            </div>

            {!isEligible && (
              <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    {quotaReached && hasActiveOrPending
                      ? t('reasonQuotaAndActive')
                      : quotaReached
                        ? t('reasonQuota')
                        : hasActiveOrPending
                          ? t('reasonActive')
                          : t('reasonDefault')}
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    {eligibility.reasons[0]}
                  </p>
                </div>
              </div>
            )}

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t('activePendingLoanRow')}</dt>
                <dd
                  className={`font-semibold ${
                    eligibility.noActiveLoan
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {eligibility.noActiveLoan
                    ? t('noneClear')
                    : eligibility.activeLoanId || t('presentFallback')}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t('annualQuotaRow')}</dt>
                <dd
                  className={`font-mono font-semibold ${
                    eligibility.quotaAvailable
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {t('usedRatio', {
                    used: eligibility.loansUsedThisYear,
                    max: eligibility.maxLoansPerYear,
                  })}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{t('overdueInstallmentsRow')}</dt>
                <dd
                  className={`font-semibold ${
                    eligibility.noOverdueInstallments
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {eligibility.noOverdueInstallments
                    ? t('clearZero')
                    : t('overdueCount', { count: eligibility.overdueCount || 1 })}
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>{t('zeroRibaFooter')}</span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {t('openQardHasanArrow')}
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
