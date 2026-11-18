'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  LayoutGrid,
  Phone,
  Printer,
  RefreshCw,
  Rows3,
  Search,
  ShieldAlert,
  Sigma,
  Table2,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { queryKeys } from '../lib/queryKeys.ts';
import type {
  FundConfig,
  MonthlySheetData,
  MonthlySheetMemberRow,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney } from '../utils/format.ts';
import { exportBalanceSheetPdf } from '../utils/monthlySheetPdf.ts';
import { BalanceSheetMemberModal } from './BalanceSheetMemberModal.tsx';

interface BalanceSheetViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
  onViewMemberProfile?: (userId: string) => void;
}

type SheetFilter = 'all' | 'paid' | 'due' | 'qard_hasan';
type WorkbookTab = 'balance-sheet' | 'variables-summary';
type SheetDensity = 'compact' | 'standard';
type SortField =
  | 'serialNo'
  | 'name'
  | 'memberCode'
  | 'mobile'
  | 'prevContrib'
  | 'prevQard'
  | 'prevDue'
  | 'currContrib'
  | 'currQard'
  | 'currRefund'
  | 'closingContrib'
  | 'closingQard'
  | 'closingDue'
  | 'netEquity'
  | 'status';
type SortDirection = 'asc' | 'desc';

interface SelectedCell {
  tab: WorkbookTab;
  row: number; // 0-based index in data rows; -1 for totals row; -2 for filtered subtotal
  col: number; // 0-based column index (A=0, B=1, ...)
}

interface VariableSummaryRow {
  id: string;
  group: string;
  variable: string;
  basis: string;
  prevValue: string;
  currValue: string;
  closingValue: string;
  formula: string;
  highlight?: 'emerald' | 'amber' | 'rose' | 'neutral';
}

const SHEET_COL_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
] as const;

