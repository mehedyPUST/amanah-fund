'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  History,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardSectionId,
  FundConfig,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { scrollFilterButtonWithNeighbors } from '../utils/scrollFilterBar.ts';
import { MotionCard } from './MotionCard.tsx';
import { StatusText } from './StatusText.tsx';

export type RecentTransactionsNavTarget = DashboardSectionId;

interface RecentTransactionsProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  config: FundConfig | null;
  user: PublicUser;
  loading?: boolean;
  maxItems?: number;
  onNavigate?: (tab: RecentTransactionsNavTarget) => void;
}

type ActivityFilter = 'all' | 'contribution' | 'loan_payment';

interface RecentTransactionItem {
  id: string;
  type: 'contribution' | 'loan_payment';
  title: string;
  subtitle: string;
  dateIso: string;
  dateLabel: string;
  fullDateLabel: string;
  channel: string;
  provider: string;
  maskedReference: string;
  decryptedReference?: string;
  amount: number;
  status: string;
  sortPriority: number;
  reviewerName?: string;
  note?: string;
  targetTab: RecentTransactionsNavTarget;
}

export function RecentTransactions({
  contributions,
  loans,
  config,
  user,
  loading = false,
  maxItems = 6,
  onNavigate,
}: RecentTransactionsProps) {
  const t = useTranslations('Transactions');
  const tCommon = useTranslations('Common');
  const tStatus = useTranslations('Status');
  const ccy = config?.currency || 'BDT';
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = useMemo<RecentTransactionItem[]>(() => {
    const list: RecentTransactionItem[] = [];

    contributions
      .filter((c) => c.userId === user.id)
      .forEach((c) => {
        const eventIso = c.reviewedAt || c.submittedAt;
        list.push({
          id: `contrib-${c.id}`,
          type: 'contribution',
          title: t('monthlyContributionTitle', { month: formatBillingMonth(c.billingMonth) }),
          subtitle: t('centralFundDeposit'),
          dateIso: eventIso,
          dateLabel: formatShortDate(c.submittedAt),
          fullDateLabel: formatDateTime(c.submittedAt),
          channel: c.channel.toUpperCase(),
          provider: c.providerName,
          maskedReference: c.maskedReference,
          decryptedReference: c.decryptedDetails?.referenceId,
          amount: c.amount,
          status: c.status,
          sortPriority: 0,
          reviewerName: c.reviewerName,
          note: c.reviewNote || c.decryptedDetails?.notes,
          targetTab: 'monthly-contribution',
        });
      });

    loans
      .filter((l) => l.borrowerId === user.id || (Boolean(user.memberCode) && l.borrowerCode === user.memberCode))
      .forEach((loan) => {
        if (loan.status !== 'active' && loan.status !== 'repaid') {
          list.push({
            id: `loan-req-${loan.id}`,
            type: 'loan_payment',
            title: t('qardHasanRequestTitle', { id: loan.id }),
            subtitle: t('installmentSubtitle', { months: loan.installmentMonths, purpose: loan.purpose }),
            dateIso: loan.approvedAt || loan.requestedAt,
            dateLabel: formatShortDate(loan.requestedAt),
            fullDateLabel: formatDateTime(loan.requestedAt),
            channel: loan.decryptedSensitiveNotes?.channel.toUpperCase() || 'QARD HASAN',
            provider: loan.decryptedSensitiveNotes?.provider || t('applicationLabel'),
            maskedReference: loan.id,
            amount: loan.amount,
            status: loan.status,
            sortPriority: 0,
            reviewerName: loan.adminReviewedBy || loan.voteInitiatedBy,
            note: loan.purpose,
            targetTab: 'quard-hasan',
          });
          return;
        }

        let addedNextScheduled = false;

        loan.installments.forEach((inst) => {
          const isSubmittedOrOverdue =
            inst.status === 'paid' ||
            inst.status === 'pending_verification' ||
            inst.status === 'overdue';

          const isNextScheduled =
            loan.status === 'active' && inst.status === 'scheduled' && !addedNextScheduled;

          if (!isSubmittedOrOverdue && !isNextScheduled) return;
          if (isNextScheduled) addedNextScheduled = true;

          const eventIso = inst.paidAt || inst.submittedAt || inst.dueDate;
          const hasSubmission = Boolean(inst.paidAt || inst.submittedAt);

          list.push({
            id: `repay-${loan.id}-${inst.installmentNumber}`,
            type: 'loan_payment',
            title: t('loanPaymentTitle', { num: inst.installmentNumber, total: loan.installmentMonths }),
            subtitle: `${loan.id} · ${loan.purpose}`,
            dateIso: eventIso,
            dateLabel: hasSubmission
              ? formatShortDate(inst.paidAt || inst.submittedAt)
              : t('duePrefix', { date: formatShortDate(inst.dueDate) }),
            fullDateLabel: hasSubmission
              ? formatDateTime(inst.paidAt || inst.submittedAt)
              : t('duePrefix', { date: formatShortDate(inst.dueDate) }),
            channel: inst.repaymentChannel ? inst.repaymentChannel.toUpperCase() : 'SCHEDULE',
            provider: inst.repaymentProvider || t('installmentPlan'),
            maskedReference: inst.maskedReference || '—',
            decryptedReference: inst.decryptedReceipt?.referenceId,
            amount: inst.status === 'paid' ? inst.paidAmount : inst.amount,
            status: inst.status,
            sortPriority: inst.status === 'scheduled' ? 1 : 0,
            reviewerName: inst.verifierName,
            note: inst.decryptedReceipt?.notes,
            targetTab: 'quard-hasan',
          });
        });
      });

    list.sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) {
        return a.sortPriority - b.sortPriority;
      }
      if (a.sortPriority === 1) {
        return a.dateIso.localeCompare(b.dateIso);
      }
      return b.dateIso.localeCompare(a.dateIso);
    });

    return list;
  }, [contributions, loans, user.id, user.memberCode, t]);

  const counts = useMemo(() => {
    const contribCount = items.filter((i) => i.type === 'contribution').length;
    const loanCount = items.filter((i) => i.type === 'loan_payment').length;
    const pendingCount = items.filter(
      (i) => i.status === 'pending' || i.status === 'pending_verification'
    ).length;
    return {
      all: items.length,
      contribution: contribCount,
      loan_payment: loanCount,
      pendingCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.type === filter);
  }, [items, filter]);

  const visibleItems = filteredItems.slice(0, maxItems);

  return (
    <MotionCard
      as="section"
      hue="sky"
      aria-labelledby="recent-transactions-heading"
      className="backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 border rounded-2xl p-5 sm:p-6 space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <History className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('personalActivityFeed')}</span>
          </div>
          <h3
            id="recent-transactions-heading"
            className="text-base font-semibold text-slate-900 dark:text-white"
          >
            {t('recentActivity')}
          </h3>
          {counts.pendingCount > 0 && (
            <p className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
              {t('awaitingVerification', { count: counts.pendingCount })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 max-w-full">
          <div
            role="group"
            aria-label={t('filterRecentAria')}
            className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth max-w-full w-full sm:w-fit items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/75 dark:border-slate-700/75"
          >
            {(
              [
                { id: 'all', label: t('allCount', { count: counts.all }) },
                { id: 'contribution', label: t('contributionsCount', { count: counts.contribution }) },
                { id: 'loan_payment', label: t('loanPaymentsCount', { count: counts.loan_payment }) },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={(e) => {
                    setFilter(tab.id);
                    scrollFilterButtonWithNeighbors(e.currentTarget);
                  }}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="recent-tx-filter-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('transaction-history')}
              className="group px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-[0.98]"
            >
              <span>{t('openTransactions')}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton width={36} height={36} borderRadius={8} />
                <div className="space-y-1.5 flex-1">
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="40%" height={11} />
                </div>
              </div>
              <div className="space-y-1 text-right">
                <Skeleton width={76} height={14} />
                <Skeleton width={64} height={11} />
              </div>
            </div>
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/25 space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {items.length === 0
              ? t('noActivityYet')
              : filter === 'contribution'
                ? t('noContribsYet')
                : t('noLoanPaymentsYet')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {items.length === 0 ? t('noActivityHint') : t('switchFilterHint')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {filter !== 'all' && items.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap transition-colors"
              >
                {t('showAllActivity')}
              </button>
            )}
            {onNavigate && (filter === 'all' || filter === 'contribution') && (
              <button
                type="button"
                onClick={() => onNavigate('monthly-contribution')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all"
              >
                <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('submitCapitalDeposit')}</span>
              </button>
            )}
            {onNavigate && (filter === 'all' || filter === 'loan_payment') && (
              <button
                type="button"
                onClick={() => onNavigate('quard-hasan')}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <HandCoins className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('viewQardHasanLoans')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
          {visibleItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const isContribution = item.type === 'contribution';
            const isNegativeState = item.status === 'rejected' || item.status === 'overdue';

            return (
              <div key={item.id} className="transition-colors">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  aria-expanded={isExpanded}
                  className="w-full py-3.5 px-2.5 -mx-2.5 rounded-xl flex items-center justify-between gap-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                        isContribution
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isContribution ? (
                        <CreditCard className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <HandCoins className="w-4 h-4" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">{item.dateLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {item.channel} · {item.provider}
                        </span>
                        {item.maskedReference !== '—' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{item.maskedReference}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right space-y-0.5">
                      <div
                        className={`text-sm font-mono font-semibold tabular-nums ${
                          isNegativeState
                            ? 'text-red-700 dark:text-red-400'
                            : item.status === 'scheduled'
                              ? 'text-slate-700 dark:text-slate-300'
                              : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatMoney(item.amount, ccy)}
                      </div>
                      <div className="flex justify-end">
                        <StatusText status={item.status} />
                      </div>
                    </div>

                    <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="mb-3 ml-0 sm:ml-12 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div>
                          <span className="text-slate-400 dark:text-slate-500">{t('timestampLabel')} </span>
                          <span className="text-slate-800 dark:text-slate-200">
                            {item.fullDateLabel}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-500">{t('referenceLabel')} </span>
                          <span className="text-slate-800 dark:text-slate-200">
                            {item.decryptedReference || item.maskedReference}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-500">{t('verifiedByLabel')} </span>
                          <span className="text-slate-800 dark:text-slate-200">
                            {item.reviewerName || (item.status === 'scheduled' ? tStatus('scheduled') : tCommon('pending'))}
                          </span>
                        </div>
                        <div className="sm:col-span-3 font-sans text-slate-600 dark:text-slate-300">
                          <span className="text-slate-400 dark:text-slate-500">{t('detailsLabel')} </span>
                          {item.subtitle}
                          {item.note ? ` — ${item.note}` : ''}
                        </div>
                      </div>

                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate(item.targetTab)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-teal-300 dark:hover:border-teal-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center transition-colors"
                        >
                          <span>
                            {item.status === 'scheduled' || item.status === 'overdue'
                              ? t('openQardHasan')
                              : isContribution
                                ? t('openContributions')
                                : t('openQardHasan')}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {filteredItems.length > visibleItems.length && onNavigate && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            {t('showingLatest', { shown: visibleItems.length, total: filteredItems.length })}
          </span>
          <button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span>{t('viewAllInTransactions', { total: filteredItems.length })}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </MotionCard>
  );
}
