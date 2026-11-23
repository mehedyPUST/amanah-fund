'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  FileDown,
  HandCoins,
  History,
  Search,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardSectionId,
  FundConfig,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { downloadContributionAndLoanPdfStatement } from '../utils/pdfStatement.ts';
import {
  escapeCsvCell,
  formatBillingMonth,
  formatDateTime,
  formatMoney,
  formatShortDate,
  shortHash,
} from '../utils/format.ts';
import { scrollFilterButtonWithNeighbors } from '../utils/scrollFilterBar.ts';
import { useCoopSession } from './AppProviders.tsx';
import { StatusText } from './StatusText.tsx';

export type TransactionTabTarget = DashboardSectionId;

interface TransactionHistoryProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  compact?: boolean;
  onNavigate?: (tab: TransactionTabTarget) => void;
  onViewMemberProfile?: (memberId: string) => void;
}

type TransactionCategory = 'contribution' | 'loan_repayment' | 'loan_disbursement';
type TypeFilter = 'all' | 'contribution' | 'loan_repayment' | 'loan_disbursement';
type StatusFilter = 'all' | 'completed' | 'pending' | 'scheduled' | 'attention';

interface LedgerRow {
  id: string;
  category: TransactionCategory;
  memberId: string;
  memberName: string;
  memberCode: string;
  sortDate: string;
  monthKey: string;
  displayDate: string;
  periodLabel: string;
  title: string;
  subtitle: string;
  channelLabel: string;
  providerName: string;
  maskedReference: string;
  status: string;
  statusBucket: Exclude<StatusFilter, 'all'>;
  amount: number;
  directionLabel: string;
  loanId?: string;
  loanRemainingBalance?: number;
  installmentNumber?: number;
  totalInstallments?: number;
  decryptedReference?: string;
  decryptedSenderAccount?: string;
  decryptedNotes?: string;
  reviewerOrVerifier?: string;
  reviewNote?: string;
  entryHash?: string;
  batchGroupId?: string;
}