const SUMMARY_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(ym: string, deltaMonths: number): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return getCurrentMonthKey();
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const shifted = new Date(Date.UTC(year, monthIdx + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLong(ym: string): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatMonthShort(ym: string): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function getNetEquity(row: MonthlySheetMemberRow): number {
  return round2(row.thisMonthSummary.contributionAmount - row.thisMonthSummary.dueHasanaAmount);
}

function statusSortRank(status: MonthlySheetMemberRow['contributionStatus']): number {
  switch (status) {
    case 'paid':
      return 0;
    case 'partial':
      return 1;
    case 'pending':
      return 2;
    default:
      return 3;
  }
}

export function BalanceSheetView({
  user,
  config,
  onViewMemberProfile,
}: BalanceSheetViewProps) {
  const t = useTranslations('MonthlySheet');
  const tCommon = useTranslations('Common');
  const queryClient = useQueryClient();

  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [activeTab, setActiveTab] = useState<WorkbookTab>('balance-sheet');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SheetFilter>('all');
  const [freezeIdentityCols, setFreezeIdentityCols] = useState(true);
  const [density, setDensity] = useState<SheetDensity>('compact');
  const [mobileViewMode, setMobileViewMode] = useState<'sheet' | 'cards'>('sheet');
  const [sortField, setSortField] = useState<SortField>('serialNo');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selectedCell, setSelectedCell] = useState<SelectedCell>({
    tab: 'balance-sheet',
    row: 0,
    col: 0,
  });
  const [copiedCell, setCopiedCell] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [inspectedMemberId, setInspectedMemberId] = useState<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  const sheetQuery = useQuery({
    queryKey: queryKeys.dashboard.balanceSheet(selectedMonth),
    queryFn: async (): Promise<MonthlySheetData> => {
      const res = await api.getBalanceSheet(selectedMonth);
      return res.sheet;
    },
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleRefresh = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.balanceSheet(selectedMonth),
      });
    };
    window.addEventListener('amanah:refresh', handleRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleRefresh);
    };
  }, [queryClient, selectedMonth]);

  const sheet = sheetQuery.data ?? null;
  const isInitialLoading = sheetQuery.isPending && !sheet;
  const isRefetching = sheetQuery.isFetching;
  const errorMessage =
    sheetQuery.error instanceof Error
      ? sheetQuery.error.message
      : sheetQuery.isError
        ? t('loadFailed')
        : null;

  const ccy = sheet?.currency || config?.currency || 'BDT';
  const fundName = config?.fundName || 'Amanah Cooperative Treasury';

  const activeMonth = sheet?.month || selectedMonth;
  const prevMonthKey = sheet?.previousMonth || shiftMonthKey(selectedMonth, -1);
  const nextMonthKey = sheet?.nextMonth || shiftMonthKey(selectedMonth, 1);

  const fullMonthLabel = useMemo(() => formatMonthLong(selectedMonth), [selectedMonth]);
  const shortMonthLabel = useMemo(() => formatMonthShort(selectedMonth), [selectedMonth]);
  const prevMonthLabel = useMemo(() => formatMonthShort(prevMonthKey), [prevMonthKey]);
  const nextMonthLabel = useMemo(() => formatMonthShort(nextMonthKey), [nextMonthKey]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>(sheet?.availableMonths || []);
    set.add(selectedMonth);
    set.add(currentMonthKey);
    set.add(shiftMonthKey(currentMonthKey, 1));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [sheet?.availableMonths, selectedMonth, currentMonthKey]);

  const rows = useMemo(() => sheet?.rows || [], [sheet?.rows]);

  const filterCounts = useMemo(() => {
    let paid = 0;
    let partial = 0;
    let pending = 0;
    let unpaid = 0;
    let qardHasan = 0;
    let pendingContributionTotal = 0;
    let installmentDueTotal = 0;
    let totalMemberNetEquity = 0;

    for (const r of rows) {
      if (r.contributionStatus === 'paid') {
        paid += 1;
      } else {
        unpaid += 1;
        if (r.contributionStatus === 'partial') partial += 1;
        else if (r.contributionStatus === 'pending') pending += 1;
      }
      if (r.hasQardHasan || r.thisMonthSummary.qardHasanAmount > 0 || r.thisMonth.repaidAmount > 0) {
        qardHasan += 1;
      }
      pendingContributionTotal += r.contributionPendingAmount || 0;
      installmentDueTotal += r.installmentDueThisMonth || 0;
      totalMemberNetEquity += getNetEquity(r);
    }

    return {
      all: rows.length,
      paid,
      partial,
      pending,
      due: unpaid,
      strictlyUnpaid: Math.max(0, unpaid - partial - pending),
      qardHasan,
      pendingContributionTotal: round2(pendingContributionTotal),
      installmentDueTotal: round2(installmentDueTotal),
      totalMemberNetEquity: round2(totalMemberNetEquity),
    };
  }, [rows]);

  const monthlyTarget = sheet?.monthlyTarget || config?.monthlyContributionAmount || 0;
  const expectedCollection = useMemo(
    () => round2(rows.length * monthlyTarget),
    [rows.length, monthlyTarget]
  );

  const collectionRatePct = useMemo(() => {
    if (!sheet || expectedCollection <= 0) return 0;
    return Math.min(
      100,
      Math.round((sheet.thisMonthOnly.contributionAmount / expectedCollection) * 100)
    );
  }, [sheet, expectedCollection]);

  const netLiquidFund = useMemo(() => {
    if (!sheet) return 0;
    return Math.max(
      0,
      round2(sheet.fundSummary.fundHeight - sheet.fundSummary.totalDueHasana)
    );
  }, [sheet]);

  const cashFlowMetrics = useMemo(() => {
    if (!sheet) {
      return {
        inflow: 0,
        outflow: 0,
        netCashFlow: 0,
        closingNetEquity: 0,
      };
    }
    const inflow = round2(sheet.thisMonthOnly.contributionAmount + sheet.thisMonthRepaidAmount);
    const outflow = round2(sheet.thisMonthOnly.qardHasanAmount);
    const netCashFlow = round2(inflow - outflow);
    const closingNetEquity = round2(
      sheet.thisMonthSummary.contributionAmount - sheet.thisMonthSummary.dueHasanaAmount
    );
    return { inflow, outflow, netCashFlow, closingNetEquity };
  }, [sheet]);

  const handleToggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir(
          field === 'serialNo' || field === 'name' || field === 'memberCode' || field === 'mobile'
            ? 'asc'
            : 'desc'
        );
      }
    },
    [sortField]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (filter === 'paid' && row.contributionStatus !== 'paid') return false;
      if (filter === 'due' && row.contributionStatus === 'paid') return false;
      if (
        filter === 'qard_hasan' &&
        !row.hasQardHasan &&
        row.thisMonthSummary.qardHasanAmount <= 0 &&
        row.thisMonth.repaidAmount <= 0
      ) {
        return false;
      }
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.memberCode.toLowerCase().includes(q) ||
        row.mobile.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q)
      );
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'memberCode':
          cmp = a.memberCode.localeCompare(b.memberCode);
          break;
        case 'mobile':
          cmp = a.mobile.localeCompare(b.mobile);
          break;
        case 'prevContrib':
          cmp = a.previousSummary.contributionAmount - b.previousSummary.contributionAmount;
          break;
        case 'prevQard':
          cmp = a.previousSummary.qardHasanAmount - b.previousSummary.qardHasanAmount;
          break;
        case 'prevDue':
          cmp = a.previousSummary.dueHasanaAmount - b.previousSummary.dueHasanaAmount;
          break;
        case 'currContrib':
          cmp = a.thisMonth.contributionAmount - b.thisMonth.contributionAmount;
          break;
        case 'currQard':
          cmp = a.thisMonth.qardHasanAmount - b.thisMonth.qardHasanAmount;
          break;
        case 'currRefund':
          cmp = a.thisMonth.repaidAmount - b.thisMonth.repaidAmount;
          break;
        case 'closingContrib':
          cmp = a.thisMonthSummary.contributionAmount - b.thisMonthSummary.contributionAmount;
          break;
        case 'closingQard':
          cmp = a.thisMonthSummary.qardHasanAmount - b.thisMonthSummary.qardHasanAmount;
          break;
        case 'closingDue':
          cmp = a.thisMonthSummary.dueHasanaAmount - b.thisMonthSummary.dueHasanaAmount;
          break;
        case 'netEquity':
          cmp = getNetEquity(a) - getNetEquity(b);
          break;
        case 'status':
          cmp = statusSortRank(a.contributionStatus) - statusSortRank(b.contributionStatus);
          break;
        default:
          cmp = a.serialNo - b.serialNo;
          break;
      }
      if (cmp === 0) cmp = a.serialNo - b.serialNo;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, filter, sortField, sortDir]);

  const isFiltered = filter !== 'all' || search.trim().length > 0;

  const inspectedMemberIndex = useMemo(() => {
    if (!inspectedMemberId) return -1;
    return filteredRows.findIndex((r) => r.userId === inspectedMemberId);
  }, [filteredRows, inspectedMemberId]);

  const inspectedMemberRow = useMemo(() => {
    if (!inspectedMemberId) return null;
    if (inspectedMemberIndex >= 0) return filteredRows[inspectedMemberIndex] ?? null;
    return rows.find((r) => r.userId === inspectedMemberId) ?? null;
  }, [filteredRows, inspectedMemberId, inspectedMemberIndex, rows]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.prevContrib += r.previousSummary.contributionAmount;
        acc.prevQard += r.previousSummary.qardHasanAmount;
        acc.prevDue += r.previousSummary.dueHasanaAmount;
        acc.currContrib += r.thisMonth.contributionAmount;
        acc.currPending += r.contributionPendingAmount || 0;
        acc.currQard += r.thisMonth.qardHasanAmount;
        acc.currRefund += r.thisMonth.repaidAmount;
        acc.closingContrib += r.thisMonthSummary.contributionAmount;
        acc.closingQard += r.thisMonthSummary.qardHasanAmount;
        acc.closingDue += r.thisMonthSummary.dueHasanaAmount;
        acc.netEquity += getNetEquity(r);
        return acc;
      },
      {
        prevContrib: 0,
        prevQard: 0,
        prevDue: 0,
        currContrib: 0,
        currPending: 0,
        currQard: 0,
        currRefund: 0,
        closingContrib: 0,
        closingQard: 0,
        closingDue: 0,
        netEquity: 0,
      }
    );
  }, [filteredRows]);

  const allVariablesRows = useMemo<VariableSummaryRow[]>(() => {
    if (!sheet) return [];
    const lastRowNum = Math.max(2, rows.length + 1);
    const fmt = (v: number) => formatMoney(v, ccy);
    const fmtSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatMoney(Math.abs(v), ccy)}`;

    const contribRolloverOk =
      Math.abs(
        round2(sheet.previousMonthSummary.contributionAmount + sheet.thisMonthOnly.contributionAmount) -
          sheet.thisMonthSummary.contributionAmount
      ) < 0.01;
    const dueRolloverOk =
      Math.abs(
        round2(
          sheet.previousMonthSummary.dueHasanaAmount +
            sheet.thisMonthOnly.qardHasanAmount -
            sheet.thisMonthRepaidAmount
        ) - sheet.thisMonthSummary.dueHasanaAmount
      ) < 0.01;

    return [
      {
        id: 'active-members',
        group: 'Membership & Targets',
        variable: 'Active Contributing Members',
        basis: `=COUNTA('Balance Sheet'!A2:A${lastRowNum})`,
        prevValue: '—',
        currValue: `${rows.length} members`,
        closingValue: `${rows.length} active`,
        formula: `=COUNTA('Balance Sheet'!A2:A${lastRowNum}) → ${rows.length} active contributing members`,
      },
      {
        id: 'monthly-target',
        group: 'Membership & Targets',
        variable: 'Monthly Contribution Target (Per Member)',
        basis: 'FundConfig.monthlyContributionAmount',
        prevValue: fmt(monthlyTarget),
        currValue: fmt(monthlyTarget),
        closingValue: fmt(monthlyTarget),
        formula: `=CONFIG("monthlyContributionAmount") → ${fmt(monthlyTarget)} per member`,
      },
      {
        id: 'expected-collection',
        group: 'Membership & Targets',
        variable: 'Expected Current Month Collection',
        basis: '=ActiveMembers * MonthlyTarget',
        prevValue: '—',
        currValue: fmt(expectedCollection),
        closingValue: fmt(expectedCollection),
        formula: `=${rows.length} * ${fmt(monthlyTarget)} = ${fmt(expectedCollection)}`,
      },
      {
        id: 'payment-breakdown',
        group: 'Membership & Targets',
        variable: 'Member Contribution Status Split',
        basis: `=COUNTIF('Balance Sheet'!N2:N${lastRowNum}, Status)`,
        prevValue: '—',
        currValue: `${filterCounts.paid} Paid · ${filterCounts.partial} Partial · ${filterCounts.pending} Pending · ${filterCounts.strictlyUnpaid} Due`,
        closingValue: `${collectionRatePct}% cleared`,
        formula: `=ROUND(${fmt(sheet.thisMonthOnly.contributionAmount)} / ${fmt(expectedCollection)} * 100) → ${collectionRatePct}%`,
        highlight: collectionRatePct >= 80 ? 'emerald' : 'amber',
      },
      {
        id: 'prev-cumul-contrib',
        group: 'Contributions Ledger',
        variable: 'Previous Months Cumulative Contribution',
        basis: `=SUM('Balance Sheet'!D2:D${lastRowNum}) (< ${activeMonth})`,
        prevValue: fmt(sheet.previousMonthSummary.contributionAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.contributionAmount),
        formula: `=SUM(Approved Contributions before ${activeMonth}) → ${fmt(sheet.previousMonthSummary.contributionAmount)}`,
      },
      {
        id: 'curr-contrib',
        group: 'Contributions Ledger',
        variable: `Current Month Approved Contribution (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!G2:G${lastRowNum})`,
        prevValue: '—',
        currValue: `+${fmt(sheet.thisMonthOnly.contributionAmount)}`,
        closingValue: fmt(sheet.thisMonthOnly.contributionAmount),
        formula: `=SUM('Balance Sheet'!G2:G${lastRowNum}) → ${fmt(sheet.thisMonthOnly.contributionAmount)} verified in ${shortMonthLabel}`,
        highlight: 'emerald',
      },
      {
        id: 'curr-pending-contrib',
        group: 'Contributions Ledger',
        variable: 'Current Month Pending Contributions (Unverified)',
        basis: `=SUM(Pending Receipts in ${activeMonth})`,
        prevValue: '—',
        currValue: filterCounts.pendingContributionTotal > 0 ? fmt(filterCounts.pendingContributionTotal) : '—',
        closingValue: filterCounts.pendingContributionTotal > 0 ? `${fmt(filterCounts.pendingContributionTotal)} pending` : fmt(0),
        formula: `=SUMIFS(Contributions, Month="${activeMonth}", Status="pending") → ${fmt(filterCounts.pendingContributionTotal)}`,
        highlight: filterCounts.pendingContributionTotal > 0 ? 'amber' : 'neutral',
      },
      {
        id: 'closing-cumul-contrib',
        group: 'Contributions Ledger',
        variable: `Closing Cumulative Contribution (Rolls to ${nextMonthLabel})`,
        basis: `=PrevCumulContrib + CurrMonthContrib`,
        prevValue: fmt(sheet.previousMonthSummary.contributionAmount),
        currValue: `+${fmt(sheet.thisMonthOnly.contributionAmount)}`,
        closingValue: fmt(sheet.thisMonthSummary.contributionAmount),
        formula: `=${fmt(sheet.previousMonthSummary.contributionAmount)} + ${fmt(sheet.thisMonthOnly.contributionAmount)} = ${fmt(sheet.thisMonthSummary.contributionAmount)}`,
        highlight: 'emerald',
      },
      {
        id: 'prev-cumul-qard',
        group: 'Qard Hasan & Refunds',
        variable: 'Previous Month Cumulative Qard Hasan Issued',
        basis: `=SUM('Balance Sheet'!E2:E${lastRowNum}) (< ${activeMonth})`,
        prevValue: fmt(sheet.previousMonthSummary.qardHasanAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.qardHasanAmount),
        formula: `=SUM(Disbursed Qard Hasan before ${activeMonth}) → ${fmt(sheet.previousMonthSummary.qardHasanAmount)}`,
      },
      {
        id: 'prev-qard-due',
        group: 'Qard Hasan & Refunds',
        variable: 'Previous Month Opening Qard Hasan Due',
        basis: `=SUM('Balance Sheet'!F2:F${lastRowNum})`,
        prevValue: fmt(sheet.previousMonthSummary.dueHasanaAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.dueHasanaAmount),
        formula: `=Opening Qard Due carried forward from ${prevMonthLabel} → ${fmt(sheet.previousMonthSummary.dueHasanaAmount)}`,
      },
      {
        id: 'curr-qard-drawn',
        group: 'Qard Hasan & Refunds',
        variable: `Current Month New Qard Hasan Drawn (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!H2:H${lastRowNum})`,
        prevValue: '—',
        currValue:
          sheet.thisMonthOnly.qardHasanAmount > 0
            ? `+${fmt(sheet.thisMonthOnly.qardHasanAmount)}`
            : fmt(0),
        closingValue: fmt(sheet.thisMonthOnly.qardHasanAmount),
        formula: `=SUM('Balance Sheet'!H2:H${lastRowNum}) → ${fmt(sheet.thisMonthOnly.qardHasanAmount)} disbursed in ${shortMonthLabel}`,
        highlight: sheet.thisMonthOnly.qardHasanAmount > 0 ? 'amber' : 'neutral',
      },
      {
        id: 'curr-refund-qard',
        group: 'Qard Hasan & Refunds',
        variable: `Current Month Refund Qard Hasan (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!I2:I${lastRowNum})`,
        prevValue: '—',
        currValue:
          sheet.thisMonthRepaidAmount > 0 ? `+${fmt(sheet.thisMonthRepaidAmount)}` : fmt(0),
        closingValue: fmt(sheet.thisMonthRepaidAmount),
        formula: `=SUM('Balance Sheet'!I2:I${lastRowNum}) → ${fmt(sheet.thisMonthRepaidAmount)} Qard Hasan refunded in ${shortMonthLabel}`,
        highlight: 'emerald',
      },
      {
        id: 'curr-due-delta',
        group: 'Qard Hasan & Refunds',
        variable: 'Current Month Net Qard Due Change (Δ)',
        basis: '=CurrQardDrawn − CurrRefundQardHasan',
        prevValue: '—',
        currValue: fmtSigned(sheet.thisMonthOnly.dueHasanaAmount),
        closingValue: fmtSigned(sheet.thisMonthOnly.dueHasanaAmount),
        formula: `=${fmt(sheet.thisMonthOnly.qardHasanAmount)} − ${fmt(sheet.thisMonthRepaidAmount)} = ${fmtSigned(sheet.thisMonthOnly.dueHasanaAmount)}`,
        highlight: sheet.thisMonthOnly.dueHasanaAmount <= 0 ? 'emerald' : 'amber',
      },
      {
        id: 'closing-cumul-qard',
        group: 'Qard Hasan & Refunds',
        variable: 'Closing Cumulative Qard Hasan Issued',
        basis: '=PrevCumulQard + CurrQardDrawn',
        prevValue: fmt(sheet.previousMonthSummary.qardHasanAmount),
        currValue: `+${fmt(sheet.thisMonthOnly.qardHasanAmount)}`,
        closingValue: fmt(sheet.thisMonthSummary.qardHasanAmount),
        formula: `=${fmt(sheet.previousMonthSummary.qardHasanAmount)} + ${fmt(sheet.thisMonthOnly.qardHasanAmount)} = ${fmt(sheet.thisMonthSummary.qardHasanAmount)}`,
      },
      {
        id: 'closing-qard-due',
        group: 'Qard Hasan & Refunds',
        variable: `Closing Outstanding Qard Hasan Due (Rolls to ${nextMonthLabel})`,
        basis: '=OpeningDue + CurrQardDrawn − CurrRefundQard',
        prevValue: fmt(sheet.previousMonthSummary.dueHasanaAmount),
        currValue: fmtSigned(sheet.thisMonthOnly.dueHasanaAmount),
        closingValue: fmt(sheet.thisMonthSummary.dueHasanaAmount),
        formula: `=${fmt(sheet.previousMonthSummary.dueHasanaAmount)} + ${fmt(sheet.thisMonthOnly.qardHasanAmount)} − ${fmt(sheet.thisMonthRepaidAmount)} = ${fmt(sheet.thisMonthSummary.dueHasanaAmount)}`,
        highlight: sheet.thisMonthSummary.dueHasanaAmount > 0 ? 'amber' : 'emerald',
      },
      {
        id: 'installment-due-now',
        group: 'Qard Hasan & Refunds',
        variable: 'Scheduled Installments Still Unpaid Through Month',
        basis: `=SUM(InstallmentDue <= ${activeMonth})`,
        prevValue: '—',
        currValue: filterCounts.installmentDueTotal > 0 ? fmt(filterCounts.installmentDueTotal) : fmt(0),
        closingValue: fmt(filterCounts.installmentDueTotal),
        formula: `=SUM(Unpaid Loan Installments due on or before ${activeMonth}) → ${fmt(filterCounts.installmentDueTotal)}`,
        highlight: filterCounts.installmentDueTotal > 0 ? 'rose' : 'neutral',
      },
      {
        id: 'curr-cash-inflow',
        group: 'Cash Flow & Treasury',
        variable: 'Current Month Total Cash Inflow',
        basis: '=CurrContribution + CurrRefundQardHasan',
        prevValue: '—',
        currValue: `+${fmt(cashFlowMetrics.inflow)}`,
        closingValue: fmt(cashFlowMetrics.inflow),
        formula: `=${fmt(sheet.thisMonthOnly.contributionAmount)} + ${fmt(sheet.thisMonthRepaidAmount)} = ${fmt(cashFlowMetrics.inflow)}`,
        highlight: 'emerald',
      },
      {
        id: 'curr-cash-outflow',
        group: 'Cash Flow & Treasury',
        variable: 'Current Month Total Cash Outflow (Disbursements)',
        basis: '=CurrQardHasanDrawn',
        prevValue: '—',
        currValue: cashFlowMetrics.outflow > 0 ? `−${fmt(cashFlowMetrics.outflow)}` : fmt(0),
        closingValue: fmt(cashFlowMetrics.outflow),
        formula: `=SUM('Balance Sheet'!H2:H${lastRowNum}) → ${fmt(cashFlowMetrics.outflow)}`,
      },
      {
        id: 'curr-net-cashflow',
        group: 'Cash Flow & Treasury',
        variable: `Current Month Net Cash Flow (${shortMonthLabel})`,
        basis: '=TotalCashInflow − TotalCashOutflow',
        prevValue: '—',
        currValue: fmtSigned(cashFlowMetrics.netCashFlow),
        closingValue: fmtSigned(cashFlowMetrics.netCashFlow),
        formula: `=${fmt(cashFlowMetrics.inflow)} − ${fmt(cashFlowMetrics.outflow)} = ${fmtSigned(cashFlowMetrics.netCashFlow)}`,
        highlight: cashFlowMetrics.netCashFlow >= 0 ? 'emerald' : 'rose',
      },
      {
        id: 'closing-net-equity',
        group: 'Cash Flow & Treasury',
        variable: 'Closing Cooperative Net Equity (Savings − Qard Due)',
        basis: '=ClosingCumulContrib − ClosingQardDue',
        prevValue: fmt(
          round2(
            sheet.previousMonthSummary.contributionAmount -
              sheet.previousMonthSummary.dueHasanaAmount
          )
        ),
        currValue: fmtSigned(cashFlowMetrics.netCashFlow),
        closingValue: fmt(cashFlowMetrics.closingNetEquity),
        formula: `=${fmt(sheet.thisMonthSummary.contributionAmount)} − ${fmt(sheet.thisMonthSummary.dueHasanaAmount)} = ${fmt(cashFlowMetrics.closingNetEquity)}`,
        highlight: 'emerald',
      },
      {
        id: 'all-time-fund-height',
        group: 'Cash Flow & Treasury',
        variable: 'All-Time Cooperative Fund Height',
        basis: '=SUM(All Verified Member Contributions)',
        prevValue: '—',
        currValue: '—',
        closingValue: fmt(sheet.fundSummary.fundHeight),
        formula: `=ALL_TIME_CONTRIBUTIONS() → ${fmt(sheet.fundSummary.fundHeight)} (Total Qard Issued: ${fmt(sheet.fundSummary.totalQardHasan)})`,
      },
      {
        id: 'available-liquid-treasury',
        group: 'Cash Flow & Treasury',
        variable: 'Available Liquid Treasury Balance',
        basis: '=AllTimeFundHeight − ActiveOutstandingDue',
        prevValue: '—',
        currValue: '—',
        closingValue: fmt(netLiquidFund),
        formula: `=${fmt(sheet.fundSummary.fundHeight)} − ${fmt(sheet.fundSummary.totalDueHasana)} = ${fmt(netLiquidFund)}`,
        highlight: 'emerald',
      },
      {
        id: 'reconciliation-audit',
        group: 'Audit Integrity Check',
        variable: 'Double-Entry Rollover Verification',
        basis: '=AND(PrevContrib+Curr=Close, PrevDue+Drawn-Refund=CloseDue)',
        prevValue: prevMonthLabel,
        currValue: shortMonthLabel,
        closingValue: contribRolloverOk && dueRolloverOk ? 'BALANCED ✓' : 'CHECK DELTA',
        formula: `=AND(ContribCheck=${contribRolloverOk ? 'TRUE' : 'FALSE'}, QardDueCheck=${dueRolloverOk ? 'TRUE' : 'FALSE'})`,
        highlight: contribRolloverOk && dueRolloverOk ? 'emerald' : 'rose',
      },
    ];
  }, [
    sheet,
    rows.length,
    ccy,
    monthlyTarget,
    expectedCollection,
    filterCounts,
    collectionRatePct,
    activeMonth,
    shortMonthLabel,
    prevMonthLabel,
    nextMonthLabel,
    cashFlowMetrics,
    netLiquidFund,
  ]);

  // Compute Name Box coordinate, Formula Bar expression, and plain copyable text for active cell
  const activeCellInfo = useMemo(() => {
    const fmt = (v: number) => formatMoney(v, ccy);

    if (activeTab === 'variables-summary') {
      const safeRow = Math.max(0, Math.min(allVariablesRows.length - 1, selectedCell.row));
      const safeCol = Math.max(0, Math.min(SUMMARY_COL_LETTERS.length - 1, selectedCell.col));
      const item = allVariablesRows[safeRow];
      const ref = `${SUMMARY_COL_LETTERS[safeCol]}${safeRow + 2}`;
      if (!item) {
        return { ref: 'A2', formula: 'No summary variables loaded yet.', copyValue: '' };
      }
      const cellValues = [
        item.group,
        item.variable,
        item.basis,
        item.prevValue,
        item.currValue,
        item.closingValue,
      ];
      const val = cellValues[safeCol] || '—';
      return {
        ref,
        formula: safeCol >= 2 ? item.formula : `="${val}"  // ${item.variable}`,
        copyValue: val,
      };
    }

    const safeCol = Math.max(0, Math.min(SHEET_COL_LETTERS.length - 1, selectedCell.col));
    const colLetter = SHEET_COL_LETTERS[safeCol];
    const lastDataRow = Math.max(2, filteredRows.length + 1);

    // Cooperative Totals row (-1)
    if (selectedCell.row === -1 && sheet) {
      const totalRowNum = filteredRows.length + (isFiltered ? 3 : 2);
      const ref = `${colLetter}${totalRowNum}`;
      const totValues: Record<number, { value: string; formula: string }> = {
        0: {
          value: `Cooperative Totals (${rows.length} Active Members)`,
          formula: `="Cooperative Period Totals (${rows.length} Active Members)"`,
        },
        1: { value: `${rows.length} IDs`, formula: `=COUNTA(B2:B${rows.length + 1})` },
        2: { value: 'All Members', formula: `=COUNTA(C2:C${rows.length + 1})` },
        3: {
          value: fmt(sheet.previousMonthSummary.contributionAmount),
          formula: `=SUM(D2:D${rows.length + 1})  →  ${fmt(sheet.previousMonthSummary.contributionAmount)}`,
        },
        4: {
          value: fmt(sheet.previousMonthSummary.qardHasanAmount),
          formula: `=SUM(E2:E${rows.length + 1})  →  ${fmt(sheet.previousMonthSummary.qardHasanAmount)}`,
        },
        5: {
          value: fmt(sheet.previousMonthSummary.dueHasanaAmount),
          formula: `=SUM(F2:F${rows.length + 1})  →  ${fmt(sheet.previousMonthSummary.dueHasanaAmount)}`,
        },
        6: {
          value: fmt(sheet.thisMonthOnly.contributionAmount),
          formula: `=SUM(G2:G${rows.length + 1})  →  ${fmt(sheet.thisMonthOnly.contributionAmount)} (${collectionRatePct}% of target)`,
        },
        7: {
          value: fmt(sheet.thisMonthOnly.qardHasanAmount),
          formula: `=SUM(H2:H${rows.length + 1})  →  ${fmt(sheet.thisMonthOnly.qardHasanAmount)}`,
        },
        8: {
          value: fmt(sheet.thisMonthRepaidAmount),
          formula: `=SUM(I2:I${rows.length + 1})  →  ${fmt(sheet.thisMonthRepaidAmount)} total Qard Hasan refunded in ${shortMonthLabel}`,
        },
        9: {
          value: fmt(sheet.thisMonthSummary.contributionAmount),
          formula: `=D${totalRowNum}+G${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.contributionAmount)}`,
        },
        10: {
          value: fmt(sheet.thisMonthSummary.qardHasanAmount),
          formula: `=E${totalRowNum}+H${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.qardHasanAmount)}`,
        },
        11: {
          value: fmt(sheet.thisMonthSummary.dueHasanaAmount),
          formula: `=F${totalRowNum}+H${totalRowNum}-I${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.dueHasanaAmount)}`,
        },
        12: {
          value: fmt(cashFlowMetrics.closingNetEquity),
          formula: `=J${totalRowNum}-L${totalRowNum}  →  ${fmt(cashFlowMetrics.closingNetEquity)}`,
        },
        13: {
          value: `${filterCounts.paid}/${rows.length} Paid`,
          formula: `="${filterCounts.paid} of ${rows.length} Paid (${collectionRatePct}%)"`,
        },
      };
      const entry = totValues[safeCol] || totValues[0];
      return { ref, formula: entry.formula, copyValue: entry.value };
    }

    // Filtered Subtotal row (-2)
    if (selectedCell.row === -2 && isFiltered) {
      const subRowNum = filteredRows.length + 2;
      const ref = `${colLetter}${subRowNum}`;
      const subValues: Record<number, { value: string; formula: string }> = {
        0: {
          value: `Filtered Subtotal (${filteredRows.length} rows)`,
          formula: `="Filtered Subtotal (${filteredRows.length} of ${rows.length} members)"`,
        },
        1: { value: `${filteredRows.length} rows`, formula: `=SUBTOTAL(103, B2:B${lastDataRow})` },
        2: { value: 'Filtered', formula: `=SUBTOTAL(103, C2:C${lastDataRow})` },
        3: {
          value: fmt(filteredTotals.prevContrib),
          formula: `=SUBTOTAL(109, D2:D${lastDataRow})  →  ${fmt(filteredTotals.prevContrib)}`,
        },
        4: {
          value: fmt(filteredTotals.prevQard),
          formula: `=SUBTOTAL(109, E2:E${lastDataRow})  →  ${fmt(filteredTotals.prevQard)}`,
        },
        5: {
          value: fmt(filteredTotals.prevDue),
          formula: `=SUBTOTAL(109, F2:F${lastDataRow})  →  ${fmt(filteredTotals.prevDue)}`,
        },
        6: {
          value: fmt(filteredTotals.currContrib),
          formula: `=SUBTOTAL(109, G2:G${lastDataRow})  →  ${fmt(filteredTotals.currContrib)}`,
        },
        7: {
          value: fmt(filteredTotals.currQard),
          formula: `=SUBTOTAL(109, H2:H${lastDataRow})  →  ${fmt(filteredTotals.currQard)}`,
        },
        8: {
          value: fmt(filteredTotals.currRefund),
          formula: `=SUBTOTAL(109, I2:I${lastDataRow})  →  ${fmt(filteredTotals.currRefund)}`,
        },
        9: {
          value: fmt(filteredTotals.closingContrib),
          formula: `=SUBTOTAL(109, J2:J${lastDataRow})  →  ${fmt(filteredTotals.closingContrib)}`,
        },
        10: {
          value: fmt(filteredTotals.closingQard),
          formula: `=SUBTOTAL(109, K2:K${lastDataRow})  →  ${fmt(filteredTotals.closingQard)}`,
        },
        11: {
          value: fmt(filteredTotals.closingDue),
          formula: `=SUBTOTAL(109, L2:L${lastDataRow})  →  ${fmt(filteredTotals.closingDue)}`,
        },
        12: {
          value: fmt(filteredTotals.netEquity),
          formula: `=SUBTOTAL(109, M2:M${lastDataRow})  →  ${fmt(filteredTotals.netEquity)}`,
        },
        13: {
          value: `${filteredRows.length} shown`,
          formula: `=COUNTA(N2:N${lastDataRow})`,
        },
      };
      const entry = subValues[safeCol] || subValues[0];
      return { ref, formula: entry.formula, copyValue: entry.value };
    }

    const rowIndex = Math.max(0, Math.min(filteredRows.length - 1, selectedCell.row));
    const row = filteredRows[rowIndex];
    const sheetRowNum = rowIndex + 2;
    const ref = `${colLetter}${sheetRowNum}`;

    if (!row) {
      return {
        ref: 'A2',
        formula: 'Select any cell in the Balance Sheet to inspect its formula and breakdown.',
        copyValue: '',
      };
    }

    const netEquity = getNetEquity(row);
    const statusLabel =
      row.contributionStatus === 'paid'
        ? t('statusPaid')
        : row.contributionStatus === 'partial'
          ? t('statusPartial')
          : row.contributionStatus === 'pending'
            ? t('statusPending')
            : t('statusDue');

    const map: Record<number, { value: string; formula: string }> = {
      0: {
        value: row.name,
        formula: `="${row.name}"  // ${row.memberCode} · Double-click name for member details`,
      },
      1: {
        value: row.memberCode,
        formula: `="${row.memberCode}"  // Serial #${row.serialNo}`,
      },
      2: {
        value: row.mobile,
        formula: `="${row.mobile}"  // Verified Member Phone Number`,
      },
      3: {
        value: fmt(row.previousSummary.contributionAmount),
        formula: `=SUMIFS(Contributions, Member="${row.memberCode}", Month<"${activeMonth}")  →  ${fmt(row.previousSummary.contributionAmount)}`,
      },
      4: {
        value: fmt(row.previousSummary.qardHasanAmount),
        formula: `=SUMIFS(QardDisbursed, Member="${row.memberCode}", Month<"${activeMonth}")  →  ${fmt(row.previousSummary.qardHasanAmount)}`,
      },
      5: {
        value: fmt(row.previousSummary.dueHasanaAmount),
        formula: `=OPENING_QARD_DUE("${row.memberCode}", "${prevMonthKey}")  →  ${fmt(row.previousSummary.dueHasanaAmount)}`,
      },
      6: {
        value: fmt(row.thisMonth.contributionAmount),
        formula:
          row.contributionPendingAmount > 0
            ? `=SUMIFS(Contributions, Month="${activeMonth}", Status="approved")  →  ${fmt(row.thisMonth.contributionAmount)} (+${fmt(row.contributionPendingAmount)} awaiting review)`
            : `=SUMIFS(Contributions, Month="${activeMonth}", Status="approved")  →  ${fmt(row.thisMonth.contributionAmount)} (Target: ${fmt(row.contributionTarget)})`,
      },
      7: {
        value: fmt(row.thisMonth.qardHasanAmount),
        formula: `=SUMIFS(QardDisbursed, Member="${row.memberCode}", Month="${activeMonth}")  →  ${fmt(row.thisMonth.qardHasanAmount)}`,
      },
      8: {
        value: fmt(row.thisMonth.repaidAmount),
        formula: `=SUMIFS(QardRefunds, Member="${row.memberCode}", Month="${activeMonth}")  →  ${fmt(row.thisMonth.repaidAmount)} refunded in ${shortMonthLabel}`,
      },
      9: {
        value: fmt(row.thisMonthSummary.contributionAmount),
        formula: `=D${sheetRowNum}+G${sheetRowNum}  // ${fmt(row.previousSummary.contributionAmount)} + ${fmt(row.thisMonth.contributionAmount)} = ${fmt(row.thisMonthSummary.contributionAmount)}`,
      },
      10: {
        value: fmt(row.thisMonthSummary.qardHasanAmount),
        formula: `=E${sheetRowNum}+H${sheetRowNum}  // ${fmt(row.previousSummary.qardHasanAmount)} + ${fmt(row.thisMonth.qardHasanAmount)} = ${fmt(row.thisMonthSummary.qardHasanAmount)}`,
      },
      11: {
        value: fmt(row.thisMonthSummary.dueHasanaAmount),
        formula: `=F${sheetRowNum}+H${sheetRowNum}-I${sheetRowNum}  // ${fmt(row.previousSummary.dueHasanaAmount)} + ${fmt(row.thisMonth.qardHasanAmount)} − ${fmt(row.thisMonth.repaidAmount)} = ${fmt(row.thisMonthSummary.dueHasanaAmount)}`,
      },
      12: {
        value: fmt(netEquity),
        formula: `=J${sheetRowNum}-L${sheetRowNum}  // ${fmt(row.thisMonthSummary.contributionAmount)} − ${fmt(row.thisMonthSummary.dueHasanaAmount)} = ${fmt(netEquity)}`,
      },
      13: {
        value: statusLabel,
        formula: `=IF(G${sheetRowNum}>=${row.contributionTarget},"Paid",IF(G${sheetRowNum}>0,"Partial",IF(Pending>0,"Pending","Due")))  →  ${statusLabel}`,
      },
    };

    const entry = map[safeCol] || map[0];
    return { ref, formula: entry.formula, copyValue: entry.value };
  }, [
    activeTab,
    allVariablesRows,
    selectedCell,
    filteredRows,
    sheet,
    ccy,
    rows.length,
    isFiltered,
    filteredTotals,
    collectionRatePct,
    shortMonthLabel,
    cashFlowMetrics.closingNetEquity,
    filterCounts.paid,
    activeMonth,
    prevMonthKey,
    t,
  ]);

  const handleCopyActiveCell = useCallback(async () => {
    if (!activeCellInfo.copyValue) return;
    try {
      await navigator.clipboard.writeText(activeCellInfo.copyValue);
      setCopiedCell(true);
      setTimeout(() => setCopiedCell(false), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  }, [activeCellInfo.copyValue]);

  const handleGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (inspectedMemberId) return;
      if (
        e.key === 'Enter' &&
        activeTab === 'balance-sheet' &&
        selectedCell.tab === 'balance-sheet' &&
        selectedCell.col === 0 &&
        selectedCell.row >= 0
      ) {
        const targetRow = filteredRows[selectedCell.row];
        if (targetRow) {
          e.preventDefault();
          setInspectedMemberId(targetRow.userId);
        }
        return;
      }
      if (
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight'
      ) {
        return;
      }
      e.preventDefault();
      setSelectedCell((prev) => {
        if (activeTab === 'variables-summary') {
          const maxRow = Math.max(0, allVariablesRows.length - 1);
          const maxCol = SUMMARY_COL_LETTERS.length - 1;
          let nextRow = prev.tab === 'variables-summary' ? prev.row : 0;
          let nextCol = prev.tab === 'variables-summary' ? prev.col : 0;
          if (e.key === 'ArrowUp') nextRow = Math.max(0, nextRow - 1);
          if (e.key === 'ArrowDown') nextRow = Math.min(maxRow, nextRow + 1);
          if (e.key === 'ArrowLeft') nextCol = Math.max(0, nextCol - 1);
          if (e.key === 'ArrowRight') nextCol = Math.min(maxCol, nextCol + 1);
          return { tab: 'variables-summary', row: nextRow, col: nextCol };
        }

        const maxDataIdx = filteredRows.length - 1;
        const maxCol = SHEET_COL_LETTERS.length - 1;
        let nextRow = prev.tab === 'balance-sheet' ? prev.row : 0;
        let nextCol = prev.tab === 'balance-sheet' ? prev.col : 0;

        if (e.key === 'ArrowLeft') nextCol = Math.max(0, nextCol - 1);
        if (e.key === 'ArrowRight') nextCol = Math.min(maxCol, nextCol + 1);

        if (e.key === 'ArrowDown') {
          if (nextRow === -2) nextRow = -1;
          else if (nextRow === -1) nextRow = -1;
          else if (nextRow < maxDataIdx) nextRow += 1;
          else nextRow = isFiltered ? -2 : -1;
        }
        if (e.key === 'ArrowUp') {
          if (nextRow === -1) nextRow = isFiltered ? -2 : Math.max(0, maxDataIdx);
          else if (nextRow === -2) nextRow = Math.max(0, maxDataIdx);
          else nextRow = Math.max(0, nextRow - 1);
        }

        return { tab: 'balance-sheet', row: nextRow, col: nextCol };
      });
    },
    [activeTab, allVariablesRows.length, filteredRows, inspectedMemberId, isFiltered, selectedCell]
  );

  const showToast = useCallback((message: string) => {
    setExportNotice(message);
    setTimeout(() => {
      setExportNotice((prev) => (prev === message ? null : prev));
    }, 3200);
  }, []);

  const handleExportPdf = useCallback(() => {
    if (!sheet) return;
    const filterParts: string[] = [];
    if (filter !== 'all') filterParts.push(`filter: ${filter}`);
    if (search.trim()) filterParts.push(`search: "${search.trim()}"`);

    exportBalanceSheetPdf({
      sheet,
      rows: filteredRows,
      isFiltered,
      filterLabel: filterParts.join(', '),
      fundName,
      preparedBy: user,
    });
    showToast(t('pdfSuccess'));
  }, [sheet, filteredRows, isFiltered, filter, search, fundName, user, showToast, t]);

  const handleExportCsv = useCallback(() => {
    if (!sheet) return;
    const headers = [
      'Row',
      'Member Name',
      'Member ID',
      'Phone Number',
      `Prev. Months Cumul. Contribution (${prevMonthLabel})`,
      `Prev. Month Cumul. Qard Hasan (${prevMonthLabel})`,
      `Prev. Cumul. Qard Due (${prevMonthLabel})`,
      `Current Month Contribution (${shortMonthLabel})`,
      `Current Month Pending Contribution (${shortMonthLabel})`,
      `Current Month Qard Drawn (${shortMonthLabel})`,
      `Current Month Refund Qard Hasan (${shortMonthLabel})`,
      `Closing Cumul. Contribution (${nextMonthLabel} Open)`,
      `Closing Cumul. Qard Hasan`,
      `Closing Qard Due`,
      `Net Member Equity`,
      'Status',
    ];

    const dataRows = filteredRows.map((row, idx) => [
      idx + 2,
      row.name,
      row.memberCode,
      row.mobile,
      row.previousSummary.contributionAmount,
      row.previousSummary.qardHasanAmount,
      row.previousSummary.dueHasanaAmount,
      row.thisMonth.contributionAmount,
      row.contributionPendingAmount,
      row.thisMonth.qardHasanAmount,
      row.thisMonth.repaidAmount,
      row.thisMonthSummary.contributionAmount,
      row.thisMonthSummary.qardHasanAmount,
      row.thisMonthSummary.dueHasanaAmount,
      getNetEquity(row),
      row.contributionStatus.toUpperCase(),
    ]);

    const totalsRow = [
      'TOTAL',
      `Cooperative Totals (${rows.length} Active Members)`,
      '',
      '',
      sheet.previousMonthSummary.contributionAmount,
      sheet.previousMonthSummary.qardHasanAmount,
      sheet.previousMonthSummary.dueHasanaAmount,
      sheet.thisMonthOnly.contributionAmount,
      filterCounts.pendingContributionTotal,
      sheet.thisMonthOnly.qardHasanAmount,
      sheet.thisMonthRepaidAmount,
      sheet.thisMonthSummary.contributionAmount,
      sheet.thisMonthSummary.qardHasanAmount,
      sheet.thisMonthSummary.dueHasanaAmount,
      cashFlowMetrics.closingNetEquity,
      `${filterCounts.paid}/${rows.length} PAID (${collectionRatePct}%)`,
    ];

    const summaryHeader = [
      '',
      'CURRENT MONTH ALL VARIABLES SUMMARY',
      'Group',
      'Variable',
      'Formula / Basis',
      `Previous (${prevMonthLabel})`,
      `Current (${shortMonthLabel})`,
      'Closing / Value',
    ];
    const summaryCsvRows = allVariablesRows.map((item, idx) => [
      idx + 1,
      '',
      item.group,
      item.variable,
      item.basis,
      item.prevValue,
      item.currValue,
      item.closingValue,
    ]);

    const csv = [
      headers,
      ...dataRows,
      totalsRow,
      [],
      summaryHeader,
      ...summaryCsvRows,
    ]
      .map((line) => line.map(escapeCsvCell).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amanah-balance-sheet-${sheet.month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(t('csvSuccess'));
  }, [
    sheet,
    filteredRows,
    rows.length,
    prevMonthLabel,
    shortMonthLabel,
    nextMonthLabel,
    filterCounts,
    cashFlowMetrics.closingNetEquity,
    collectionRatePct,
    allVariablesRows,
    showToast,
    t,
  ]);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400/70 shrink-0" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
    );
  };

  const renderStatusIndicator = (status: MonthlySheetMemberRow['contributionStatus']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{t('statusPaid')}</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{t('statusPartial')}</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{t('statusPending')}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('statusDue')}</span>
          </span>
        );
    }
  };

  const isCellActive = (tab: WorkbookTab, row: number, col: number) =>
    selectedCell.tab === tab && selectedCell.row === row && selectedCell.col === col;

  const cellRingClass = (active: boolean) =>
    active
      ? 'ring-2 ring-inset ring-emerald-600 dark:ring-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/40 relative z-10'
      : '';

  const cellPadY = density === 'compact' ? 'py-1.5' : 'py-2.5';

  const selectSheetCell = (tab: WorkbookTab, row: number, col: number) => {
    setSelectedCell({ tab, row, col });
  };

  return (
    <div className="space-y-4">
      {/* Compact High-Level Current Month Variables Strip (Always Visible Above Sheet) */}
      {sheet && (
        <section
          aria-label="Current month balance sheet summary"
          className="balance-sheet-printable grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800 overflow-hidden"
        >
          <div className="px-4 py-3.5 flex flex-col justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Prev. Months Cumul. Contribution
            </span>
            <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-50">
              {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Prev. Qard: {formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)} · Due:{' '}
              {formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)}
            </div>
          </div>

          <div className="px-4 py-3.5 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Current Month Contribution ({shortMonthLabel})
              </span>
              <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {collectionRatePct}%
              </span>
            </div>
            <div className="font-mono tabular-nums text-lg font-bold text-emerald-700 dark:text-emerald-400">
              +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filterCounts.paid}/{rows.length} paid · Target {formatMoney(expectedCollection, ccy)}
            </div>
          </div>

          <div className="px-4 py-3.5 flex flex-col justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current Month Refund Qard Hasan
            </span>
            <div className="font-mono tabular-nums text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {sheet.thisMonthRepaidAmount > 0
                ? `+${formatMoney(sheet.thisMonthRepaidAmount, ccy)}`
                : formatMoney(0, ccy)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Drawn: {formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)} · Closing Due:{' '}
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                {formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)}
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5 flex flex-col justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Closing Savings & Net Cash Flow
            </span>
            <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-50">
              {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Net Flow:{' '}
              <span
                className={
                  cashFlowMetrics.netCashFlow >= 0
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-rose-700 dark:text-rose-400 font-semibold'
                }
              >
                {cashFlowMetrics.netCashFlow >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(cashFlowMetrics.netCashFlow), ccy)}
              </span>{' '}
              · Liquid: {formatMoney(netLiquidFund, ccy)}
            </div>
          </div>
        </section>
      )}

      {/* Main Google Sheets-Style Balance Sheet Workbook */}
      <section className="balance-sheet-printable rounded-xl border border-slate-300/90 dark:border-slate-700/90 bg-white dark:bg-slate-950 overflow-hidden">
        {/* 1. Google Sheets Document Title & Actions Bar */}
        <div className="bg-[#f8fafc] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight">
                  Balance Sheet
                </h1>
                <span className="text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 px-2 py-0.5 rounded">
                  {fullMonthLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {fundName} · Target {formatMoney(monthlyTarget, ccy)}/member · Rolls into{' '}
                {nextMonthLabel}
              </p>
            </div>
          </div>

          {/* Month Switcher + Export Controls */}
          <div className="flex flex-wrap items-center gap-1.5 print-hidden">
            <div className="inline-flex items-center rounded-md border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, -1))}
                aria-label={t('prevMonthAria')}
                className="h-8 w-8 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label={t('selectMonthAria')}
                className="h-8 px-2.5 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {monthOptions.map((ym) => (
                  <option key={ym} value={ym} className="bg-white dark:bg-slate-900">
                    {formatMonthLong(ym)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, 1))}
                aria-label={t('nextMonthAria')}
                className="h-8 w-8 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="h-8 px-2.5 rounded-md border border-emerald-300/80 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                {t('currentMonthBtn')}
              </button>
            )}

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!sheet}
              className="h-8 px-2.5 rounded-md border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!sheet}
              className="h-8 px-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!sheet}
              title={t('printSheet')}
              aria-label={t('printSheet')}
              className="h-8 w-8 rounded-md border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void sheetQuery.refetch()}
              disabled={isRefetching}
              title={tCommon('refresh')}
              aria-label={tCommon('refresh')}
              className="h-8 w-8 rounded-md border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 2. Google Sheets Formatting & Filter Toolbar */}
        <div className="bg-[#edf2fa]/80 dark:bg-slate-900/75 border-b border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 print-hidden">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAria')}
                className="w-full h-7 pl-8 pr-7 rounded border border-slate-300/80 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('clearSearchAria')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeTab === 'balance-sheet' && (
              <>
                <div className="h-4 w-px bg-slate-300/80 dark:bg-slate-700 hidden sm:block" />
                {/* Toolbar Filter Buttons */}
                <div className="inline-flex items-center gap-0.5 flex-wrap">
                  {(
                    [
                      { key: 'all', label: `All (${filterCounts.all})` },
                      { key: 'paid', label: `Paid (${filterCounts.paid})` },
                      { key: 'due', label: `Unpaid (${filterCounts.due})` },
                      { key: 'qard_hasan', label: `Qard Hasan (${filterCounts.qardHasan})` },
                    ] as const
                  ).map((item) => {
                    const active = filter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setFilter(item.key);
                          setSelectedCell({ tab: 'balance-sheet', row: 0, col: 0 });
                        }}
                        className={`h-7 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right Google Sheets View Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {activeTab === 'balance-sheet' && (
              <>
                <button
                  type="button"
                  onClick={() => setFreezeIdentityCols((v) => !v)}
                  title="Freeze columns A–C (Member Name, ID, Phone)"
                  className={`hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium border transition-colors cursor-pointer ${
                    freezeIdentityCols
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  <span>Freeze A–C</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDensity((d) => (d === 'compact' ? 'standard' : 'compact'))}
                  title="Toggle spreadsheet row height"
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Rows3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {density === 'compact' ? 'Compact' : 'Standard'}
                  </span>
                </button>

                {/* Mobile Sheet / Cards Switch */}
                <div className="inline-flex md:hidden items-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMobileViewMode('sheet')}
                    className={`h-7 px-2 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      mobileViewMode === 'sheet'
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>{t('viewToggleSheet')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileViewMode('cards')}
                    className={`h-7 px-2 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      mobileViewMode === 'cards'
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>{t('viewToggleCards')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3. Authentic Google Sheets Formula Bar (Name Box + fx) */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center h-9 print-hidden">
          <div
            title="Selected cell reference"
            className="w-[72px] shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 flex items-center justify-center font-mono text-xs font-bold text-slate-800 dark:text-slate-100 select-all"
          >
            {activeCellInfo.ref}
          </div>
          <div className="w-9 shrink-0 h-full border-r border-slate-200/80 dark:border-slate-800 flex items-center justify-center select-none">
            <span className="font-serif italic font-semibold text-sm text-slate-400 dark:text-slate-500">
              fx
            </span>
          </div>
          <div className="flex-1 min-w-0 px-3 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-200">
            {activeCellInfo.formula}
          </div>
          <div className="shrink-0 flex items-center gap-2 pr-2.5 pl-2 border-l border-slate-200/80 dark:border-slate-800 h-full">
            <button
              type="button"
              onClick={() => void handleCopyActiveCell()}
              disabled={!activeCellInfo.copyValue}
              title="Copy selected cell value"
              className="h-6 px-2 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copiedCell ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export Notification Banner */}
        <AnimatePresence>
          {exportNotice && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/50 print-hidden"
            >
              <div className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{exportNotice}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setExportNotice(null)}
                  className="text-emerald-700 dark:text-emerald-400 hover:opacity-75 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => void sheetQuery.refetch()}
              className="px-2.5 py-1 rounded border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isInitialLoading && (
          <div className="p-5 space-y-2.5">
            <Skeleton height={28} />
            <Skeleton height={28} count={8} />
          </div>
        )}

        {/* 4A. TAB 1: GOOGLE SHEETS BALANCE SHEET GRID */}
        {!isInitialLoading && sheet && activeTab === 'balance-sheet' && (
          <>
            {/* Mobile Cards Fallback (Only when mobile user explicitly toggles Cards) */}
            {mobileViewMode === 'cards' && (
              <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRows.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {t('emptyTitle')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t('emptyDesc')}
                    </p>
                  </div>
                ) : (
                  filteredRows.map((row) => {
                    const netEquity = getNetEquity(row);
                    return (
                      <div key={row.userId} className="p-3.5 space-y-2.5 bg-white dark:bg-slate-950">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setInspectedMemberId(row.userId)}
                              className="text-sm font-bold text-slate-900 dark:text-slate-50 hover:text-emerald-700 dark:hover:text-emerald-400 text-left truncate block cursor-pointer"
                            >
                              {row.serialNo}. {row.name}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{row.memberCode}</span>
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {row.mobile}
                              </span>
                            </div>
                          </div>
                          {renderStatusIndicator(row.contributionStatus)}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px] border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-slate-50/60 dark:bg-slate-900/50">
                          <div className="p-2 border-r border-b border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              Prev. Cumul. Contrib
                            </div>
                            <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                              {formatMoney(row.previousSummary.contributionAmount, ccy)}
                            </div>
                          </div>
                          <div className="p-2 border-b border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              Prev. Cumul. Qard Hasan
                            </div>
                            <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                              {formatMoney(row.previousSummary.qardHasanAmount, ccy)}
                            </div>
                          </div>
                          <div className="p-2 border-r border-b border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              Curr. Month Contrib
                            </div>
                            <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                              {formatMoney(row.thisMonth.contributionAmount, ccy)}
                            </div>
                          </div>
                          <div className="p-2 border-b border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              Curr. Refund Qard Hasan
                            </div>
                            <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                              {formatMoney(row.thisMonth.repaidAmount, ccy)}
                            </div>
                          </div>
                          <div className="p-2 border-r border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              Closing Contrib / Equity
                            </div>
                            <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                              {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                              <span className="text-slate-400 font-normal">
                                {' '}
                                ({formatMoney(netEquity, ccy)})
                              </span>
                            </div>
                          </div>
                          <div className="p-2">
                            <div className="text-slate-500 dark:text-slate-400">
                              Closing Qard Due
                            </div>
                            <div className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                              {formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Authentic Google Sheets Interactive Grid */}
            <div
              ref={gridContainerRef}
              tabIndex={0}
              onKeyDown={handleGridKeyDown}
              className={`${
                mobileViewMode === 'cards' ? 'hidden md:block' : 'block'
              } overflow-auto max-h-[68vh] focus:outline-none`}
            >
              <table className="w-full border-collapse text-xs select-none">
                <thead className="sticky top-0 z-30">
                  {/* Spreadsheet Column Letters Row (A .. N) */}
                  <tr className="bg-[#f8f9fa] dark:bg-slate-900 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <th
                      scope="col"
                      aria-label="Row selector"
                      className="w-[42px] min-w-[42px] h-6 border-r border-b border-slate-300/90 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40"
                    />
                    {SHEET_COL_LETTERS.map((letter, colIdx) => {
                      const colActive =
                        selectedCell.tab === 'balance-sheet' && selectedCell.col === colIdx;
                      const stickyClass =
                        freezeIdentityCols && colIdx === 0
                          ? 'md:sticky md:left-[42px] md:z-40'
                          : freezeIdentityCols && colIdx === 1
                            ? 'md:sticky md:left-[218px] md:z-40'
                            : freezeIdentityCols && colIdx === 2
                              ? 'md:sticky md:left-[314px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600'
                              : '';
                      return (
                        <th
                          key={letter}
                          scope="col"
                          className={`h-6 px-2 text-center font-semibold border-r border-b border-slate-300/90 dark:border-slate-700 ${stickyClass} ${
                            colActive
                              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                              : 'bg-[#f8f9fa] dark:bg-slate-900'
                          }`}
                        >
                          {letter}
                        </th>
                      );
                    })}
                  </tr>

                  {/* Category Group Banner Row */}
                  <tr className="text-[10px] font-bold uppercase tracking-wider">
                    <th
                      scope="col"
                      className="w-[42px] min-w-[42px] h-6 border-r border-b border-slate-300/90 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40"
                    />
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className={`h-6 px-2.5 text-left border-r border-b border-slate-300/90 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${
                        freezeIdentityCols
                          ? 'md:sticky md:left-[42px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600'
                          : ''
                      }`}
                    >
                      Member Details (A–C)
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="h-6 px-2.5 text-center border-r border-b border-slate-300/90 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300"
                    >
                      Previous Months Cumulative ({prevMonthLabel})
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="h-6 px-2.5 text-center border-r border-b border-slate-300/90 dark:border-slate-700 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300"
                    >
                      Current Month Activity & Refund ({shortMonthLabel})
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={5}
                      className="h-6 px-2.5 text-center border-r border-b border-slate-300/90 dark:border-slate-700 bg-slate-100/95 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100"
                    >
                      Current Month All-Variables Summary (Closing → {nextMonthLabel})
                    </th>
                  </tr>

                  {/* Row 1 — Column Titles Row (Sortable) */}
                  <tr className="bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    <th
                      scope="row"
                      className="w-[42px] min-w-[42px] py-2 text-center font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 border-r border-b-2 border-slate-300 dark:border-slate-700 bg-[#f8f9fa] dark:bg-slate-900 sticky left-0 z-40"
                    >
                      1
                    </th>

                    {/* A: Name */}
                    <th
                      scope="col"
                      className={`min-w-[176px] w-[176px] px-2.5 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 ${
                        freezeIdentityCols ? 'md:sticky md:left-[42px] md:z-40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('name')}
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Name</span>
                        {renderSortIcon('name')}
                      </button>
                    </th>

                    {/* B: ID */}
                    <th
                      scope="col"
                      className={`min-w-[96px] w-[96px] px-2.5 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 ${
                        freezeIdentityCols ? 'md:sticky md:left-[218px] md:z-40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('memberCode')}
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>ID</span>
                        {renderSortIcon('memberCode')}
                      </button>
                    </th>

                    {/* C: Phone */}
                    <th
                      scope="col"
                      className={`min-w-[132px] w-[132px] px-2.5 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 ${
                        freezeIdentityCols
                          ? 'md:sticky md:left-[314px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600'
                          : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('mobile')}
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Phone</span>
                        {renderSortIcon('mobile')}
                      </button>
                    </th>

                    {/* D: Previous Cumulative — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[116px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevContrib')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Contribution</span>
                        {renderSortIcon('prevContrib')}
                      </button>
                    </th>

                    {/* E: Previous Cumulative — Qard Hasan */}
                    <th
                      scope="col"
                      className="min-w-[114px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevQard')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Qard Hasan</span>
                        {renderSortIcon('prevQard')}
                      </button>
                    </th>

                    {/* F: Previous Cumulative — Qard Due */}
                    <th
                      scope="col"
                      className="min-w-[108px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevDue')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Qard Due</span>
                        {renderSortIcon('prevDue')}
                      </button>
                    </th>

                    {/* G: Current Month — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[116px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-emerald-50/40 dark:bg-emerald-950/25"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currContrib')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Contribution</span>
                        {renderSortIcon('currContrib')}
                      </button>
                    </th>

                    {/* H: Current Month — Qard Drawn */}
                    <th
                      scope="col"
                      className="min-w-[112px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-emerald-50/40 dark:bg-emerald-950/25"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currQard')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Qard Drawn</span>
                        {renderSortIcon('currQard')}
                      </button>
                    </th>

                    {/* I: Current Month — Refund Qard */}
                    <th
                      scope="col"
                      className="min-w-[118px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-emerald-50/80 dark:bg-emerald-950/45 text-emerald-900 dark:text-emerald-200"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currRefund')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-bold hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                      >
                        <span>Refund Qard</span>
                        {renderSortIcon('currRefund')}
                      </button>
                    </th>

                    {/* J: Closing Summary — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[116px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingContrib')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Contribution</span>
                        {renderSortIcon('closingContrib')}
                      </button>
                    </th>

                    {/* K: Closing Summary — Qard Hasan */}
                    <th
                      scope="col"
                      className="min-w-[112px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingQard')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Qard Hasan</span>
                        {renderSortIcon('closingQard')}
                      </button>
                    </th>

                    {/* L: Closing Summary — Qard Due */}
                    <th
                      scope="col"
                      className="min-w-[108px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingDue')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Qard Due</span>
                        {renderSortIcon('closingDue')}
                      </button>
                    </th>

                    {/* M: Closing Summary — Net Equity */}
                    <th
                      scope="col"
                      className="min-w-[112px] px-2.5 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('netEquity')}
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Net Equity</span>
                        {renderSortIcon('netEquity')}
                      </button>
                    </th>

                    {/* N: Closing Summary — Status */}
                    <th
                      scope="col"
                      className="min-w-[92px] px-2.5 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('status')}
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <span>Status</span>
                        {renderSortIcon('status')}
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={15}
                        className="py-12 px-4 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-950"
                      >
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {t('emptyTitle')}
                        </p>
                        <p className="text-xs mt-1">{t('emptyDesc')}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const rowActive =
                        selectedCell.tab === 'balance-sheet' && selectedCell.row === idx;
                      const netEquity = getNetEquity(row);
                      const zebraBg =
                        idx % 2 === 1
                          ? 'bg-slate-50/45 dark:bg-slate-900/35'
                          : 'bg-white dark:bg-slate-950';
                      const stickyBg =
                        idx % 2 === 1
                          ? 'bg-[#fafbfc] dark:bg-[#0d1424]'
                          : 'bg-white dark:bg-slate-950';

                      return (
                        <tr
                          key={row.userId}
                          className={`${zebraBg} hover:bg-emerald-50/25 dark:hover:bg-emerald-950/15 transition-colors`}
                        >
                          {/* Row Number Gutter */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 0)}
                            className={`w-[42px] min-w-[42px] ${cellPadY} text-center font-mono text-[11px] border-r border-b border-slate-200 dark:border-slate-800 sticky left-0 z-20 cursor-pointer ${
                              rowActive
                                ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold'
                                : 'bg-[#f8f9fa] dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {idx + 2}
                          </td>

                          {/* A: Member Name (double-click to open member details modal) */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 0)}
                            onDoubleClick={() => {
                              selectSheetCell('balance-sheet', idx, 0);
                              setInspectedMemberId(row.userId);
                            }}
                            title="Double-click to view member details"
                            className={`px-2.5 ${cellPadY} border-r border-b border-slate-200 dark:border-slate-800 cursor-pointer ${
                              freezeIdentityCols
                                ? `md:sticky md:left-[42px] md:z-20 ${stickyBg}`
                                : ''
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 0))}`}
                          >
                            <div className="flex items-center justify-between gap-1.5 min-w-0">
                              <span className="font-medium text-slate-900 dark:text-slate-100 hover:text-emerald-700 dark:hover:text-emerald-400 truncate transition-colors">
                                {row.name}
                              </span>
                              {onViewMemberProfile && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewMemberProfile(row.userId);
                                  }}
                                  onDoubleClick={(e) => e.stopPropagation()}
                                  title={t('viewProfile')}
                                  aria-label={`${t('viewProfile')}: ${row.name}`}
                                  className="p-0.5 rounded text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 shrink-0 cursor-pointer print-hidden"
                                >
                                  <UserRound className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* B: Member ID */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 1)}
                            className={`px-2.5 ${cellPadY} font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              freezeIdentityCols
                                ? `md:sticky md:left-[218px] md:z-20 ${stickyBg}`
                                : ''
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 1))}`}
                          >
                            {row.memberCode}
                          </td>

                          {/* C: Phone Number */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 2)}
                            className={`px-2.5 ${cellPadY} font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              freezeIdentityCols
                                ? `md:sticky md:left-[314px] md:z-20 ${stickyBg} md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600`
                                : ''
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 2))}`}
                          >
                            {row.mobile}
                          </td>

                          {/* D: Prev. Months Cumul. Contribution */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 3)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.contributionAmount > 0
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 3))}`}
                          >
                            {row.previousSummary.contributionAmount > 0
                              ? formatMoney(row.previousSummary.contributionAmount, ccy)
                              : '—'}
                          </td>

                          {/* E: Prev. Month Cumul. Qard Hasan */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 4)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.qardHasanAmount > 0
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 4))}`}
                          >
                            {row.previousSummary.qardHasanAmount > 0
                              ? formatMoney(row.previousSummary.qardHasanAmount, ccy)
                              : '—'}
                          </td>

                          {/* F: Prev. Cumul. Qard Due */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 5)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.dueHasanaAmount > 0
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 5))}`}
                          >
                            {row.previousSummary.dueHasanaAmount > 0
                              ? formatMoney(row.previousSummary.dueHasanaAmount, ccy)
                              : '—'}
                          </td>

                          {/* G: Current Month Contribution */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 6)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 6)
                            )}`}
                          >
                            {row.thisMonth.contributionAmount > 0 ? (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {formatMoney(row.thisMonth.contributionAmount, ccy)}
                              </span>
                            ) : row.contributionPendingAmount > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                {formatMoney(row.contributionPendingAmount, ccy)}{' '}
                                <span className="text-[10px]">(pend.)</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* H: Current Month Qard Drawn */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 7)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonth.qardHasanAmount > 0
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 7))}`}
                          >
                            {row.thisMonth.qardHasanAmount > 0
                              ? `+${formatMoney(row.thisMonth.qardHasanAmount, ccy)}`
                              : '—'}
                          </td>

                          {/* I: Current Month Refund Qard Hasan */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 8)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap bg-emerald-50/25 dark:bg-emerald-950/15 ${
                              row.thisMonth.repaidAmount > 0
                                ? 'font-bold text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 8))}`}
                          >
                            {row.thisMonth.repaidAmount > 0
                              ? formatMoney(row.thisMonth.repaidAmount, ccy)
                              : '—'}
                          </td>

                          {/* J: Closing Cumul. Contribution */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 9)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 9)
                            )}`}
                          >
                            {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                          </td>

                          {/* K: Closing Cumul. Qard Hasan */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 10)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonthSummary.qardHasanAmount > 0
                                ? 'font-medium text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 10))}`}
                          >
                            {row.thisMonthSummary.qardHasanAmount > 0
                              ? formatMoney(row.thisMonthSummary.qardHasanAmount, ccy)
                              : '—'}
                          </td>

                          {/* L: Closing Qard Due */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 11)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonthSummary.dueHasanaAmount > 0
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 11))}`}
                          >
                            {row.thisMonthSummary.dueHasanaAmount > 0
                              ? formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)
                              : '—'}
                          </td>

                          {/* M: Net Member Equity */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 12)}
                            className={`px-2.5 ${cellPadY} text-right font-mono tabular-nums font-semibold border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              netEquity >= 0
                                ? 'text-emerald-800 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-400'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 12))}`}
                          >
                            {formatMoney(netEquity, ccy)}
                          </td>

                          {/* N: Status */}
                          <td
                            onClick={() => selectSheetCell('balance-sheet', idx, 13)}
                            className={`px-2.5 ${cellPadY} border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 13)
                            )}`}
                          >
                            {renderStatusIndicator(row.contributionStatus)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Filtered Subtotal + Pinned Cooperative Totals Footer */}
                <tfoot className="sticky bottom-0 z-30">
                  {isFiltered && filteredRows.length > 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 font-semibold">
                      <td
                        onClick={() => selectSheetCell('balance-sheet', -2, 0)}
                        className="w-[42px] min-w-[42px] py-2 text-center font-mono text-[11px] border-r border-t border-b border-slate-300 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800 sticky left-0 z-40 cursor-pointer"
                      >
                        {filteredRows.length + 2}
                      </td>
                      <td
                        colSpan={3}
                        onClick={() => selectSheetCell('balance-sheet', -2, 0)}
                        className={`px-2.5 py-2 border-r border-t border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 cursor-cell ${
                          freezeIdentityCols
                            ? 'md:sticky md:left-[42px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600'
                            : ''
                        } ${cellRingClass(isCellActive('balance-sheet', -2, 0))}`}
                      >
                        Filtered Subtotal ({filteredRows.length} of {rows.length} members)
                      </td>
                      {(
                        [
                          { col: 3, val: formatMoney(filteredTotals.prevContrib, ccy) },
                          { col: 4, val: formatMoney(filteredTotals.prevQard, ccy) },
                          { col: 5, val: formatMoney(filteredTotals.prevDue, ccy) },
                          { col: 6, val: formatMoney(filteredTotals.currContrib, ccy) },
                          { col: 7, val: formatMoney(filteredTotals.currQard, ccy) },
                          { col: 8, val: formatMoney(filteredTotals.currRefund, ccy) },
                          { col: 9, val: formatMoney(filteredTotals.closingContrib, ccy) },
                          { col: 10, val: formatMoney(filteredTotals.closingQard, ccy) },
                          { col: 11, val: formatMoney(filteredTotals.closingDue, ccy) },
                          { col: 12, val: formatMoney(filteredTotals.netEquity, ccy) },
                        ] as const
                      ).map((c) => (
                        <td
                          key={c.col}
                          onClick={() => selectSheetCell('balance-sheet', -2, c.col)}
                          className={`px-2.5 py-2 text-right font-mono tabular-nums border-r border-t border-b border-slate-300 dark:border-slate-700 cursor-cell whitespace-nowrap ${cellRingClass(
                            isCellActive('balance-sheet', -2, c.col)
                          )}`}
                        >
                          {c.val}
                        </td>
                      ))}
                      <td
                        onClick={() => selectSheetCell('balance-sheet', -2, 13)}
                        className={`px-2.5 py-2 font-mono text-[11px] border-r border-t border-b border-slate-300 dark:border-slate-700 cursor-cell whitespace-nowrap ${cellRingClass(
                          isCellActive('balance-sheet', -2, 13)
                        )}`}
                      >
                        {filteredRows.length} rows
                      </td>
                    </tr>
                  )}

                  {/* Cooperative Totals Row */}
                  <tr className="bg-[#eef3f8] dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-50">
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 0)}
                      className="w-[42px] min-w-[42px] py-2.5 text-center font-mono text-xs border-r border-t-2 border-slate-400/80 dark:border-slate-600 bg-emerald-700 text-white sticky left-0 z-40 cursor-pointer"
                    >
                      Σ
                    </td>
                    <td
                      colSpan={3}
                      onClick={() => selectSheetCell('balance-sheet', -1, 0)}
                      className={`px-2.5 py-2.5 border-r border-t-2 border-slate-400/80 dark:border-slate-600 bg-[#eef3f8] dark:bg-slate-900 cursor-cell ${
                        freezeIdentityCols
                          ? 'md:sticky md:left-[42px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600'
                          : ''
                      } ${cellRingClass(isCellActive('balance-sheet', -1, 0))}`}
                    >
                      Cooperative Totals ({rows.length} Active Members)
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 3)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 3)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 4)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 4)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 5)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 5)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 6)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 6)
                      )}`}
                    >
                      +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 7)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 7)
                      )}`}
                    >
                      {sheet.thisMonthOnly.qardHasanAmount > 0
                        ? `+${formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)}`
                        : '—'}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 8)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 8)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthRepaidAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 9)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-900 dark:text-emerald-200 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 9)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 10)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 10)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.qardHasanAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 11)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 11)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 12)}
                      className={`px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-900 dark:text-emerald-200 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 12)
                      )}`}
                    >
                      {formatMoney(cashFlowMetrics.closingNetEquity, ccy)}
                    </td>
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 13)}
                      className={`px-2.5 py-2.5 font-mono tabular-nums text-[11px] text-emerald-800 dark:text-emerald-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 13)
                      )}`}
                    >
                      {filterCounts.paid}/{rows.length} ({collectionRatePct}%)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* 4B. TAB 2: CURRENT MONTH ALL VARIABLES SUMMARY (Google Sheets Summary Sheet) */}
        {!isInitialLoading && sheet && activeTab === 'variables-summary' && (
          <div
            tabIndex={0}
            onKeyDown={handleGridKeyDown}
            className="overflow-auto max-h-[68vh] focus:outline-none"
          >
            <table className="w-full border-collapse text-xs select-none">
              <thead className="sticky top-0 z-30">
                <tr className="bg-[#f8f9fa] dark:bg-slate-900 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <th className="w-[42px] min-w-[42px] h-6 border-r border-b border-slate-300/90 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40" />
                  {SUMMARY_COL_LETTERS.map((letter, colIdx) => {
                    const colActive =
                      selectedCell.tab === 'variables-summary' && selectedCell.col === colIdx;
                    return (
                      <th
                        key={letter}
                        className={`h-6 px-2 text-center font-semibold border-r border-b border-slate-300/90 dark:border-slate-700 ${
                          colActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                            : 'bg-[#f8f9fa] dark:bg-slate-900'
                        }`}
                      >
                        {letter}
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  <th className="w-[42px] min-w-[42px] py-2 text-center font-mono text-[11px] font-medium text-slate-500 border-r border-b-2 border-slate-300 dark:border-slate-700 bg-[#f8f9fa] dark:bg-slate-900 sticky left-0 z-40">
                    1
                  </th>
                  <th className="min-w-[165px] px-3 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700">
                    Variable Group
                  </th>
                  <th className="min-w-[260px] px-3 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700">
                    Current Month Variable
                  </th>
                  <th className="min-w-[230px] px-3 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700">
                    Spreadsheet Formula / Basis
                  </th>
                  <th className="min-w-[138px] px-3 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700">
                    Previous ({prevMonthLabel})
                  </th>
                  <th className="min-w-[156px] px-3 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                    Current ({shortMonthLabel})
                  </th>
                  <th className="min-w-[156px] px-3 py-2 text-right border-r border-b-2 border-slate-300 dark:border-slate-700">
                    Closing / Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {allVariablesRows
                  .filter((item) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      item.group.toLowerCase().includes(q) ||
                      item.variable.toLowerCase().includes(q) ||
                      item.basis.toLowerCase().includes(q)
                    );
                  })
                  .map((item, idx) => {
                    const rowActive =
                      selectedCell.tab === 'variables-summary' && selectedCell.row === idx;
                    const highlightColor =
                      item.highlight === 'emerald'
                        ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                        : item.highlight === 'amber'
                          ? 'text-amber-700 dark:text-amber-400 font-bold'
                          : item.highlight === 'rose'
                            ? 'text-rose-700 dark:text-rose-400 font-bold'
                            : 'text-slate-900 dark:text-slate-100 font-semibold';

                    return (
                      <tr
                        key={item.id}
                        className={
                          idx % 2 === 1
                            ? 'bg-slate-50/45 dark:bg-slate-900/35'
                            : 'bg-white dark:bg-slate-950'
                        }
                      >
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 0)}
                          className={`w-[42px] min-w-[42px] ${cellPadY} text-center font-mono text-[11px] border-r border-b border-slate-200 dark:border-slate-800 sticky left-0 z-20 cursor-pointer ${
                            rowActive
                              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold'
                              : 'bg-[#f8f9fa] dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {idx + 2}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 0)}
                          className={`px-3 ${cellPadY} text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                            isCellActive('variables-summary', idx, 0)
                          )}`}
                        >
                          {item.group}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 1)}
                          className={`px-3 ${cellPadY} font-medium text-slate-900 dark:text-slate-100 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell ${cellRingClass(
                            isCellActive('variables-summary', idx, 1)
                          )}`}
                        >
                          {item.variable}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 2)}
                          className={`px-3 ${cellPadY} font-mono text-[11px] text-slate-500 dark:text-slate-400 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell ${cellRingClass(
                            isCellActive('variables-summary', idx, 2)
                          )}`}
                        >
                          {item.basis}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 3)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                            isCellActive('variables-summary', idx, 3)
                          )}`}
                        >
                          {item.prevValue}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 4)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums bg-emerald-50/20 dark:bg-emerald-950/15 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${highlightColor} ${cellRingClass(
                            isCellActive('variables-summary', idx, 4)
                          )}`}
                        >
                          {item.currValue}
                        </td>
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 5)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${highlightColor} ${cellRingClass(
                            isCellActive('variables-summary', idx, 5)
                          )}`}
                        >
                          {item.closingValue}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Google Sheets Bottom Sheet Tabs & Status Bar */}
        <div className="bg-[#f0f4f9] dark:bg-slate-900 border-t border-slate-300/90 dark:border-slate-700/90 px-2.5 pt-1 pb-1 flex flex-wrap items-center justify-between gap-2 print-hidden">
          <div className="flex items-center gap-1" role="tablist" aria-label="Balance Sheet tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'balance-sheet'}
              onClick={() => {
                setActiveTab('balance-sheet');
                setSelectedCell({ tab: 'balance-sheet', row: 0, col: 0 });
              }}
              className={`h-8 px-3 rounded-t-md text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'balance-sheet'
                  ? 'bg-white dark:bg-slate-950 text-emerald-800 dark:text-emerald-300 font-bold border border-b-2 border-slate-300/90 dark:border-slate-700 border-b-emerald-600 dark:border-b-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Balance Sheet ({shortMonthLabel})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'variables-summary'}
              onClick={() => {
                setActiveTab('variables-summary');
                setSelectedCell({ tab: 'variables-summary', row: 0, col: 4 });
              }}
              className={`h-8 px-3 rounded-t-md text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'variables-summary'
                  ? 'bg-white dark:bg-slate-950 text-emerald-800 dark:text-emerald-300 font-bold border border-b-2 border-slate-300/90 dark:border-slate-700 border-b-emerald-600 dark:border-b-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <Sigma className="w-3.5 h-3.5" />
              <span>Current Month All Variables Summary</span>
            </button>
          </div>

          {sheet && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 px-1">
              <span>
                Rows:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeTab === 'balance-sheet'
                    ? `${filteredRows.length}/${rows.length}`
                    : `${allVariablesRows.length}`}
                </strong>
              </span>
              <span className="hidden sm:inline">
                Refund Qard:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {formatMoney(sheet.thisMonthRepaidAmount, ccy)}
                </strong>
              </span>
              <span className="hidden md:inline">
                All-Time Fund:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth(nextMonthKey)}
                className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-sans font-semibold cursor-pointer"
              >
                <span>Open {nextMonthLabel}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </section>

      <BalanceSheetMemberModal
        row={inspectedMemberRow}
        rowIndex={inspectedMemberIndex}
        totalRows={filteredRows.length}
        currency={ccy}
        fullMonthLabel={fullMonthLabel}
        shortMonthLabel={shortMonthLabel}
        prevMonthLabel={prevMonthLabel}
        nextMonthLabel={nextMonthLabel}
        onClose={() => setInspectedMemberId(null)}
        onNavigateRow={(nextIdx) => {
          const nextRow = filteredRows[nextIdx];
          if (nextRow) {
            setInspectedMemberId(nextRow.userId);
            setSelectedCell({ tab: 'balance-sheet', row: nextIdx, col: 0 });
          }
        }}
        onViewMemberProfile={onViewMemberProfile}
      />
    </div>
  );
}
