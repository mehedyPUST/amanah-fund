'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  FileDown,
  HandCoins,
  History,
  Search,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { downloadContributionAndLoanPdfStatement } from '../utils/pdfStatement.ts';
import {
  formatBillingMonth,
  formatDateTime,
  formatMoney,
  formatShortDate,
  shortHash,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

export type TransactionTabTarget =
  | 'overview'
  | 'contributions'
  | 'loans'
  | 'voting'
  | 'halal'
  | 'members'
  | 'notifications'
  | 'transactions'
  | 'profile'
  | 'admin';

interface TransactionHistoryProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  compact?: boolean;
  onNavigate?: (tab: TransactionTabTarget) => void;
}

type TransactionCategory = 'contribution' | 'loan_repayment';
type TypeFilter = 'all' | 'contribution' | 'loan_repayment';
type StatusFilter = 'all' | 'completed' | 'pending' | 'scheduled' | 'attention';

interface LedgerRow {
  id: string;
  category: TransactionCategory;
  memberId: string;
  memberName: string;
  memberCode: string;
  sortDate: string;
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
}

function escapeCsvCell(value: string | number | undefined): string {
  const str = value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function TransactionHistory({
  contributions,
  loans,
  config,
  user,
  loading,
  compact = false,
  onNavigate,
}: TransactionHistoryProps) {
  const ccy = config?.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const effectiveScope = !compact && isStaff ? scope : 'mine';

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
        displayDate: formatDateTime(c.submittedAt),
        periodLabel: formatBillingMonth(c.billingMonth),
        title: `Monthly Contribution · ${formatBillingMonth(c.billingMonth)}`,
        subtitle:
          effectiveScope === 'all'
            ? `${c.memberName} (${c.memberCode})`
            : 'Cooperative central fund deposit',
        channelLabel: c.channel.toUpperCase(),
        providerName: c.providerName,
        maskedReference: c.maskedReference,
        status: c.status,
        statusBucket,
        amount: c.amount,
        directionLabel: 'Contribution',
        decryptedReference: c.decryptedDetails?.referenceId,
        decryptedSenderAccount: c.decryptedDetails?.senderAccount,
        decryptedNotes: c.decryptedDetails?.notes,
        reviewerOrVerifier: c.reviewerName,
        reviewNote: c.reviewNote,
        entryHash: c.entryHash,
      });
    });

    const scopedActiveLoans = loans.filter(
      (l) =>
        l.status === 'active' &&
        (effectiveScope === 'mine' ? l.borrowerId === user.id : true)
    );

    scopedActiveLoans.forEach((loan) => {
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
            : `Due ${formatShortDate(inst.dueDate)}`;

        rows.push({
          id: `tx-repay-${loan.id}-${inst.installmentNumber}`,
          category: 'loan_repayment',
          memberId: loan.borrowerId,
          memberName: loan.borrowerName,
          memberCode: loan.borrowerCode,
          sortDate: eventIso,
          displayDate,
          periodLabel: `Due ${formatShortDate(inst.dueDate)}`,
          title: `Loan Repayment #${inst.installmentNumber}/${loan.installmentMonths}`,
          subtitle:
            effectiveScope === 'all'
              ? `${loan.borrowerName} · ${loan.id} · ${loan.purpose}`
              : `${loan.id} · ${loan.purpose}`,
          channelLabel: inst.repaymentChannel ? inst.repaymentChannel.toUpperCase() : 'SCHEDULE',
          providerName: inst.repaymentProvider || 'Installment Plan',
          maskedReference: inst.maskedReference || '—',
          status: inst.status,
          statusBucket,
          amount: inst.status === 'paid' ? inst.paidAmount : inst.amount,
          directionLabel: 'Repayment',
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
  }, [contributions, loans, effectiveScope, user.id]);

  const counts = useMemo(() => {
    const contribCount = allRows.filter((r) => r.category === 'contribution').length;
    const repayCount = allRows.filter((r) => r.category === 'loan_repayment').length;

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
      approvedContribTotal,
      paidRepayCount: paidRepayRows.length,
      paidRepayTotal,
      pendingCount,
      activeLoanRemaining,
    };
  }, [allRows, activeLoans]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (typeFilter !== 'all' && row.category !== typeFilter) return false;
      if (statusFilter !== 'all' && row.statusBucket !== statusFilter) return false;
      if (q) {
        return (
          row.title.toLowerCase().includes(q) ||
          row.subtitle.toLowerCase().includes(q) ||
          row.providerName.toLowerCase().includes(q) ||
          row.maskedReference.toLowerCase().includes(q) ||
          row.periodLabel.toLowerCase().includes(q) ||
          row.memberName.toLowerCase().includes(q) ||
          (row.loanId || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allRows, typeFilter, statusFilter, search]);

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
      'Provider',
      'Reference',
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
    });
  }

  return (
    <section
      aria-label="Member Transaction History"
      className="bg-gradient-to-br from-white via-white to-violet-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/15 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <History className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>General Treasury Ledger</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Transaction History · Contributions & Active Loan Repayments
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {effectiveScope === 'mine'
              ? `Unified record of ${user.name}'s (${user.memberCode}) monthly Bank/MFS contributions and active Qard Hasan repayments`
              : 'Cooperative-wide view of member monthly contributions and active Qard Hasan loan repayments'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!compact && isStaff && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scope === 'mine'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                My Transactions
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Members
              </button>
            </div>
          )}

          {!compact && filteredRows.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all duration-200"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          )}

          {!loading && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF Statement</span>
            </button>
          )}

          {compact && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="group px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all duration-200"
            >
              <span>Full General Ledger</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Summary Strip (Single Elevation, Hairline Dividers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-3.5 border-y border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Approved Contributions
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(counts.approvedContribTotal, ccy)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {counts.contribCount} submission{counts.contribCount === 1 ? '' : 's'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Active Loan Repayments Paid
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(counts.paidRepayTotal, ccy)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {counts.paidRepayCount} verified · {activeLoans.length} active loan
            {activeLoans.length === 1 ? '' : 's'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Active Loan Remaining
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(counts.activeLoanRemaining, ccy)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {activeLoans.length > 0 ? '0% Qard Hasan principal' : 'No active loan balance'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Pending Review
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {counts.pendingCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Awaiting manager reconciliation
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `All (${counts.total})` },
                { id: 'contribution', label: `Contributions (${counts.contribCount})` },
                { id: 'loan_repayment', label: `Loan Repayments (${counts.repayCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  typeFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter transactions by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Approved / Paid</option>
            <option value="pending">Pending Verification</option>
            <option value="scheduled">Scheduled Installments</option>
            <option value="attention">Rejected / Overdue</option>
          </select>
        </div>

        <div className="relative w-full lg:w-72">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search month, provider, loan ID, ref…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          />
        </div>
      </div>

      {/* Data Table / Empty / Loading States */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {allRows.length === 0
              ? 'No monthly contributions or active loan repayments recorded yet.'
              : 'No transactions match your current filter or search query.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {allRows.length === 0
              ? 'Once you submit a monthly Bank/MFS contribution or have an active Qard Hasan repayment schedule, each transaction will appear here.'
              : 'Try clearing the search box or switching the type and status filters.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {allRows.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setSearch('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                Reset Filters
              </button>
            ) : (
              onNavigate && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('contributions')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Submit Monthly Contribution</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('loans')}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <HandCoins className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View Qard Hasan Loans</span>
                  </button>
                </>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Date & Period</th>
                <th className="py-2.5 px-4 font-medium">Transaction</th>
                <th className="py-2.5 px-4 font-medium">Channel & Reference</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                <th className="py-2.5 px-4 font-medium text-right">Details</th>
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
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {compact && filteredRows.length > displayedRows.length && onNavigate && (
        <div className="flex items-center justify-between pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Showing {displayedRows.length} of {filteredRows.length} transactions
          </span>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Inspect all {filteredRows.length} transactions</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

function FragmentRow({
  row,
  currency,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  row: LedgerRow;
  currency: FundConfig['currency'];
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate?: (tab: TransactionTabTarget) => void;
}) {
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
            ) : (
              <HandCoins className="w-3.5 h-3.5 text-violet-600 shrink-0" aria-hidden="true" />
            )}
            <span>{row.title}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
            {row.directionLabel} · {row.subtitle}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className="text-slate-800 dark:text-slate-200 font-medium">
            {row.channelLabel} · {row.providerName}
          </div>
          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Ref {row.maskedReference}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <StatusText status={row.status} />
        </td>

        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
          <div
            className={`font-mono font-semibold tabular-nums ${
              row.status === 'rejected' || row.status === 'overdue'
                ? 'text-red-700 dark:text-red-400'
                : row.status === 'scheduled'
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatMoney(row.amount, currency)}
          </div>
          {row.category === 'loan_repayment' && row.loanRemainingBalance !== undefined && (
            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Bal {formatMoney(row.loanRemainingBalance, currency)}
            </div>
          )}
        </td>

        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
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
                  <span className="text-slate-400 dark:text-slate-500">Sender Account: </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {row.decryptedSenderAccount || 'Encrypted / Not yet submitted'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Reference / TrxID: </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {row.decryptedReference || row.maskedReference}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Verified By: </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {row.reviewerOrVerifier || 'Pending'}
                  </span>
                </div>
                {row.decryptedNotes && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 dark:text-slate-500">Note: </span>
                    <span className="text-slate-800 dark:text-slate-200">{row.decryptedNotes}</span>
                  </div>
                )}
                {row.reviewNote && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 dark:text-slate-500">Review Note: </span>
                    <span className="text-slate-800 dark:text-slate-200">{row.reviewNote}</span>
                  </div>
                )}
                {row.entryHash && (
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">Entry Hash: </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {shortHash(row.entryHash)}
                    </span>
                  </div>
                )}
              </div>

              {onNavigate && row.category === 'loan_repayment' && row.status === 'scheduled' && (
                <button
                  type="button"
                  onClick={() => onNavigate('loans')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
                >
                  <span>Submit Repayment</span>
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