export function TransactionHistory({
  contributions,
  loans,
  config,
  user,
  loading,
  compact = false,
  onNavigate,
  onViewMemberProfile,
}: TransactionHistoryProps) {
  const { locale } = useCoopSession();
  const t = useTranslations('Transactions');
  const tCommon = useTranslations('Common');
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isStaff = isAdmin || user.role === 'manager';

  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [monthRangeActive, setMonthRangeActive] = useState(false);
  const [startMonthIdx, setStartMonthIdx] = useState(0);
  const [endMonthIdx, setEndMonthIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const effectiveScope = !compact && isStaff ? (isAdmin ? 'all' : scope) : isAdmin ? 'all' : 'mine';

  const { allRows, activeLoans } = useMemo(() => {
    const rows: LedgerRow[] = [];

    const scopedContributions =
      effectiveScope === 'mine'
        ? contributions.filter((c) => c.userId === user.id)
        : contributions;

    scopedContributions.forEach((c) => {
      const statusBucket: LedgerRow['statusBucket'] =
        c.status === 'approved'
          ? 'completed'
          : c.status === 'pending'
            ? 'pending'
            : 'attention';

      rows.push({
        id: `tx-contrib-${c.id}`,
        category: 'contribution',
        memberId: c.userId,
        memberName: c.memberName,
        memberCode: c.memberCode,
        sortDate: c.reviewedAt || c.submittedAt,
        monthKey: c.billingMonth,
        displayDate: formatDateTime(c.submittedAt),
        periodLabel: formatBillingMonth(c.billingMonth),
        title: t('monthlyContributionTitle', { month: formatBillingMonth(c.billingMonth) }),
        subtitle:
          effectiveScope === 'all'
            ? `${c.memberName} (${c.memberCode})`
            : t('coopCentralFundDeposit'),
        channelLabel: c.channel.toUpperCase(),
        providerName: c.providerName,
        maskedReference: c.maskedReference,
        status: c.status,
        statusBucket,
        amount: c.amount,
        directionLabel: t('dirContribution'),
        decryptedReference: c.decryptedDetails?.referenceId,
        decryptedSenderAccount: c.decryptedDetails?.senderAccount,
        decryptedNotes: c.decryptedDetails?.notes,
        reviewerOrVerifier: c.reviewerName,
        reviewNote: c.reviewNote,
        entryHash: c.entryHash,
        batchGroupId: c.batchGroupId,
      });
    });

    const scopedRepayableLoans = loans.filter(
      (l) =>
        (l.status === 'active' || l.status === 'repaid') &&
        (effectiveScope === 'mine' ? l.borrowerId === user.id : true)
    );
    const scopedActiveLoans = scopedRepayableLoans.filter((l) => l.status === 'active');

    scopedRepayableLoans.forEach((loan) => {
      if (loan.disbursementSignature) {
        const disbursedAt = loan.disbursementSignature.signedAt;
        const txRef = loan.disbursementSignature.transactionNumber || loan.id;
        rows.push({
          id: `tx-disburse-${loan.id}`,
          category: 'loan_disbursement',
          memberId: loan.borrowerId,
          memberName: loan.borrowerName,
          memberCode: loan.borrowerCode,
          sortDate: disbursedAt,
          monthKey: disbursedAt.slice(0, 7),
          displayDate: formatDateTime(disbursedAt),
          periodLabel: formatShortDate(disbursedAt),
          title: t('qardHasanDisbursementTitle', { id: loan.id }),
          subtitle:
            effectiveScope === 'all'
              ? `${loan.borrowerName} (${loan.borrowerCode}) · ${loan.purpose}`
              : loan.purpose,
          channelLabel: (loan.decryptedSensitiveNotes?.channel || 'bank').toUpperCase(),
          providerName: loan.decryptedSensitiveNotes?.provider || t('qardHasanPayout'),
          maskedReference: txRef,
          status: loan.status === 'repaid' ? 'repaid' : 'disbursed',
          statusBucket: 'completed',
          amount: loan.amount,
          directionLabel: t('dirDisbursement'),
          loanId: loan.id,
          loanRemainingBalance: loan.remainingBalance,
          decryptedReference: txRef,
          decryptedSenderAccount: loan.decryptedSensitiveNotes?.disbursementAccount,
          reviewerOrVerifier: loan.disbursementSignature.signedByName,
          entryHash: loan.entryHash,
        });
      }

      loan.installments.forEach((inst) => {
        const statusBucket: LedgerRow['statusBucket'] =
          inst.status === 'paid'
            ? 'completed'
            : inst.status === 'pending_verification'
              ? 'pending'
              : inst.status === 'overdue'
                ? 'attention'
                : 'scheduled';

        const eventIso = inst.paidAt || inst.submittedAt || inst.dueDate;
        const displayDate =
          inst.paidAt || inst.submittedAt
            ? formatDateTime(inst.paidAt || inst.submittedAt)
            : t('duePrefix', { date: formatShortDate(inst.dueDate) });

        rows.push({
          id: `tx-repay-${loan.id}-${inst.installmentNumber}`,
          category: 'loan_repayment',
          memberId: loan.borrowerId,
          memberName: loan.borrowerName,
          memberCode: loan.borrowerCode,
          sortDate: eventIso,
          monthKey: eventIso.slice(0, 7),
          displayDate,
          periodLabel: t('duePrefix', { date: formatShortDate(inst.dueDate) }),
          title: t('loanRepaymentTitle', { num: inst.installmentNumber, total: loan.installmentMonths }),
          subtitle:
            effectiveScope === 'all'
              ? `${loan.borrowerName} · ${loan.id} · ${loan.purpose}`
              : `${loan.id} · ${loan.purpose}`,
          channelLabel: inst.repaymentChannel ? inst.repaymentChannel.toUpperCase() : 'SCHEDULE',
          providerName: inst.repaymentProvider || t('installmentPlan'),
          maskedReference: inst.maskedReference || '—',
          status: inst.status,
          statusBucket,
          amount: inst.status === 'paid' ? inst.paidAmount : inst.amount,
          directionLabel: t('dirRepayment'),
          loanId: loan.id,
          loanRemainingBalance: loan.remainingBalance,
          installmentNumber: inst.installmentNumber,
          totalInstallments: loan.installmentMonths,
          decryptedReference: inst.decryptedReceipt?.referenceId,
          decryptedSenderAccount: inst.decryptedReceipt?.senderAccount,
          decryptedNotes: inst.decryptedReceipt?.notes,
          reviewerOrVerifier: inst.verifierName,
          entryHash: loan.entryHash,
        });
      });
    });

    rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate));

    return { allRows: rows, activeLoans: scopedActiveLoans };
  }, [contributions, loans, effectiveScope, user.id, t]);

  const counts = useMemo(() => {
    const contribCount = allRows.filter((r) => r.category === 'contribution').length;
    const repayCount = allRows.filter((r) => r.category === 'loan_repayment').length;
    const disburseCount = allRows.filter((r) => r.category === 'loan_disbursement').length;

    const approvedContribTotal = allRows
      .filter((r) => r.category === 'contribution' && r.status === 'approved')
      .reduce((sum, r) => sum + r.amount, 0);

    const paidRepayRows = allRows.filter(
      (r) => r.category === 'loan_repayment' && r.status === 'paid'
    );
    const paidRepayTotal = paidRepayRows.reduce((sum, r) => sum + r.amount, 0);

    const pendingCount = allRows.filter((r) => r.statusBucket === 'pending').length;
    const activeLoanRemaining = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

    return {
      total: allRows.length,
      contribCount,
      repayCount,
      disburseCount,
      approvedContribTotal,
      paidRepayCount: paidRepayRows.length,
      paidRepayTotal,
      pendingCount,
      activeLoanRemaining,
    };
  }, [allRows, activeLoans]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => {
      if (/^\d{4}-\d{2}$/.test(r.monthKey)) {
        set.add(r.monthKey);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const maxMonthIdx = Math.max(0, availableMonths.length - 1);
  const safeStartIdx = Math.min(startMonthIdx, maxMonthIdx);
  const safeEndIdx = Math.min(Math.max(endMonthIdx, safeStartIdx), maxMonthIdx);
  const activeStartMonth = monthRangeActive ? availableMonths[safeStartIdx] : null;
  const activeEndMonth = monthRangeActive ? availableMonths[safeEndIdx] : null;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (typeFilter !== 'all' && row.category !== typeFilter) return false;
      if (statusFilter !== 'all' && row.statusBucket !== statusFilter) return false;
      if (activeStartMonth && activeEndMonth) {
        if (row.monthKey < activeStartMonth || row.monthKey > activeEndMonth) return false;
      }
      if (q) {
        const txNo = (row.decryptedReference || row.maskedReference).toLowerCase();
        return (
          row.title.toLowerCase().includes(q) ||
          row.subtitle.toLowerCase().includes(q) ||
          row.providerName.toLowerCase().includes(q) ||
          txNo.includes(q) ||
          row.periodLabel.toLowerCase().includes(q) ||
          row.memberName.toLowerCase().includes(q) ||
          (row.loanId || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allRows, typeFilter, statusFilter, search, activeStartMonth, activeEndMonth]);

  const displayedRows = compact ? filteredRows.slice(0, 6) : filteredRows;

  function handleExportCsv() {
    const headers = [
      'Type',
      'Member Code',
      'Member Name',
      'Description',
      'Billing / Due Period',
      'Date',
      'Channel',
      'Bank / Provider',
      'Transaction Number',
      'Status',
      `Amount (${ccy})`,
    ];
    const csvRows = [
      headers,
      ...filteredRows.map((r) => [
        r.directionLabel,
        r.memberCode,
        r.memberName,
        r.title,
        r.periodLabel,
        r.displayDate,
        r.channelLabel,
        r.providerName,
        r.decryptedReference || r.maskedReference,
        r.status,
        r.amount,
      ]),
    ];
    const csv = csvRows.map((line) => line.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amanah-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    downloadContributionAndLoanPdfStatement({
      user,
      config,
      contributions,
      loans,
      scope: effectiveScope,
      locale,
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      aria-label={t('memberTxHistoryAria')}
      className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
            <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('generalTreasuryLedger')}</span>
          </div>
          <h2 className="hidden sm:block text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
            {t('ledgerHeading')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto shrink-0">
          {!compact && isStaff && !isAdmin && (
            <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth max-w-full items-center gap-1 p-0.5 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 rounded-xl flex-1 sm:flex-none">
              {(
                [
                  { id: 'mine', label: t('myTransactions') },
                  { id: 'all', label: t('allMembers') },
                ] as const
              ).map((item) => {
                const active = scope === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      setScope(item.id);
                      scrollFilterButtonWithNeighbors(e.currentTarget);
                    }}
                    className={`relative flex-1 sm:flex-none px-2.5 py-1 text-[11.5px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="tx-scope-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!compact && filteredRows.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-teal-300 text-[11.5px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 active:scale-[0.98]"
            >
              <Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <span>{tCommon('exportCsv')}</span>
            </button>
          )}

          {!loading && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-[11.5px] font-medium shadow-xs active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{tCommon('downloadPdf')}</span>
            </button>
          )}

          {compact && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('transaction-history')}
              className="group h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11.5px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 active:scale-[0.98]"
            >
              <span>{t('openTransactions')}</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3 py-2 border-y border-slate-200/70 dark:border-slate-800/80">
        <div className="px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-white/60 dark:bg-slate-900/45 sm:bg-transparent sm:dark:bg-transparent">
          <div className="text-[10.5px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            {t('approvedContributions')}
          </div>
          <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(counts.approvedContribTotal, ccy)}
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
            {t('submissionsCount', {
              count: counts.contribCount,
              label: counts.contribCount === 1 ? t('submissionSingular') : t('submissionPlural'),
            })}
          </div>
        </div>

        <div className="px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-white/60 dark:bg-slate-900/45 sm:bg-transparent sm:dark:bg-transparent">
          <div className="text-[10.5px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            {t('loanRepaymentsPaid')}
          </div>
          <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
            {formatMoney(counts.paidRepayTotal, ccy)}
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
            {t('verifiedAndActiveLoans', {
              paid: counts.paidRepayCount,
              active: activeLoans.length,
              label: activeLoans.length === 1 ? t('loanSingular') : t('loanPlural'),
            })}
          </div>
        </div>

        <div className="px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-white/60 dark:bg-slate-900/45 sm:bg-transparent sm:dark:bg-transparent">
          <div className="text-[10.5px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            {t('activeLoanRemaining')}
          </div>
          <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(counts.activeLoanRemaining, ccy)}
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
            {activeLoans.length > 0 ? t('zeroInterestPrincipal') : t('noActiveLoanBalance')}
          </div>
        </div>

        <div className="px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-white/60 dark:bg-slate-900/45 sm:bg-transparent sm:dark:bg-transparent">
          <div className="text-[10.5px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            {t('pendingReview')}
          </div>
          <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {counts.pendingCount}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('awaitingManagerRecon')}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth max-w-full items-center gap-1 p-0.5 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 rounded-xl w-full lg:w-fit">
          {(
            [
              { id: 'all', label: t('allCount', { count: counts.total }) },
              { id: 'contribution', label: t('contributionsCount', { count: counts.contribCount }) },
              { id: 'loan_disbursement', label: t('disbursementsCount', { count: counts.disburseCount }) },
              { id: 'loan_repayment', label: t('repaymentsCount', { count: counts.repayCount }) },
            ] as const
          ).map((tab) => {
            const active = typeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={(e) => {
                  setTypeFilter(tab.id);
                  scrollFilterButtonWithNeighbors(e.currentTarget);
                }}
                className={`relative px-2.5 py-1 text-[11.5px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tx-type-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-teal-500/20"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex items-center gap-1.5 w-full lg:w-auto">
          <div className="relative min-w-0 flex-1 lg:w-60">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full h-8 pl-8 pr-2.5 text-[11.5px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>

          <select
            aria-label={t('filterByStatusAria')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 px-2.5 text-[11.5px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 shrink-0"
          >
            <option value="all">{t('allStatuses')}</option>
            <option value="completed">{t('statusCompletedGroup')}</option>
            <option value="pending">{t('statusPendingGroup')}</option>
            <option value="scheduled">{t('statusScheduledGroup')}</option>
            <option value="attention">{t('statusAttentionGroup')}</option>
          </select>
        </div>
      </div>

      {!compact && availableMonths.length > 0 && (
        <div className="px-2.5 py-2 rounded-xl bg-slate-50/90 dark:bg-slate-950/75 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 min-w-0">
              <CalendarRange className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span className="truncate">{t('monthSlidingFilter')}</span>
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                {monthRangeActive && activeStartMonth && activeEndMonth
                  ? `${formatBillingMonth(activeStartMonth)} — ${formatBillingMonth(activeEndMonth)}`
                  : t('allMonthsRange', {
                      start: formatBillingMonth(availableMonths[0]),
                      end: formatBillingMonth(availableMonths[maxMonthIdx]),
                    })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!monthRangeActive) {
                  setStartMonthIdx(0);
                  setEndMonthIdx(maxMonthIdx);
                  setMonthRangeActive(true);
                } else {
                  setMonthRangeActive(false);
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {monthRangeActive ? t('showAllMonths') : t('enableMonthRange')}
            </button>
          </div>

          {monthRangeActive && availableMonths.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/80 text-[11px]">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="w-12 shrink-0 font-medium">{t('fromLabel')}</span>
                <input
                  type="range"
                  aria-label={t('filterStartMonthAria')}
                  min={0}
                  max={maxMonthIdx}
                  value={monthRangeActive ? safeStartIdx : 0}
                  onChange={(e) => {
                    const nextStart = Number(e.target.value);
                    setMonthRangeActive(true);
                    setStartMonthIdx(nextStart);
                    if (nextStart > safeEndIdx) {
                      setEndMonthIdx(nextStart);
                    } else if (!monthRangeActive) {
                      setEndMonthIdx(maxMonthIdx);
                    }
                  }}
                  className="flex-1 accent-emerald-600 cursor-pointer"
                />
                <span className="font-mono w-20 text-right shrink-0">
                  {formatBillingMonth(availableMonths[monthRangeActive ? safeStartIdx : 0])}
                </span>
              </label>

              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="w-12 shrink-0 font-medium">{t('toLabel')}</span>
                <input
                  type="range"
                  aria-label={t('filterEndMonthAria')}
                  min={0}
                  max={maxMonthIdx}
                  value={monthRangeActive ? safeEndIdx : maxMonthIdx}
                  onChange={(e) => {
                    const nextEnd = Number(e.target.value);
                    setMonthRangeActive(true);
                    setEndMonthIdx(nextEnd);
                    if (nextEnd < safeStartIdx) {
                      setStartMonthIdx(nextEnd);
                    }
                  }}
                  className="flex-1 accent-emerald-600 cursor-pointer"
                />
                <span className="font-mono w-20 text-right shrink-0">
                  {formatBillingMonth(availableMonths[monthRangeActive ? safeEndIdx : maxMonthIdx])}
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5 border border-slate-200/85 dark:border-slate-800/85 rounded-xl p-3 bg-white/50 dark:bg-slate-950/35">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-12 gap-3 items-center py-2">
              <div className="col-span-3">
                <Skeleton height={18} />
              </div>
              <div className="col-span-4">
                <Skeleton height={18} />
              </div>
              <div className="col-span-2">
                <Skeleton height={18} />
              </div>
              <div className="col-span-3">
                <Skeleton height={18} />
              </div>
            </div>
          ))}
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/25 space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {allRows.length === 0 ? t('emptyNoRecords') : t('emptyNoMatches')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {allRows.length === 0 ? t('emptyNoRecordsHint') : t('emptyNoMatchesHint')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {allRows.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setSearch('');
                  setMonthRangeActive(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap transition-colors"
              >
                {tCommon('resetFilters')}
              </button>
            ) : (
              onNavigate && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('monthly-contribution')}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all"
                  >
                    <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('submitMonthlyContribution')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('quard-hasan')}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <HandCoins className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('viewQardHasanLoans')}</span>
                  </button>
                </>
              )
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="lg:hidden space-y-2">
            {displayedRows.map((row) => {
              const isExpanded = expandedId === row.id;
              const txNo = row.decryptedReference || row.maskedReference;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/75 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    aria-expanded={isExpanded}
                    className="w-full p-3 flex items-start justify-between gap-2.5 text-left cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                          row.category === 'contribution'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                            : row.category === 'loan_disbursement'
                              ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60 text-teal-700 dark:text-teal-400'
                              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {row.category === 'contribution' ? (
                          <CreditCard className="w-4 h-4" aria-hidden="true" />
                        ) : row.category === 'loan_disbursement' ? (
                          <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <HandCoins className="w-4 h-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {row.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {row.channelLabel} · {row.providerName} · Tx #{txNo}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                          {row.displayDate}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          row.status === 'rejected' || row.status === 'overdue'
                            ? 'text-rose-700 dark:text-rose-400'
                            : row.status === 'scheduled'
                              ? 'text-slate-600 dark:text-slate-300'
                              : row.category === 'loan_disbursement'
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {row.category === 'loan_disbursement' ? '−' : ''}
                        {formatMoney(row.amount, ccy)}
                      </span>
                      <div className="flex items-center gap-1">
                        <StatusText status={row.status} />
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/50 space-y-2 text-xs">
                      <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {onViewMemberProfile && (
                          <div className="font-sans">
                            <span className="text-slate-400">{t('member')}: </span>
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(row.memberId)}
                              className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline cursor-pointer"
                            >
                              {row.memberName} ({row.memberCode})
                            </button>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">
                            {row.category === 'loan_disbursement' ? `${t('payoutAccountLabel')} ` : `${t('senderAccountLabel')} `}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200">
                            {row.decryptedSenderAccount || t('encryptedNotSubmitted')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">
                            {row.category === 'loan_disbursement' ? `${t('disbursedByLabel')} ` : `${t('verifiedByLabel')} `}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200">
                            {row.reviewerOrVerifier || tCommon('pending')}
                          </span>
                        </div>
                        {(row.decryptedNotes || row.reviewNote) && (
                          <div className="font-sans">
                            <span className="text-slate-400">{t('noteLabel')} </span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {row.reviewNote || row.decryptedNotes}
                            </span>
                          </div>
                        )}
                        {row.entryHash && (
                          <div>
                            <span className="text-slate-400">{t('entryHashLabel')} </span>
                            <span className="text-slate-800 dark:text-slate-200">{shortHash(row.entryHash)}</span>
                          </div>
                        )}
                      </div>
                      {onNavigate && row.category === 'loan_repayment' && row.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => onNavigate('quard-hasan')}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all"
                        >
                          <span>{t('submitRepayment')}</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto border border-slate-200/85 dark:border-slate-800/85 rounded-xl bg-white/55 dark:bg-slate-950/35">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">{t('colDatePeriod')}</th>
                  <th className="py-2.5 px-4">{t('colTransaction')}</th>
                  <th className="py-2.5 px-4">{t('colBankTx')}</th>
                  <th className="py-2.5 px-4">{t('status')}</th>
                  <th className="py-2.5 px-4 text-right">{t('amount')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colDetails')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedRows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <FragmentRow
                      key={row.id}
                      row={row}
                      currency={ccy}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : row.id)}
                      onNavigate={onNavigate}
                      onViewMemberProfile={onViewMemberProfile}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {compact && filteredRows.length > displayedRows.length && onNavigate && (
        <div className="flex items-center justify-between pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            {t('showingCountOf', { shown: displayedRows.length, total: filteredRows.length })}
          </span>
          <button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{t('inspectAllCount', { total: filteredRows.length })}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </motion.section>
  );
}

function FragmentRow({
  row,
  currency,
  isExpanded,
  onToggle,
  onNavigate,
  onViewMemberProfile,
}: {
  row: LedgerRow;
  currency: FundConfig['currency'];
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate?: (tab: TransactionTabTarget) => void;
  onViewMemberProfile?: (memberId: string) => void;
}) {
  const t = useTranslations('Transactions');
  const tCommon = useTranslations('Common');
  const txNo = row.decryptedReference || row.maskedReference;
  return (
    <>
      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className="font-mono text-slate-900 dark:text-white font-medium">
            {row.periodLabel}
          </div>
          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {row.displayDate}
          </div>
        </td>

        <td className="py-3 px-4 align-top min-w-[200px]">
          <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
            {row.category === 'contribution' ? (
              <CreditCard className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : row.category === 'loan_disbursement' ? (
              <ArrowDownRight className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden="true" />
            ) : (
              <HandCoins className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
            )}
            <span>{row.title}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
            {row.directionLabel} ·{' '}
            {onViewMemberProfile ? (
              <button
                type="button"
                onClick={() => onViewMemberProfile(row.memberId)}
                className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
              >
                {row.subtitle}
              </button>
            ) : (
              row.subtitle
            )}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className="text-slate-800 dark:text-slate-200 font-medium">
            {row.channelLabel} · {row.providerName}
          </div>
          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Tx #{txNo}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <StatusText status={row.status} />
        </td>

        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
          <div
            className={`font-mono font-semibold tabular-nums ${
              row.status === 'rejected' || row.status === 'overdue'
                ? 'text-rose-700 dark:text-rose-400'
                : row.status === 'scheduled'
                  ? 'text-slate-600 dark:text-slate-300'
                  : row.category === 'loan_disbursement'
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {row.category === 'loan_disbursement' ? '−' : ''}
            {formatMoney(row.amount, currency)}
          </div>
          {row.category === 'loan_repayment' && row.loanRemainingBalance !== undefined && (
            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t('balPrefix', { amount: formatMoney(row.loanRemainingBalance, currency) })}
            </div>
          )}
        </td>

        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>{isExpanded ? tCommon('hide') : t('inspect')}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50/80 dark:bg-slate-950/60">
          <td colSpan={6} className="px-4 py-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-400 dark:text-slate-500">
                    {row.category === 'loan_disbursement' ? `${t('payoutAccountLabel')} ` : `${t('senderAccountLabel')} `}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {row.decryptedSenderAccount || t('encryptedNotSubmitted')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">{t('txNumberLabel')} </span>
                  <span className="text-slate-800 dark:text-slate-200">{txNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">
                    {row.category === 'loan_disbursement' ? `${t('disbursedByLabel')} ` : `${t('verifiedByLabel')} `}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {row.reviewerOrVerifier || tCommon('pending')}
                  </span>
                </div>
                {row.decryptedNotes && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 dark:text-slate-500">{t('noteLabel')} </span>
                    <span className="text-slate-800 dark:text-slate-200">{row.decryptedNotes}</span>
                  </div>
                )}
                {row.reviewNote && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 dark:text-slate-500">{t('reviewNoteLabel')} </span>
                    <span className="text-slate-800 dark:text-slate-200">{row.reviewNote}</span>
                  </div>
                )}
                {row.entryHash && (
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">{t('entryHashLabel')} </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {shortHash(row.entryHash)}
                    </span>
                  </div>
                )}
                {row.batchGroupId && (
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">{t('advanceBatchLabel')} </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {row.batchGroupId}
                    </span>
                  </div>
                )}
              </div>

              {onNavigate && row.category === 'loan_repayment' && row.status === 'scheduled' && (
                <button
                  type="button"
                  onClick={() => onNavigate('quard-hasan')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all"
                >
                  <span>{t('submitRepayment')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
