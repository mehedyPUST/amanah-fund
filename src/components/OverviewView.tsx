'use client';

import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  HandCoins,
  ShieldCheck,
  UserCheck,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type {
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
import { MotionCard } from './MotionCard.tsx';
import { StatusText } from './StatusText.tsx';

export type NavTab = DashboardSectionId;

interface OverviewViewProps {
  overview: DashboardOverview | null;
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenManagerDeskTab?: (tab: ManagerDeskTab) => void;
  onViewMemberProfile?: (userId: string) => void;
}

export function OverviewView({
  overview,
  loans,
  user,
  loading,
  onNavigate,
  onOpenManagerDeskTab,
  onViewMemberProfile,
}: OverviewViewProps) {
  const t = useTranslations('Dashboard');
  const tOv = useTranslations('Dashboard.overviewView');
  const tNav = useTranslations('Navigation');
  const tCommon = useTranslations('Common');

  if (loading || !overview) {
    return (
      <div className="space-y-3">
        <div className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3">
          <Skeleton width={260} height={14} />
          <Skeleton width={320} height={22} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 space-y-2"
            >
              <Skeleton width="65%" height={12} />
              <Skeleton width="50%" height={20} />
              <Skeleton height={8} borderRadius={999} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          <div className="xl:col-span-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 sm:p-5 space-y-3">
            <Skeleton width={190} height={18} />
            <Skeleton height={150} borderRadius={10} />
          </div>
          <div className="xl:col-span-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 sm:p-5 space-y-3">
            <Skeleton width={210} height={18} />
            <Skeleton height={150} borderRadius={10} />
          </div>
        </div>
      </div>
    );
  }

  const { config, treasury, personal, phase, daysUntilMaturity } = overview;
  const ccy = config.currency;
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isAdmin = user.role === 'admin';

  const myActiveOrPendingLoan = !isAdmin
    ? loans.find(
        (l) =>
          (l.borrowerId === user.id ||
            (Boolean(user.memberCode) && l.borrowerCode === user.memberCode)) &&
          [
            'pending_guarantor',
            'pending_manager_review',
            'pending_vote',
            'approved_pending_disbursement',
            'active',
          ].includes(l.status)
      ) ||
      (personal.eligibility?.activeLoanId
        ? loans.find(
            (l) =>
              l.id === personal.eligibility.activeLoanId &&
              l.status !== 'rejected' &&
              l.status !== 'repaid'
          ) || null
        : null)
    : null;

  const myGuarantorRequests = !isAdmin
    ? loans.filter(
        (l) =>
          l.status === 'pending_guarantor' &&
          l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
      )
    : [];

  const pendingGuarantorLoansCount = loans.filter((l) => l.status === 'pending_guarantor').length;

  return (
    <div className="space-y-3">
      {/* Phase & Pre-Specified Maturity Date Banner */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="amanah-card-emerald border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 transition-all duration-200"
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {phase === 'qard_hasan' ? t('phase1Title') : t('phase2Title')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {t('targetMaturity', { date: formatShortDate(config.maturityDate) })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
              {tCommon('daysRemaining', { days: daysUntilMaturity })}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            {config.fundName}
          </h2>
        </div>
      </motion.section>

      {/* Active or Pending Qard Hasan Request Tracker (Member / Manager Personal View) */}
      {myActiveOrPendingLoan && (() => {
        const loan = myActiveOrPendingLoan;
        let progressPct = 20;
        let stageCaption = '';
        let barColor = 'bg-amber-500';
        const deskName = isAdmin ? tNav('governanceDesk') : tNav('managerDesk');
        if (loan.status === 'pending_guarantor') {
          progressPct = 15;
          const pendingNames = (loan.guarantors || [])
            .filter((g) => g.status === 'pending')
            .map((g) => g.memberName)
            .join(', ');
          stageCaption = pendingNames
            ? tOv('stageGuarantorNames', { names: pendingNames })
            : tOv('stageGuarantor');
        } else if (loan.status === 'pending_manager_review') {
          progressPct = 35;
          stageCaption = tOv('stageManagerReview', { desk: deskName });
        } else if (loan.status === 'pending_vote') {
          progressPct = 60;
          const cast = loan.totalVotesCast ?? loan.votes.length;
          stageCaption = tOv('stageVotingOpen', { cast, total: loan.totalEligibleVoters });
        } else if (loan.status === 'approved_pending_disbursement') {
          progressPct = 85;
          stageCaption = tOv('stageAwaitingDisbursement', { desk: deskName });
          barColor = 'bg-teal-600 dark:bg-teal-500';
        } else if (loan.status === 'active') {
          progressPct =
            loan.amount > 0
              ? Math.min(100, Math.round((loan.totalRepaid / loan.amount) * 100))
              : 0;
          stageCaption = tOv('stageActiveDisbursed', {
            repaid: formatMoney(loan.totalRepaid, ccy),
            total: formatMoney(loan.amount, ccy),
            remaining: formatMoney(loan.remainingBalance, ccy),
          });
          barColor = 'bg-emerald-600';
        }

        return (
          <section
            aria-label={t('alerts.activeLoanRequest')}
            className="amanah-card-teal border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-4 transition-all duration-200"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                    <HandCoins className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('alerts.activeLoanRequest')}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {loan.id}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <StatusText status={loan.status} />
                </div>

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(loan.amount, ccy)}
                  </h3>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {tOv('installmentsSummary', {
                      months: loan.installmentMonths,
                      amount: formatMoney(loan.monthlyInstallment, ccy),
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-3xl">
                  {t('alerts.purposeLabel', { purpose: loan.purpose })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {loan.status === 'pending_vote' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('ballot')}
                    className="px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] transition-all"
                  >
                    <Vote className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('alerts.openVoting')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('quard-hasan')}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-900/15 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] transition-all"
                >
                  <span>{t('alerts.openQardHasan')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{stageCaption}</span>
                <span className="font-mono tabular-nums shrink-0">{progressPct}%</span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Guarantor Co-Sign Alert */}
      {myGuarantorRequests.length > 0 && (
        <section className="bg-amber-50/75 dark:bg-amber-950/35 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {myGuarantorRequests.length}{' '}
                {myGuarantorRequests.length === 1
                  ? tOv('guarantorWaitingSingle')
                  : tOv('guarantorWaitingMulti')}
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {myGuarantorRequests[0].borrowerName} ({myGuarantorRequests[0].id}) ·{' '}
                {formatMoney(myGuarantorRequests[0].amount, ccy)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('quard-hasan')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap cursor-pointer shrink-0"
          >
            {t('alerts.openQardHasan')} →
          </button>
        </section>
      )}

      {/* Overdue Installment Warning */}
      {treasury.overdueInstallmentsCount > 0 && (
        <section className="bg-red-50/75 dark:bg-red-950/35 backdrop-blur-md border border-red-200/80 dark:border-red-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-red-900 dark:text-red-200">
                {treasury.overdueInstallmentsCount}{' '}
                {treasury.overdueInstallmentsCount === 1
                  ? tOv('overdueSingle')
                  : tOv('overdueMulti')}
              </div>
              <p className="text-xs text-red-800 dark:text-red-300">
                {!isAdmin && !personal.eligibility.noOverdueInstallments
                  ? tOv('overdueMemberNotice', { count: personal.eligibility.overdueCount ?? 0 })
                  : tOv('overdueCoopNotice')}
              </p>
            </div>
          </div>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap cursor-pointer shrink-0"
            >
              {t('alerts.inspectRepayments')} →
            </button>
          )}
        </section>
      )}

      {/* Pending Member Signup Approvals Notice for Admins */}
      {isAdmin && treasury.pendingMembersCount > 0 && (
        <section className="bg-amber-50/75 dark:bg-amber-950/35 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {treasury.pendingMembersCount}{' '}
              {treasury.pendingMembersCount === 1
                ? tOv('pendingAppSingle')
                : tOv('pendingAppMulti')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('member-registry')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 whitespace-nowrap cursor-pointer shrink-0"
          >
            {t('alerts.reviewUsersRoles')} →
          </button>
        </section>
      )}

      {/* 4-Column Amanah Treasury Headline KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MotionCard
          hue="deep-emerald"
          delay={0.02}
          className="border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>{tOv('amanahHeightTitle')}</span>
            <span className="w-8 h-8 rounded-[10px] shadow-sm shadow-emerald-500/20 bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-[26px] font-bold tracking-tight font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(treasury.amanahHeight, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {tOv('contributingMembersPending', {
              count: treasury.contributingMembersCount,
              amount: formatMoney(treasury.pendingContributionsAmount, ccy),
            })}
          </div>
        </MotionCard>

        <MotionCard
          hue="sky"
          delay={0.06}
          className="border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>{t('kpi.currentBalance')}</span>
            <span className="w-8 h-8 rounded-[10px] shadow-sm shadow-blue-500/20 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-[26px] font-bold tracking-tight font-mono tabular-nums text-blue-700 dark:text-blue-400">
            {formatMoney(treasury.currentBalance, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {tOv('currentBalanceFormula')}
          </div>
        </MotionCard>

        <MotionCard
          hue="amber"
          delay={0.1}
          className="border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>{tOv('qardHasanTotalCurrent')}</span>
            <span className="w-8 h-8 rounded-[10px] shadow-sm shadow-amber-500/20 bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <HandCoins className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-[26px] font-bold tracking-tight font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(treasury.quardHasanTotalCurrent, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {tOv('activeBorrowersDisbursed', {
              count: treasury.activeBorrowers.length,
              label:
                treasury.activeBorrowers.length === 1
                  ? t('kpi.borrowerSingular')
                  : t('kpi.borrowerPlural'),
              amount: formatMoney(treasury.totalLoansDisbursed, ccy),
            })}
          </div>
        </MotionCard>

        <MotionCard
          hue="violet"
          delay={0.14}
          className="border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>{tOv('repaymentsReturnedPlus')}</span>
            <span className="w-8 h-8 rounded-[10px] shadow-sm shadow-purple-500/20 bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-[26px] font-bold tracking-tight font-mono tabular-nums text-purple-700 dark:text-purple-400">
            {formatMoney(treasury.totalRepaid, ccy)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {treasury.approvedLoansDeducted > 0
              ? tOv('restoredToCentralFund', {
                  pct: Math.round((treasury.totalRepaid / treasury.approvedLoansDeducted) * 100),
                })
              : tOv('revolvingPrincipal100')}
          </div>
        </MotionCard>
      </section>

      {/* This Month Treasury Pulse */}
      <section className="rounded-xl sm:rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 shadow-[0_6px_24px_-14px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.4)] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/75 dark:divide-slate-800/80 overflow-hidden">
        <div className="p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>{tOv('thisMonthContributionWithMonth', { month: treasury.thisMonthKey })}</span>
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthContributionCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthContributionTarget, ccy)}
              </span>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              style={{
                originX: 0,
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
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            />
          </div>
        </div>

        <div className="p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {t('sheets.thisMonthDue')}
            </div>
            <div
              className={`mt-1.5 text-base font-bold font-mono tabular-nums ${
                treasury.thisMonthDueRemaining > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {formatMoney(treasury.thisMonthDueRemaining, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthDueTarget, ccy)}
              </span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {treasury.thisMonthDueRemaining === 0
              ? t('sheets.allTargetsCollected')
              : t('sheets.pendingCollectionCycle')}
          </div>
        </div>

        <div className="p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {t('sheets.thisMonthHasanInstallment')}
            </div>
            <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthHasanInstallmentCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthHasanInstallmentNeed, ccy)}
              </span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {treasury.thisMonthHasanInstallmentNeed > 0
              ? t('sheets.installmentsDueCollected')
              : t('sheets.noInstallmentsDue')}
          </div>
        </div>

        <div className="p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>{t('sheets.thisMonthClearance')}</span>
              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.thisMonthClearanceClearedMembers}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {treasury.thisMonthClearanceTotalMembers} {tOv('clearedMembersSuffix')}
              </span>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              style={{
                originX: 0,
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
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            />
          </div>
        </div>
      </section>

      {/* Active Qard Hasan Borrowers + This Month Member Clearance */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
        <MotionCard
          as="section"
          hue="amber"
          className="xl:col-span-6 border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {tOv('activeQardHasanMembers')}
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {tOv('activeCountLabel', { count: treasury.activeBorrowers.length })}
            </span>
          </div>

          {treasury.activeBorrowers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {t('sheets.noActiveBorrowers')}
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
                        <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                          ({b.borrowerCode})
                        </span>
                      </button>
                    ) : (
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {b.borrowerName}{' '}
                        <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                          ({b.borrowerCode})
                        </span>
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {b.loanId}
                      {b.nextDueDate
                        ? ` · ${tOv('nextDuePrefix', { date: formatShortDate(b.nextDueDate) })}`
                        : ''}
                      {b.missedInstallmentsCount > 0 && (
                        <span className="text-red-600 dark:text-red-400 ml-1.5">
                          · {t('sheets.overdueCount', { count: b.missedInstallmentsCount })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {formatMoney(b.mainAmount, ccy)}{' '}
                      <span className="text-slate-400 dark:text-slate-600 font-normal">/</span>{' '}
                      <span className="text-amber-700 dark:text-amber-400">
                        {formatMoney(b.dueAmount, ccy)} {t('sheets.dueLower')}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      {t('sheets.repaidAmount', { amount: formatMoney(b.totalRepaid, ccy) })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </MotionCard>

        <MotionCard
          as="section"
          hue="emerald"
          className="xl:col-span-6 border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {tOv('thisMonthClearanceWithMonth', { month: treasury.thisMonthKey })}
              </h3>
            </div>
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              {treasury.thisMonthClearanceClearedMembers}/{treasury.thisMonthClearanceTotalMembers}
            </span>
          </div>

          {treasury.thisMonthMemberClearance.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {t('sheets.noActiveContributors')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto pr-1 scrollbar-subtle">
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
                        <span className="font-mono text-slate-500 dark:text-slate-400 font-normal">
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
                    className={`font-semibold text-xs shrink-0 ${
                      entry.status === 'cleared'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : entry.status === 'pending'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {entry.status === 'cleared'
                      ? t('sheets.clearedBadge')
                      : entry.status === 'pending'
                        ? t('sheets.pendingReviewBadge')
                        : t('sheets.dueBadge')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </MotionCard>
      </div>

      {/* Admin Governance Oversight + Active Governance Approval Queues */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
        {isAdmin && (
          <MotionCard
            as="section"
            hue="teal"
            className="xl:col-span-5 border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between space-y-4 transition-all duration-200"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{tOv('adminNonContribBadge')}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {tOv('platformOversightTitle')}
              </h3>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs pt-1">
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t('sheets.pendingProfileEdits')}</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {treasury.pendingProfileRequestsCount}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t('sheets.openDecisionPolls')}</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {treasury.openDecisionPollsCount}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">{t('sheets.upcomingMeetings')}</dt>
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
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-900/15 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tNav('usersAndRoles')}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('site-settings')}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-2xs active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              >
                <span>{tNav('siteSettings')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </MotionCard>
        )}

        <section
          className={`${isAdmin ? 'xl:col-span-7' : 'xl:col-span-12'} bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-[0_6px_24px_-14px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.4)] flex flex-col justify-between`}
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {tOv('activeGovernanceQueues')}
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('sheets.queuesSubtitle')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200/75 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  isStaff && onOpenManagerDeskTab
                    ? onOpenManagerDeskTab('qard-hasan')
                    : onNavigate(isStaff ? 'manager-desk' : 'quard-hasan')
                }
                className="group bg-white/95 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <span>{t('sheets.pendingLoanReviews')}</span>
                  <span className="w-8 h-8 rounded-[10px] bg-amber-100/85 dark:bg-amber-500/15 border border-amber-200/80 dark:border-amber-500/30 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingLoansReviewCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                  {isStaff
                    ? pendingGuarantorLoansCount > 0
                      ? tOv('initiateBallotPlus', { count: pendingGuarantorLoansCount })
                      : tOv('initiateBallotShort')
                    : tOv('inspectQardQueue')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('ballot')}
                className="group bg-white/95 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <span>{t('sheets.openTwoThirdsBallots')}</span>
                  <span className="w-8 h-8 rounded-[10px] bg-amber-100/85 dark:bg-amber-500/15 border border-amber-200/80 dark:border-amber-500/30 flex items-center justify-center shrink-0">
                    <Vote className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingVotesCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                  {tOv('castAnonymizedVote')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isStaff && onOpenManagerDeskTab) {
                    onOpenManagerDeskTab('contributions');
                  } else {
                    onNavigate(
                      user.role === 'manager'
                        ? 'manager-desk'
                        : isAdmin
                          ? 'transaction-history'
                          : 'monthly-contribution'
                    );
                  }
                }}
                className="group bg-white/95 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>{t('sheets.pendingDeposits')}</span>
                  <span className="w-8 h-8 rounded-[10px] bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingContributionsCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                  {isStaff
                    ? tOv('reviewInDeskArrow', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tOv('viewSubStatusArrow')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isStaff && onOpenManagerDeskTab) {
                    onOpenManagerDeskTab('qard-hasan');
                  } else {
                    onNavigate(isStaff ? 'manager-desk' : 'ballot');
                  }
                }}
                className="group bg-white/95 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-teal-700 dark:text-teal-400 font-medium">
                  <span>{t('sheets.awaitingDisbursement')}</span>
                  <span className="w-8 h-8 rounded-[10px] bg-teal-100/85 dark:bg-teal-500/15 border border-teal-200/80 dark:border-teal-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck
                      className="w-4 h-4 text-teal-600 dark:text-teal-400"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingDisbursementsCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                  {isStaff
                    ? tOv('confirmPayoutArrow', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tOv('multiSigReleaseArrow')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isStaff && onOpenManagerDeskTab) {
                    onOpenManagerDeskTab('installments');
                  } else {
                    onNavigate(
                      user.role === 'manager'
                        ? 'manager-desk'
                        : isAdmin
                          ? 'transaction-history'
                          : 'quard-hasan'
                    );
                  }
                }}
                className="group bg-white/95 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left p-4 transition-colors duration-150 cursor-pointer sm:col-span-2 lg:col-span-2 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>{t('sheets.pendingRepayments')}</span>
                  <span className="w-8 h-8 rounded-[10px] bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingRepaymentsCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                  {isStaff
                    ? tOv('verifyInstallmentsArrow', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tOv('inspectReceiptsArrow')}
                </div>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
