'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
  Landmark,
  LayoutGrid,
  Maximize,
  Minimize,
  Printer,
  RefreshCw,
  Repeat,
  ShieldAlert,
  Sigma,
  Table2,
  TrendingUp,
  Wallet,
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
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
import { exportBalanceSheetPdf } from '../utils/monthlySheetPdf.ts';
import { BalanceSheetMemberModal } from './BalanceSheetMemberModal.tsx';

interface BalanceSheetViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
  onViewMemberProfile?: (userId: string) => void;
}

type WorkbookTab = 'balance-sheet' | 'variables-summary';
type SortField =
  | 'serialNo'
  | 'name'
  | 'memberCode'
  | 'prevContrib'
  | 'prevQard'
  | 'prevDue'
  | 'currContrib'
  | 'currQard'
  | 'currRefund'
  | 'closingContrib'
  | 'closingQard'
  | 'closingDue'
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

function SheetMemberAvatar({
  name,
  photoUrl,
  size = 'sm',
}: {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const dims = size === 'md' ? 'w-8 h-8 text-[11px]' : 'w-6 h-6 text-[10px]';

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={`${name} photo`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dims} rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold flex items-center justify-center shrink-0 select-none`}
    >
      {initials || 'M'}
    </div>
  );
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
  const [freezeIdentityCols, setFreezeIdentityCols] = useState(true);
  const [mobileViewMode, setMobileViewMode] = useState<'sheet' | 'cards'>('sheet');
  const [sortField, setSortField] = useState<SortField>('serialNo');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selectedCell, setSelectedCell] = useState<SelectedCell>({
    tab: 'balance-sheet',
    row: 0,
    col: 0,
  });
  const [markedRowUserId, setMarkedRowUserId] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [inspectedMemberId, setInspectedMemberId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const fullScreenTokenRef = useRef<symbol | null>(null);
  if (!fullScreenTokenRef.current) {
    fullScreenTokenRef.current = Symbol('BalanceSheetFullScreen');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(isFullScreen);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    const selector = `[data-sheet-cell="${selectedCell.tab}:${selectedCell.row}:${selectedCell.col}"]`;
    const activeEl = container.querySelector<HTMLElement>(selector);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [selectedCell]);

  useEffect(() => {
    if (!isFullScreen || !fullScreenTokenRef.current) return;
    const token = fullScreenTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullScreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isFullScreen]);

  useEffect(() => {
    const handleShortcut = (e: globalThis.KeyboardEvent) => {
      if (inspectedMemberId) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key !== 'f' && e.key !== 'F') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setIsFullScreen((prev) => !prev);
    };

    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [inspectedMemberId]);

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
      };
    }
    const inflow = round2(sheet.thisMonthOnly.contributionAmount + sheet.thisMonthRepaidAmount);
    const outflow = round2(sheet.thisMonthOnly.qardHasanAmount);
    const netCashFlow = round2(inflow - outflow);
    return { inflow, outflow, netCashFlow };
  }, [sheet]);

  const handleToggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir(
          field === 'serialNo' || field === 'name' || field === 'memberCode' ? 'asc' : 'desc'
        );
      }
    },
    [sortField]
  );

  const filteredRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'memberCode':
          cmp = a.memberCode.localeCompare(b.memberCode);
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
  }, [rows, sortField, sortDir]);

  const inspectedMemberIndex = useMemo(() => {
    if (!inspectedMemberId) return -1;
    return filteredRows.findIndex((r) => r.userId === inspectedMemberId);
  }, [filteredRows, inspectedMemberId]);

  const inspectedMemberRow = useMemo(() => {
    if (!inspectedMemberId) return null;
    if (inspectedMemberIndex >= 0) return filteredRows[inspectedMemberIndex] ?? null;
    return rows.find((r) => r.userId === inspectedMemberId) ?? null;
  }, [filteredRows, inspectedMemberId, inspectedMemberIndex, rows]);

  const allVariablesRows = useMemo<VariableSummaryRow[]>(() => {
    if (!sheet) return [];
    const lastRowNum = Math.max(1, rows.length);
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
        basis: `=COUNTA('Balance Sheet'!A1:A${lastRowNum})`,
        prevValue: '—',
        currValue: `${rows.length} members`,
        closingValue: `${rows.length} active`,
        formula: `=COUNTA('Balance Sheet'!A1:A${lastRowNum}) → ${rows.length} active contributing members`,
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
        basis: `=COUNTIF('Balance Sheet'!M1:M${lastRowNum}, Status)`,
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
        basis: `=SUM('Balance Sheet'!C1:C${lastRowNum}) (< ${activeMonth})`,
        prevValue: fmt(sheet.previousMonthSummary.contributionAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.contributionAmount),
        formula: `=SUM(Approved Contributions before ${activeMonth}) → ${fmt(sheet.previousMonthSummary.contributionAmount)}`,
      },
      {
        id: 'curr-contrib',
        group: 'Contributions Ledger',
        variable: `Current Month Approved Contribution (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!F1:F${lastRowNum})`,
        prevValue: '—',
        currValue: `+${fmt(sheet.thisMonthOnly.contributionAmount)}`,
        closingValue: fmt(sheet.thisMonthOnly.contributionAmount),
        formula: `=SUM('Balance Sheet'!F1:F${lastRowNum}) → ${fmt(sheet.thisMonthOnly.contributionAmount)} verified in ${shortMonthLabel}`,
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
        basis: `=SUM('Balance Sheet'!D1:D${lastRowNum}) (< ${activeMonth})`,
        prevValue: fmt(sheet.previousMonthSummary.qardHasanAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.qardHasanAmount),
        formula: `=SUM(Disbursed Qard Hasan before ${activeMonth}) → ${fmt(sheet.previousMonthSummary.qardHasanAmount)}`,
      },
      {
        id: 'prev-qard-due',
        group: 'Qard Hasan & Refunds',
        variable: 'Previous Month Opening Qard Hasan Due',
        basis: `=SUM('Balance Sheet'!E1:E${lastRowNum})`,
        prevValue: fmt(sheet.previousMonthSummary.dueHasanaAmount),
        currValue: '—',
        closingValue: fmt(sheet.previousMonthSummary.dueHasanaAmount),
        formula: `=Opening Qard Due carried forward from ${prevMonthLabel} → ${fmt(sheet.previousMonthSummary.dueHasanaAmount)}`,
      },
      {
        id: 'curr-qard-drawn',
        group: 'Qard Hasan & Refunds',
        variable: `Current Month New Qard Hasan Drawn (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!G1:G${lastRowNum})`,
        prevValue: '—',
        currValue:
          sheet.thisMonthOnly.qardHasanAmount > 0
            ? `+${fmt(sheet.thisMonthOnly.qardHasanAmount)}`
            : fmt(0),
        closingValue: fmt(sheet.thisMonthOnly.qardHasanAmount),
        formula: `=SUM('Balance Sheet'!G1:G${lastRowNum}) → ${fmt(sheet.thisMonthOnly.qardHasanAmount)} disbursed in ${shortMonthLabel}`,
        highlight: sheet.thisMonthOnly.qardHasanAmount > 0 ? 'amber' : 'neutral',
      },
      {
        id: 'curr-refund-qard',
        group: 'Qard Hasan & Refunds',
        variable: `Current Month Refund Qard Hasan (${shortMonthLabel})`,
        basis: `=SUM('Balance Sheet'!H1:H${lastRowNum})`,
        prevValue: '—',
        currValue:
          sheet.thisMonthRepaidAmount > 0 ? `+${fmt(sheet.thisMonthRepaidAmount)}` : fmt(0),
        closingValue: fmt(sheet.thisMonthRepaidAmount),
        formula: `=SUM('Balance Sheet'!H1:H${lastRowNum}) → ${fmt(sheet.thisMonthRepaidAmount)} Qard Hasan refunded in ${shortMonthLabel}`,
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
        formula: `=SUM('Balance Sheet'!G1:G${lastRowNum}) → ${fmt(cashFlowMetrics.outflow)}`,
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

  const visibleVariablesRows = allVariablesRows;

  // Compute Name Box coordinate, Formula Bar expression, and plain copyable text for active cell
  const activeCellInfo = useMemo(() => {
    const fmt = (v: number) => formatMoney(v, ccy);

    if (activeTab === 'variables-summary') {
      const safeRow = Math.max(0, Math.min(visibleVariablesRows.length - 1, selectedCell.row));
      const safeCol = Math.max(0, Math.min(SUMMARY_COL_LETTERS.length - 1, selectedCell.col));
      const item = visibleVariablesRows[safeRow];
      const ref = `${SUMMARY_COL_LETTERS[safeCol]}${safeRow + 2}`;
      if (!item) {
        return { ref: 'A2', formula: 'No matching summary variables.', copyValue: '' };
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

    // Cooperative Totals row (-1)
    if (selectedCell.row === -1 && sheet) {
      const totalRowNum = filteredRows.length + 1;
      const ref = `${colLetter}${totalRowNum}`;
      const totValues: Record<number, { value: string; formula: string }> = {
        0: {
          value: `Cooperative Totals (${rows.length} Active Members)`,
          formula: `="Cooperative Period Totals (${rows.length} Active Members)"`,
        },
        1: {
          value: `${rows.length} Members`,
          formula: `=COUNTA(B1:B${rows.length})  →  ${rows.length} Active Members`,
        },
        2: {
          value: fmt(sheet.previousMonthSummary.contributionAmount),
          formula: `=SUM(C1:C${rows.length})  →  ${fmt(sheet.previousMonthSummary.contributionAmount)}`,
        },
        3: {
          value: fmt(sheet.previousMonthSummary.qardHasanAmount),
          formula: `=SUM(D1:D${rows.length})  →  ${fmt(sheet.previousMonthSummary.qardHasanAmount)}`,
        },
        4: {
          value: fmt(sheet.previousMonthSummary.dueHasanaAmount),
          formula: `=SUM(E1:E${rows.length})  →  ${fmt(sheet.previousMonthSummary.dueHasanaAmount)}`,
        },
        5: {
          value: fmt(sheet.thisMonthOnly.contributionAmount),
          formula: `=SUM(F1:F${rows.length})  →  ${fmt(sheet.thisMonthOnly.contributionAmount)} (${collectionRatePct}% of target)`,
        },
        6: {
          value: fmt(sheet.thisMonthOnly.qardHasanAmount),
          formula: `=SUM(G1:G${rows.length})  →  ${fmt(sheet.thisMonthOnly.qardHasanAmount)}`,
        },
        7: {
          value: fmt(sheet.thisMonthRepaidAmount),
          formula: `=SUM(H1:H${rows.length})  →  ${fmt(sheet.thisMonthRepaidAmount)} total Qard Hasan refunded in ${shortMonthLabel}`,
        },
        8: {
          value: fmt(sheet.thisMonthSummary.contributionAmount),
          formula: `=C${totalRowNum}+F${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.contributionAmount)}`,
        },
        9: {
          value: fmt(sheet.thisMonthSummary.qardHasanAmount),
          formula: `=D${totalRowNum}+G${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.qardHasanAmount)}`,
        },
        10: {
          value: fmt(sheet.thisMonthSummary.dueHasanaAmount),
          formula: `=E${totalRowNum}+G${totalRowNum}-H${totalRowNum}  →  ${fmt(sheet.thisMonthSummary.dueHasanaAmount)}`,
        },
        11: {
          value: `${filterCounts.paid}/${rows.length} Paid`,
          formula: `="${filterCounts.paid} of ${rows.length} Paid (${collectionRatePct}%)"`,
        },
      };
      const entry = totValues[safeCol] || totValues[0];
      return { ref, formula: entry.formula, copyValue: entry.value };
    }

    const rowIndex = Math.max(0, Math.min(filteredRows.length - 1, selectedCell.row));
    const row = filteredRows[rowIndex];
    const sheetRowNum = rowIndex + 1;
    const ref = `${colLetter}${sheetRowNum}`;

    if (!row) {
      return {
        ref: 'A1',
        formula: 'Select any cell in the Balance Sheet to inspect its formula and breakdown.',
        copyValue: '',
      };
    }

    const statusLabel =
      row.contributionStatus === 'paid'
        ? t('statusPaid')
        : row.contributionStatus === 'partial'
          ? t('statusPartial')
          : row.contributionStatus === 'pending'
            ? t('statusPending')
            : t('statusDue');

    const map: Record<number, { value: string; formula: string }> = {
      0: isFullScreen
        ? {
            value: row.name,
            formula: `="${row.name}"  // S.N ${sheetRowNum} · ${row.memberCode} · Double-click for details`,
          }
        : {
            value: row.memberCode,
            formula: `="${row.memberCode}"  // S.N ${sheetRowNum} · Member Avatar · Double-click for details`,
          },
      1: {
        value: row.memberCode,
        formula: isFullScreen
          ? `="${row.memberCode}"  // Member ID for ${row.name}`
          : `="${row.memberCode}"  // Member ID · Double-click for details`,
      },
      2: {
        value: fmt(row.previousSummary.contributionAmount),
        formula: `=SUMIFS(Contributions, Member="${row.memberCode}", Month<"${activeMonth}")  →  ${fmt(row.previousSummary.contributionAmount)}`,
      },
      3: {
        value: fmt(row.previousSummary.qardHasanAmount),
        formula: `=SUMIFS(QardDisbursed, Member="${row.memberCode}", Month<"${activeMonth}")  →  ${fmt(row.previousSummary.qardHasanAmount)}`,
      },
      4: {
        value: fmt(row.previousSummary.dueHasanaAmount),
        formula: `=OPENING_QARD_DUE("${row.memberCode}", "${prevMonthKey}")  →  ${fmt(row.previousSummary.dueHasanaAmount)}`,
      },
      5: {
        value: fmt(row.thisMonth.contributionAmount),
        formula:
          row.contributionPendingAmount > 0
            ? `=SUMIFS(Contributions, Month="${activeMonth}", Status="approved")  →  ${fmt(row.thisMonth.contributionAmount)} (+${fmt(row.contributionPendingAmount)} awaiting review)`
            : `=SUMIFS(Contributions, Month="${activeMonth}", Status="approved")  →  ${fmt(row.thisMonth.contributionAmount)} (Target: ${fmt(row.contributionTarget)})`,
      },
      6: {
        value: fmt(row.thisMonth.qardHasanAmount),
        formula: `=SUMIFS(QardDisbursed, Member="${row.memberCode}", Month="${activeMonth}")  →  ${fmt(row.thisMonth.qardHasanAmount)}`,
      },
      7: {
        value: fmt(row.thisMonth.repaidAmount),
        formula: `=SUMIFS(QardRefunds, Member="${row.memberCode}", Month="${activeMonth}")  →  ${fmt(row.thisMonth.repaidAmount)} refunded in ${shortMonthLabel}`,
      },
      8: {
        value: fmt(row.thisMonthSummary.contributionAmount),
        formula: `=C${sheetRowNum}+F${sheetRowNum}  // ${fmt(row.previousSummary.contributionAmount)} + ${fmt(row.thisMonth.contributionAmount)} = ${fmt(row.thisMonthSummary.contributionAmount)}`,
      },
      9: {
        value: fmt(row.thisMonthSummary.qardHasanAmount),
        formula: `=D${sheetRowNum}+G${sheetRowNum}  // ${fmt(row.previousSummary.qardHasanAmount)} + ${fmt(row.thisMonth.qardHasanAmount)} = ${fmt(row.thisMonthSummary.qardHasanAmount)}`,
      },
      10: {
        value: fmt(row.thisMonthSummary.dueHasanaAmount),
        formula: `=E${sheetRowNum}+G${sheetRowNum}-H${sheetRowNum}  // ${fmt(row.previousSummary.dueHasanaAmount)} + ${fmt(row.thisMonth.qardHasanAmount)} − ${fmt(row.thisMonth.repaidAmount)} = ${fmt(row.thisMonthSummary.dueHasanaAmount)}`,
      },
      11: {
        value: statusLabel,
        formula: `=IF(F${sheetRowNum}>=${row.contributionTarget},"Paid",IF(F${sheetRowNum}>0,"Partial",IF(Pending>0,"Pending","Due")))  →  ${statusLabel}`,
      },
    };

    const entry = map[safeCol] || map[0];
    return { ref, formula: entry.formula, copyValue: entry.value };
  }, [
    activeTab,
    visibleVariablesRows,
    selectedCell,
    filteredRows,
    sheet,
    ccy,
    rows.length,
    collectionRatePct,
    shortMonthLabel,
    filterCounts.paid,
    activeMonth,
    prevMonthKey,
    isFullScreen,
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
        (selectedCell.col === 0 || selectedCell.col === 1) &&
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
          const maxRow = Math.max(0, visibleVariablesRows.length - 1);
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
          if (nextRow === -1) nextRow = -1;
          else if (nextRow < maxDataIdx) nextRow += 1;
          else nextRow = -1;
        }
        if (e.key === 'ArrowUp') {
          if (nextRow === -1) nextRow = Math.max(0, maxDataIdx);
          else nextRow = Math.max(0, nextRow - 1);
        }

        return { tab: 'balance-sheet', row: nextRow, col: nextCol };
      });
    },
    [activeTab, visibleVariablesRows.length, filteredRows, inspectedMemberId, selectedCell]
  );

  const showToast = useCallback((message: string) => {
    setExportNotice(message);
    setTimeout(() => {
      setExportNotice((prev) => (prev === message ? null : prev));
    }, 3200);
  }, []);

  const handleExportPdf = useCallback(() => {
    if (!sheet) return;
    exportBalanceSheetPdf({
      sheet,
      rows: filteredRows,
      isFiltered: false,
      filterLabel: '',
      fundName,
      preparedBy: user,
    });
    showToast(t('pdfSuccess'));
  }, [sheet, filteredRows, fundName, user, showToast, t]);

  const handleExportCsv = useCallback(() => {
    if (!sheet) return;
    const headers = [
      'S.N',
      'Member Name',
      'Member ID',
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
      'Status',
    ];

    const dataRows = filteredRows.map((row, idx) => [
      idx + 1,
      row.name,
      row.memberCode,
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
      row.contributionStatus.toUpperCase(),
    ]);

    const totalsRow = [
      'TOTAL',
      `Cooperative Totals (${rows.length} Active Members)`,
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
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>{t('statusPaid')}</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{t('statusPartial')}</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{t('statusPending')}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{t('statusDue')}</span>
          </span>
        );
    }
  };

  const isCellActive = (tab: WorkbookTab, row: number, col: number) =>
    selectedCell.tab === tab && selectedCell.row === row && selectedCell.col === col;

  const cellRingClass = (active: boolean) =>
    active ? 'ring-2 ring-inset ring-emerald-500 dark:ring-emerald-400' : '';

  const cellPadY = 'py-2';

  const selectSheetCell = (tab: WorkbookTab, row: number, col: number) => {
    setSelectedCell({ tab, row, col });
  };

  const kpiSummaryStrip = sheet ? (
    <section
      aria-label="Current month balance sheet summary"
      className="balance-sheet-printable grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
    >
      <div className="amanah-card-violet border rounded-2xl p-4 flex flex-col justify-between gap-2 transition-all">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-violet-800/90 dark:text-violet-200">
            Prev. Opening Savings
          </span>
          <span className="w-7 h-7 rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300 inline-flex items-center justify-center shrink-0">
            <Landmark className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="font-mono tabular-nums text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
          Prev. Qard: {formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)} · Due:{' '}
          {formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)}
        </div>
      </div>

      <div className="amanah-card-emerald border rounded-2xl p-4 flex flex-col justify-between gap-2 transition-all">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            {shortMonthLabel} Collection
          </span>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
            <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            {collectionRatePct}%
          </span>
        </div>
        <div className="font-mono tabular-nums text-xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300">
          +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
        </div>
        <div className="space-y-1.5">
          <div
            className="h-1.5 w-full rounded-full bg-emerald-500/15 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
              style={{ width: `${collectionRatePct}%` }}
            />
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {filterCounts.paid}/{rows.length} paid · Target {formatMoney(expectedCollection, ccy)}
          </div>
        </div>
      </div>

      <div className="amanah-card-amber border rounded-2xl p-4 flex flex-col justify-between gap-2 transition-all">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            {shortMonthLabel} Qard Refund
          </span>
          <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex items-center justify-center shrink-0">
            <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="font-mono tabular-nums text-xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300">
          {sheet.thisMonthRepaidAmount > 0
            ? `+${formatMoney(sheet.thisMonthRepaidAmount, ccy)}`
            : formatMoney(0, ccy)}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
          Drawn: {formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)} · Closing Due:{' '}
          <span className="text-amber-700 dark:text-amber-300 font-bold">
            {formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)}
          </span>
        </div>
      </div>

      <div className="amanah-card-teal border rounded-2xl p-4 flex flex-col justify-between gap-2 transition-all">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-teal-800 dark:text-teal-200">
            Closing Fund &amp; Flow
          </span>
          <span className="w-7 h-7 rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 inline-flex items-center justify-center shrink-0">
            <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="font-mono tabular-nums text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
          Net:{' '}
          <span
            className={
              cashFlowMetrics.netCashFlow >= 0
                ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                : 'text-rose-700 dark:text-rose-400 font-bold'
            }
          >
            {cashFlowMetrics.netCashFlow >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(cashFlowMetrics.netCashFlow), ccy)}
          </span>{' '}
          · Liquid {formatMoney(netLiquidFund, ccy)}
        </div>
      </div>
    </section>
  ) : null;

  const workbookSection = (
    <section
      className={`relative balance-sheet-printable bg-white dark:bg-slate-950 overflow-hidden ${
        isFullScreen
          ? 'w-full h-full flex flex-col'
          : 'rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-[0_12px_36px_-14px_rgba(16,185,129,0.16)]'
      }`}
    >
      {/* 1. Period, Freeze, Export & Full Screen Controls */}
      <div className="relative z-40 shrink-0 bg-slate-50/85 dark:bg-slate-900/75 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 print-hidden">
        <div className="flex items-center gap-1.5">
          {activeTab === 'balance-sheet' && (
            <>
              <button
                type="button"
                aria-pressed={freezeIdentityCols}
                onClick={() => setFreezeIdentityCols((v) => !v)}
                title={
                  isFullScreen
                    ? 'Freeze columns A & B (Name & ID)'
                    : 'Freeze columns A & B (Photo & ID)'
                }
                className={`hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  freezeIdentityCols
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Freeze A–B</span>
              </button>

              {/* Mobile Sheet / Cards Switch */}
              <div className="inline-flex md:hidden items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMobileViewMode('sheet')}
                  className={`h-8 px-2.5 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    mobileViewMode === 'sheet'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('viewToggleSheet')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewMode('cards')}
                  className={`h-8 px-2.5 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    mobileViewMode === 'cards'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('viewToggleCards')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Month Switcher + Export Controls + Top-Right Icon-Only Full Screen Toggle */}
        <div className="flex flex-wrap items-center gap-1.5 print-hidden">
          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900 overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, -1))}
              aria-label={t('prevMonthAria')}
              className="h-8 w-8 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
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
              className="h-8 w-8 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {selectedMonth !== currentMonthKey && (
            <button
              type="button"
              onClick={() => setSelectedMonth(currentMonthKey)}
              className="h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/50 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {t('currentMonthBtn')}
            </button>
          )}

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!sheet}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50/70 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!sheet}
            className="h-8 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
          >
            <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!sheet}
            title={t('printSheet')}
            aria-label={t('printSheet')}
            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => void sheetQuery.refetch()}
            disabled={isRefetching}
            title={tCommon('refresh')}
            aria-label={tCommon('refresh')}
            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>

          {/* Icon-only Full Screen Toggle positioned at Top-Right of Sheet */}
          <div className="relative group/fs">
            <button
              type="button"
              onClick={() => setIsFullScreen((prev) => !prev)}
              aria-label={isFullScreen ? 'Exit full screen (f)' : 'Full screen (f)'}
              aria-pressed={isFullScreen}
              className={`h-8 w-8 rounded-lg inline-flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                isFullScreen
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                  : 'border border-emerald-300 dark:border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:hover:bg-emerald-600 dark:hover:text-white'
              }`}
            >
              {isFullScreen ? (
                <Minimize
                  className="w-4 h-4 transition-transform duration-150 group-hover/fs:scale-110"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              ) : (
                <Maximize
                  className="w-4 h-4 transition-transform duration-150 group-hover/fs:scale-110"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              )}
            </button>

            <div
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full mt-2 z-50 px-2.5 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium whitespace-nowrap shadow-md opacity-0 translate-y-0.5 group-hover/fs:opacity-100 group-hover/fs:translate-y-0 group-focus-within/fs:opacity-100 group-focus-within/fs:translate-y-0 transition-all duration-150"
            >
              <span
                aria-hidden="true"
                className="absolute -top-1 right-3 w-2 h-2 rotate-45 bg-slate-900 dark:bg-slate-100"
              />
              {isFullScreen ? 'Exit full screen (f)' : 'Full screen (f)'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Authentic Formula Bar (Name Box + fx) */}
      <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center h-9 print-hidden">
        <div
          title="Selected cell reference"
          className="w-[74px] shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-emerald-50/75 dark:bg-emerald-950/35 flex items-center justify-center font-mono tabular-nums text-xs font-bold text-emerald-700 dark:text-emerald-300 select-all"
        >
          {activeCellInfo.ref}
        </div>
        <div className="w-9 shrink-0 h-full border-r border-slate-200/80 dark:border-slate-800 flex items-center justify-center select-none">
          <span className="font-serif italic font-bold text-sm text-teal-600 dark:text-teal-400">
            fx
          </span>
        </div>
        <div className="flex-1 min-w-0 px-3 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-200">
          {activeCellInfo.formula}
        </div>
        <div className="shrink-0 flex items-center gap-2 pr-3 pl-2 border-l border-slate-200/80 dark:border-slate-800 h-full">
          <button
            type="button"
            onClick={() => void handleCopyActiveCell()}
            disabled={!activeCellInfo.copyValue}
            title="Copy selected cell value"
            className="h-6 px-2 rounded-md text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedCell ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" aria-hidden="true" />
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
            <div className="px-4 py-2 flex items-center justify-between gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{exportNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setExportNotice(null)}
                aria-label="Dismiss notification"
                className="text-emerald-700 dark:text-emerald-400 hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void sheetQuery.refetch()}
            className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer whitespace-nowrap shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton (Geometry-Matched Spreadsheet Rows) */}
      {isInitialLoading && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/70 grid grid-cols-6 gap-3">
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-2.5 grid grid-cols-6 gap-3 items-center">
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
            </div>
          ))}
        </div>
      )}

        {/* 4A. TAB 1: GOOGLE SHEETS BALANCE SHEET GRID */}
        {!isInitialLoading && sheet && activeTab === 'balance-sheet' && (
          <>
            {/* Mobile Cards Fallback (Only when mobile user explicitly toggles Cards) */}
            {mobileViewMode === 'cards' && (
              <div
                className={`md:hidden divide-y divide-slate-200 dark:divide-slate-800 ${
                  isFullScreen ? 'flex-1 min-h-0 overflow-y-auto' : ''
                }`}
              >
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
                  filteredRows.map((row, idx) => {
                    const isSelfRow = Boolean(user?.id && row.userId === user.id);
                    return (
                      <div
                        key={row.userId}
                        className={`p-3.5 space-y-2.5 ${
                          idx % 2 === 1
                            ? 'bg-sky-50/65 dark:bg-slate-900/75'
                            : 'bg-white dark:bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative group/avatar shrink-0">
                              {onViewMemberProfile ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsFullScreen(false);
                                      onViewMemberProfile(row.userId);
                                    }}
                                    aria-label={`${isFullScreen ? row.name : row.memberCode} — ${t('clickToVisitProfile')}`}
                                    className="block rounded-full cursor-pointer hover:ring-2 hover:ring-emerald-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-shadow"
                                  >
                                    <SheetMemberAvatar
                                      key={row.photoUrl || 'init'}
                                      name={row.name}
                                      photoUrl={row.photoUrl}
                                      size="md"
                                    />
                                  </button>
                                  <div
                                    role="tooltip"
                                    className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium whitespace-nowrap shadow-md opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 transition-opacity duration-150"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-slate-900 dark:bg-slate-100"
                                    />
                                    {t('clickToVisitProfile')}
                                  </div>
                                </>
                              ) : (
                                <div
                                  aria-label={isFullScreen ? row.name : row.memberCode}
                                  className="rounded-full"
                                >
                                  <SheetMemberAvatar
                                    key={row.photoUrl || 'init'}
                                    name={row.name}
                                    photoUrl={row.photoUrl}
                                    size="md"
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setInspectedMemberId(row.userId)}
                              className="min-w-0 text-left cursor-pointer group/name"
                            >
                              {isFullScreen ? (
                                <>
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-50 group-hover/name:text-emerald-700 dark:group-hover/name:text-emerald-400 truncate">
                                    {idx + 1}. {row.name}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                    {row.memberCode}
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-50 group-hover/name:text-emerald-700 dark:group-hover/name:text-emerald-400 truncate">
                                    {idx + 1}. {row.memberCode}
                                  </span>
                                  {isSelfRow && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                                      You
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
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
                              Closing Contrib
                            </div>
                            <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                              {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
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

            {/* Abbreviation Legend Line at Top of Sheet */}
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/50 px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                  Abbr:
                </span>
                {[
                  ['S.N', 'Serial No.'],
                  ['Prev. Cumul.', 'Previous Cumulative'],
                  ['Contrib.', 'Contribution'],
                  ['Qard', 'Qard Hasan'],
                  ['Q. Due', 'Qard Due'],
                  ['Drawn', 'Qard Drawn'],
                  ['Refund', 'Refund Qard'],
                ].map(([abbr, full], idx) => (
                  <span key={abbr} className="inline-flex items-center gap-1 whitespace-nowrap">
                    {idx > 0 && (
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700 mr-1.5">
                        ·
                      </span>
                    )}
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">
                      {abbr}
                    </strong>
                    <span className="text-slate-400 dark:text-slate-600">=</span>
                    <span>{full}</span>
                  </span>
                ))}
              </div>
              {!isFullScreen && (
                <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                  Member names visible in full screen
                </span>
              )}
            </div>

            {/* Authentic Interactive Spreadsheet Grid */}
            <div
              ref={gridContainerRef}
              tabIndex={0}
              onKeyDown={handleGridKeyDown}
              className={`${
                mobileViewMode === 'cards' ? 'hidden md:block' : 'block'
              } overflow-auto ${isFullScreen ? 'flex-1 min-h-0' : 'max-h-[68vh]'} focus:outline-none`}
            >
              <table className="w-full border-collapse text-xs select-none">
                <thead className="sticky top-0 z-30">
                  {/* Spreadsheet Column Letters Row (A .. L) */}
                  <tr className="bg-[#f8f9fa] dark:bg-slate-900 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <th
                      scope="col"
                      aria-label="Serial number column"
                      className="w-[40px] min-w-[40px] h-6 border-r border-b border-slate-200 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40"
                    />
                    {SHEET_COL_LETTERS.map((letter, colIdx) => {
                      const colActive =
                        selectedCell.tab === 'balance-sheet' && selectedCell.col === colIdx;
                      const stickyClass =
                        freezeIdentityCols && colIdx === 0
                          ? 'md:sticky md:left-[40px] md:z-40'
                          : freezeIdentityCols && colIdx === 1
                            ? `md:sticky ${
                                isFullScreen ? 'md:left-[214px]' : 'md:left-[84px]'
                              } md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600 md:shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] dark:md:shadow-[4px_0_10px_-4px_rgba(0,0,0,0.45)]`
                            : '';
                      return (
                        <th
                          key={letter}
                          scope="col"
                          colSpan={colIdx === 0 ? (isFullScreen ? 2 : 1) : 1}
                          className={`h-6 px-2 text-center font-semibold border-r border-b border-slate-200 dark:border-slate-700 ${stickyClass} ${
                            colActive
                              ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                              : 'bg-[#f8f9fa] dark:bg-slate-900'
                          }`}
                        >
                          {letter}
                        </th>
                      );
                    })}
                  </tr>

                  {/* Category Group Banner Row */}
                  <tr className="text-[11px] font-semibold tracking-tight">
                    <th
                      scope="col"
                      className="w-[40px] min-w-[40px] h-7 border-r border-b border-slate-200 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40"
                    />
                    <th
                      scope="colgroup"
                      colSpan={isFullScreen ? 3 : 2}
                      className={`h-7 px-2 text-left border-r border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${
                        freezeIdentityCols
                          ? 'md:sticky md:left-[40px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600 md:shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] dark:md:shadow-[4px_0_10px_-4px_rgba(0,0,0,0.45)]'
                          : ''
                      }`}
                    >
                      Member
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      title={`Previous Months Cumulative (${prevMonthLabel})`}
                      className="h-7 px-2 text-center border-r border-b border-slate-200 dark:border-slate-700 bg-indigo-50/85 dark:bg-indigo-950/45 text-indigo-800 dark:text-indigo-200 whitespace-nowrap"
                    >
                      Prev. Cumul. ({prevMonthLabel})
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      title={`Current Month Activity & Refund (${shortMonthLabel})`}
                      className="h-7 px-2 text-center border-r border-b border-slate-200 dark:border-slate-700 bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 whitespace-nowrap"
                    >
                      Current ({shortMonthLabel})
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      title={`Closing Summary (Rolls to ${nextMonthLabel})`}
                      className="h-7 px-2 text-center border-r border-b border-slate-200 dark:border-slate-700 bg-sky-50/90 dark:bg-sky-950/45 text-sky-900 dark:text-sky-200 whitespace-nowrap"
                    >
                      Closing (→ {nextMonthLabel})
                    </th>
                  </tr>

                  {/* Column Titles Row (S.N + Sortable A..L with distinct column header colors) */}
                  <tr className="text-[11px] font-semibold">
                    <th
                      scope="col"
                      className="w-[40px] min-w-[40px] px-1 py-2 text-center font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 sticky left-0 z-40"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('serialNo')}
                        title="Serial Number — Click to sort"
                        className="w-full inline-flex items-center justify-center font-mono font-semibold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        S.N
                      </button>
                    </th>

                    {/* A: Photo + Name (Full Screen) or Photo only (Regular View) */}
                    {isFullScreen ? (
                      <th
                        scope="col"
                        colSpan={2}
                        className={`min-w-[174px] w-[174px] px-2 py-2 text-left border-r border-b-2 border-sky-300/80 dark:border-sky-800 bg-sky-100 dark:bg-sky-950 text-sky-950 dark:text-sky-100 ${
                          freezeIdentityCols ? 'md:sticky md:left-[40px] md:z-40' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleSort('name')}
                          title="Member Name"
                          className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
                        >
                          <span>Name</span>
                          {renderSortIcon('name')}
                        </button>
                      </th>
                    ) : (
                      <th
                        scope="col"
                        colSpan={1}
                        title="Member Avatar"
                        className={`min-w-[44px] w-[44px] px-1 py-2 text-center border-r border-b-2 border-sky-300/80 dark:border-sky-800 bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 ${
                          freezeIdentityCols ? 'md:sticky md:left-[40px] md:z-40' : ''
                        }`}
                      >
                        Pic
                      </th>
                    )}

                    {/* B: ID */}
                    <th
                      scope="col"
                      className={`${
                        isFullScreen ? 'min-w-[82px] w-[82px]' : 'min-w-[92px] w-[92px]'
                      } px-2 py-2 text-left border-r border-b-2 border-indigo-300/80 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-100 ${
                        freezeIdentityCols
                          ? `md:sticky ${
                              isFullScreen ? 'md:left-[214px]' : 'md:left-[84px]'
                            } md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600 md:shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] dark:md:shadow-[4px_0_10px_-4px_rgba(0,0,0,0.45)]`
                          : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('memberCode')}
                        title="Member ID"
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                      >
                        <span>ID</span>
                        {renderSortIcon('memberCode')}
                      </button>
                    </th>

                    {/* C: Previous Cumulative — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[78px] px-2 py-2 text-right border-r border-b-2 border-blue-300/80 dark:border-blue-800 bg-blue-100/85 dark:bg-blue-950/75 text-blue-950 dark:text-blue-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevContrib')}
                        title="Previous Months Cumulative Contribution"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                      >
                        <span>Contrib.</span>
                        {renderSortIcon('prevContrib')}
                      </button>
                    </th>

                    {/* D: Previous Cumulative — Qard Hasan */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-violet-300/80 dark:border-violet-800 bg-violet-100/85 dark:bg-violet-950/75 text-violet-950 dark:text-violet-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevQard')}
                        title="Previous Months Cumulative Qard Hasan Issued"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-violet-700 dark:hover:text-violet-300 cursor-pointer"
                      >
                        <span>Qard</span>
                        {renderSortIcon('prevQard')}
                      </button>
                    </th>

                    {/* E: Previous Cumulative — Qard Due */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-amber-300/80 dark:border-amber-800 bg-amber-100/85 dark:bg-amber-950/75 text-amber-950 dark:text-amber-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('prevDue')}
                        title="Previous Months Opening Qard Hasan Due"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
                      >
                        <span>Q. Due</span>
                        {renderSortIcon('prevDue')}
                      </button>
                    </th>

                    {/* F: Current Month — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[78px] px-2 py-2 text-right border-r border-b-2 border-emerald-300/80 dark:border-emerald-800 bg-emerald-100/90 dark:bg-emerald-950/75 text-emerald-950 dark:text-emerald-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currContrib')}
                        title="Current Month Contribution"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                      >
                        <span>Contrib.</span>
                        {renderSortIcon('currContrib')}
                      </button>
                    </th>

                    {/* G: Current Month — Qard Drawn */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-rose-300/80 dark:border-rose-800 bg-rose-100/85 dark:bg-rose-950/75 text-rose-950 dark:text-rose-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currQard')}
                        title="Current Month Qard Hasan Drawn"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                      >
                        <span>Drawn</span>
                        {renderSortIcon('currQard')}
                      </button>
                    </th>

                    {/* H: Current Month — Refund Qard */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-teal-300/80 dark:border-teal-800 bg-teal-100/90 dark:bg-teal-950/80 text-teal-950 dark:text-teal-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('currRefund')}
                        title="Current Month Refund Qard Hasan"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-bold hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer"
                      >
                        <span>Refund</span>
                        {renderSortIcon('currRefund')}
                      </button>
                    </th>

                    {/* I: Closing Summary — Contribution */}
                    <th
                      scope="col"
                      className="min-w-[78px] px-2 py-2 text-right border-r border-b-2 border-cyan-300/80 dark:border-cyan-800 bg-cyan-100/85 dark:bg-cyan-950/75 text-cyan-950 dark:text-cyan-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingContrib')}
                        title="Closing Cumulative Contribution"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer"
                      >
                        <span>Contrib.</span>
                        {renderSortIcon('closingContrib')}
                      </button>
                    </th>

                    {/* J: Closing Summary — Qard Hasan */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-purple-300/80 dark:border-purple-800 bg-purple-100/85 dark:bg-purple-950/75 text-purple-950 dark:text-purple-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingQard')}
                        title="Closing Cumulative Qard Hasan"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer"
                      >
                        <span>Qard</span>
                        {renderSortIcon('closingQard')}
                      </button>
                    </th>

                    {/* K: Closing Summary — Qard Due */}
                    <th
                      scope="col"
                      className="min-w-[72px] px-2 py-2 text-right border-r border-b-2 border-orange-300/80 dark:border-orange-800 bg-orange-100/85 dark:bg-orange-950/75 text-orange-950 dark:text-orange-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('closingDue')}
                        title="Closing Outstanding Qard Hasan Due"
                        className="w-full inline-flex items-center justify-end gap-1 text-right font-semibold hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer"
                      >
                        <span>Q. Due</span>
                        {renderSortIcon('closingDue')}
                      </button>
                    </th>

                    {/* L: Closing Summary — Status */}
                    <th
                      scope="col"
                      className="min-w-[76px] px-2 py-2 text-left border-r border-b-2 border-lime-300/80 dark:border-lime-800 bg-lime-100/85 dark:bg-lime-950/70 text-lime-950 dark:text-lime-100 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSort('status')}
                        title="Current Month Payment Status"
                        className="w-full inline-flex items-center justify-between gap-1 text-left font-semibold hover:text-lime-700 dark:hover:text-lime-300 cursor-pointer"
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
                        colSpan={isFullScreen ? 14 : 13}
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
                      const isRowMarked = markedRowUserId === row.userId;
                      const isSelfRow = Boolean(user?.id && row.userId === user.id);
                      const zebraBg = isRowMarked
                        ? 'bg-emerald-100/85 dark:bg-emerald-950/70'
                        : isSelfRow
                          ? idx % 2 === 1
                            ? 'bg-emerald-50/75 dark:bg-emerald-950/40'
                            : 'bg-emerald-50/45 dark:bg-emerald-950/25'
                          : idx % 2 === 1
                            ? 'bg-sky-50/80 dark:bg-slate-900/85'
                            : 'bg-white dark:bg-slate-950';
                      const stickyBg = isRowMarked
                        ? 'bg-[#dcf3e7] dark:bg-[#0d3326] group-hover/row:bg-[#d1ecde] dark:group-hover/row:bg-[#113d2e]'
                        : isSelfRow
                          ? idx % 2 === 1
                            ? 'bg-[#e7f8f0] dark:bg-[#09271d] group-hover/row:bg-[#dcf3e7] dark:group-hover/row:bg-[#0d3326]'
                            : 'bg-[#f2fbf7] dark:bg-[#071f17] group-hover/row:bg-[#e7f8f0] dark:group-hover/row:bg-[#0b291f]'
                          : idx % 2 === 1
                            ? 'bg-[#eff7ff] dark:bg-[#10192b] group-hover/row:bg-[#e6f7f0] dark:group-hover/row:bg-[#0c261f]'
                            : 'bg-white dark:bg-slate-950 group-hover/row:bg-[#eefaf5] dark:group-hover/row:bg-[#0a231b]';
                      const avatarTooltipPos = 'left-full ml-2 top-1/2 -translate-y-1/2';
                      const avatarTooltipCaret = '-left-1 top-1/2 -translate-y-1/2';

                      return (
                        <tr
                          key={row.userId}
                          aria-selected={isRowMarked}
                          className={`group/row ${zebraBg} ${
                            isRowMarked
                              ? '[&>td]:border-b-emerald-500/60 dark:[&>td]:border-b-emerald-500/50 hover:bg-emerald-100/95 dark:hover:bg-emerald-950/80'
                              : 'hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                          } transition-colors`}
                        >
                          {/* S.N Column (starts at 1; click to mark/highlight full row) */}
                          <td
                            onClick={() => {
                              setMarkedRowUserId((prev) =>
                                prev === row.userId ? null : row.userId
                              );
                              selectSheetCell('balance-sheet', idx, 0);
                            }}
                            title={
                              isRowMarked
                                ? 'Click to clear row highlight'
                                : 'Click to highlight entire row'
                            }
                            aria-label={
                              isRowMarked
                                ? `Clear highlight for row ${idx + 1}: ${row.memberCode}`
                                : `Highlight row ${idx + 1}: ${row.memberCode}`
                            }
                            className={`w-[40px] min-w-[40px] ${cellPadY} text-center font-mono tabular-nums text-[11px] border-r border-b border-slate-200 dark:border-slate-800 sticky left-0 z-20 cursor-pointer transition-colors ${
                              isRowMarked
                                ? 'bg-emerald-700 dark:bg-emerald-600 text-white font-bold'
                                : rowActive
                                  ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 font-bold'
                                  : idx % 2 === 1
                                    ? 'bg-[#e8f1fb] dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-800 dark:hover:text-emerald-300'
                                    : 'bg-[#f8f9fa] dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-800 dark:hover:text-emerald-300'
                            }`}
                          >
                            {idx + 1}
                          </td>

                          {/* A1: Member Photo (separate cell; in regular view carries col 0 focus & border) */}
                          <td
                            data-sheet-cell={isFullScreen ? undefined : `balance-sheet:${idx}:0`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 0)}
                            onDoubleClick={
                              isFullScreen
                                ? undefined
                                : () => {
                                    selectSheetCell('balance-sheet', idx, 0);
                                    setInspectedMemberId(row.userId);
                                  }
                            }
                            className={`relative ${
                              isFullScreen
                                ? 'w-[38px] min-w-[38px] pl-2 pr-0.5 border-r-0'
                                : `w-[44px] min-w-[44px] px-2 text-center border-r border-slate-200 dark:border-slate-800 cursor-pointer ${cellRingClass(
                                    isCellActive('balance-sheet', idx, 0)
                                  )}`
                            } ${cellPadY} border-b border-slate-200 dark:border-slate-800 whitespace-nowrap hover:z-40 focus-within:z-40 ${
                              freezeIdentityCols
                                ? `md:sticky md:left-[40px] md:z-20 md:hover:z-40 md:focus-within:z-40 ${stickyBg}`
                                : ''
                            }`}
                          >
                            <div className="relative group/avatar inline-flex items-center justify-center">
                              {onViewMemberProfile ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsFullScreen(false);
                                      onViewMemberProfile(row.userId);
                                    }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    aria-label={`${
                                      isFullScreen ? row.name : row.memberCode
                                    } — ${t('clickToVisitProfile')}`}
                                    className="block rounded-full cursor-pointer hover:ring-2 hover:ring-emerald-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-shadow"
                                  >
                                    <SheetMemberAvatar
                                      key={row.photoUrl || 'init'}
                                      name={row.name}
                                      photoUrl={row.photoUrl}
                                    />
                                  </button>
                                  <div
                                    role="tooltip"
                                    className={`pointer-events-none absolute ${avatarTooltipPos} z-50 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium whitespace-nowrap shadow-md opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 transition-opacity duration-150`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`absolute ${avatarTooltipCaret} w-2 h-2 rotate-45 bg-slate-900 dark:bg-slate-100`}
                                    />
                                    {t('clickToVisitProfile')}
                                  </div>
                                </>
                              ) : (
                                <div
                                  aria-label={isFullScreen ? row.name : row.memberCode}
                                  className="rounded-full"
                                >
                                  <SheetMemberAvatar
                                    key={row.photoUrl || 'init'}
                                    name={row.name}
                                    photoUrl={row.photoUrl}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* A2: Member Name (Shown in Full Screen mode; hidden in regular view) */}
                          {isFullScreen && (
                            <td
                              data-sheet-cell={`balance-sheet:${idx}:0`}
                              onClick={() => selectSheetCell('balance-sheet', idx, 0)}
                              onDoubleClick={() => {
                                selectSheetCell('balance-sheet', idx, 0);
                                setInspectedMemberId(row.userId);
                              }}
                              className={`w-[136px] min-w-[136px] pl-1 pr-2 ${cellPadY} border-l-0 border-r border-b border-slate-200 dark:border-slate-800 cursor-pointer whitespace-nowrap ${
                                freezeIdentityCols
                                  ? `md:sticky md:left-[78px] md:z-20 ${stickyBg}`
                                  : ''
                              } ${cellRingClass(isCellActive('balance-sheet', idx, 0))}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-slate-900 dark:text-slate-50 group-hover/row:text-emerald-800 dark:group-hover/row:text-emerald-300 transition-colors truncate max-w-[96px]">
                                  {row.name}
                                </span>
                                {isSelfRow && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                                    You
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* B: Member ID (double-click to show details, with custom hover tooltip) */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:1`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 1)}
                            onDoubleClick={() => {
                              selectSheetCell('balance-sheet', idx, 1);
                              setInspectedMemberId(row.userId);
                            }}
                            className={`relative group/memberid px-2 ${cellPadY} font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 border-r border-b border-slate-200 dark:border-slate-800 cursor-pointer whitespace-nowrap hover:z-40 focus-within:z-40 ${
                              freezeIdentityCols
                                ? `md:sticky ${
                                    isFullScreen ? 'md:left-[214px]' : 'md:left-[84px]'
                                  } md:z-20 md:hover:z-40 md:focus-within:z-40 ${stickyBg} md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600 md:shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] dark:md:shadow-[4px_0_10px_-4px_rgba(0,0,0,0.45)]`
                                : ''
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 1))}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span>{row.memberCode}</span>
                              {!isFullScreen && isSelfRow && (
                                <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                                  You
                                </span>
                              )}
                            </span>
                            <div
                              role="tooltip"
                              className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-sans font-medium whitespace-nowrap shadow-md opacity-0 group-hover/memberid:opacity-100 group-focus-within/memberid:opacity-100 transition-opacity duration-150"
                            >
                              <span
                                aria-hidden="true"
                                className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-slate-900 dark:bg-slate-100"
                              />
                              {t('doubleClickToShowDetails')}
                            </div>
                          </td>

                          {/* C: Prev. Months Cumul. Contribution */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:2`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 2)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.contributionAmount > 0
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 2))}`}
                          >
                            {row.previousSummary.contributionAmount > 0
                              ? formatMoney(row.previousSummary.contributionAmount, ccy)
                              : '—'}
                          </td>

                          {/* D: Prev. Month Cumul. Qard Hasan */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:3`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 3)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.qardHasanAmount > 0
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 3))}`}
                          >
                            {row.previousSummary.qardHasanAmount > 0
                              ? formatMoney(row.previousSummary.qardHasanAmount, ccy)
                              : '—'}
                          </td>

                          {/* E: Prev. Cumul. Qard Due */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:4`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 4)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.previousSummary.dueHasanaAmount > 0
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 4))}`}
                          >
                            {row.previousSummary.dueHasanaAmount > 0
                              ? formatMoney(row.previousSummary.dueHasanaAmount, ccy)
                              : '—'}
                          </td>

                          {/* F: Current Month Contribution */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:5`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 5)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 5)
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

                          {/* G: Current Month Qard Drawn */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:6`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 6)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonth.qardHasanAmount > 0
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 6))}`}
                          >
                            {row.thisMonth.qardHasanAmount > 0
                              ? `+${formatMoney(row.thisMonth.qardHasanAmount, ccy)}`
                              : '—'}
                          </td>

                          {/* H: Current Month Refund Qard Hasan */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:7`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 7)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              isRowMarked ? '' : 'bg-emerald-50/25 dark:bg-emerald-950/15'
                            } ${
                              row.thisMonth.repaidAmount > 0
                                ? 'font-bold text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 7))}`}
                          >
                            {row.thisMonth.repaidAmount > 0
                              ? formatMoney(row.thisMonth.repaidAmount, ccy)
                              : '—'}
                          </td>

                          {/* I: Closing Cumul. Contribution */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:8`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 8)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 8)
                            )}`}
                          >
                            {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                          </td>

                          {/* J: Closing Cumul. Qard Hasan */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:9`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 9)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonthSummary.qardHasanAmount > 0
                                ? 'font-medium text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 9))}`}
                          >
                            {row.thisMonthSummary.qardHasanAmount > 0
                              ? formatMoney(row.thisMonthSummary.qardHasanAmount, ccy)
                              : '—'}
                          </td>

                          {/* K: Closing Qard Due */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:10`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 10)}
                            className={`px-2 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${
                              row.thisMonthSummary.dueHasanaAmount > 0
                                ? 'font-semibold text-amber-700 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-600'
                            } ${cellRingClass(isCellActive('balance-sheet', idx, 10))}`}
                          >
                            {row.thisMonthSummary.dueHasanaAmount > 0
                              ? formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)
                              : '—'}
                          </td>

                          {/* L: Status */}
                          <td
                            data-sheet-cell={`balance-sheet:${idx}:11`}
                            onClick={() => selectSheetCell('balance-sheet', idx, 11)}
                            className={`px-2 ${cellPadY} border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                              isCellActive('balance-sheet', idx, 11)
                            )}`}
                          >
                            {renderStatusIndicator(row.contributionStatus)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Pinned Cooperative Totals Footer */}
                <tfoot className="sticky bottom-0 z-30 shadow-[0_-4px_12px_-4px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.4)]">
                  {/* Cooperative Totals Row */}
                  <tr className="bg-[#eef3f8] dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-50">
                    <td
                      onClick={() => selectSheetCell('balance-sheet', -1, 0)}
                      className="w-[40px] min-w-[40px] py-2.5 text-center font-mono text-xs border-r border-t-2 border-slate-400/80 dark:border-slate-600 bg-emerald-700 text-white sticky left-0 z-40 cursor-pointer"
                    >
                      Σ
                    </td>
                    <td
                      colSpan={isFullScreen ? 3 : 2}
                      data-sheet-cell="balance-sheet:-1:0"
                      onClick={() => selectSheetCell('balance-sheet', -1, 0)}
                      className={`px-2 py-2.5 border-r border-t-2 border-slate-400/80 dark:border-slate-600 bg-[#eef3f8] dark:bg-slate-900 cursor-cell whitespace-nowrap ${
                        freezeIdentityCols
                          ? 'md:sticky md:left-[40px] md:z-40 md:border-r-2 md:border-r-slate-300 dark:md:border-r-slate-600 md:shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] dark:md:shadow-[4px_0_10px_-4px_rgba(0,0,0,0.45)]'
                          : ''
                      } ${cellRingClass(isCellActive('balance-sheet', -1, 0))}`}
                    >
                      Totals ({rows.length})
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:2"
                      onClick={() => selectSheetCell('balance-sheet', -1, 2)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 2)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:3"
                      onClick={() => selectSheetCell('balance-sheet', -1, 3)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 3)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:4"
                      onClick={() => selectSheetCell('balance-sheet', -1, 4)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 4)
                      )}`}
                    >
                      {formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:5"
                      onClick={() => selectSheetCell('balance-sheet', -1, 5)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 5)
                      )}`}
                    >
                      +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:6"
                      onClick={() => selectSheetCell('balance-sheet', -1, 6)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 6)
                      )}`}
                    >
                      {sheet.thisMonthOnly.qardHasanAmount > 0
                        ? `+${formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)}`
                        : '—'}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:7"
                      onClick={() => selectSheetCell('balance-sheet', -1, 7)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300 bg-[#e2f5ec] dark:bg-[#0a291f] border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 7)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthRepaidAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:8"
                      onClick={() => selectSheetCell('balance-sheet', -1, 8)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 text-emerald-900 dark:text-emerald-200 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 8)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:9"
                      onClick={() => selectSheetCell('balance-sheet', -1, 9)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 9)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.qardHasanAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:10"
                      onClick={() => selectSheetCell('balance-sheet', -1, 10)}
                      className={`px-2 py-2.5 text-right font-mono tabular-nums bg-[#eef3f8] dark:bg-slate-900 text-amber-800 dark:text-amber-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 10)
                      )}`}
                    >
                      {formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)}
                    </td>
                    <td
                      data-sheet-cell="balance-sheet:-1:11"
                      onClick={() => selectSheetCell('balance-sheet', -1, 11)}
                      className={`px-2 py-2.5 font-mono tabular-nums text-[11px] bg-[#eef3f8] dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border-r border-t-2 border-slate-400/80 dark:border-slate-600 cursor-cell whitespace-nowrap ${cellRingClass(
                        isCellActive('balance-sheet', -1, 11)
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

        {/* 4B. TAB 2: CURRENT MONTH ALL VARIABLES SUMMARY */}
        {!isInitialLoading && sheet && activeTab === 'variables-summary' && (
          <div
            ref={gridContainerRef}
            tabIndex={0}
            onKeyDown={handleGridKeyDown}
            className={`overflow-auto ${isFullScreen ? 'flex-1 min-h-0' : 'max-h-[68vh]'} focus:outline-none`}
          >
            <table className="w-full border-collapse text-xs select-none">
              <thead className="sticky top-0 z-30">
                <tr className="bg-[#f8f9fa] dark:bg-slate-900 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <th className="w-[40px] min-w-[40px] h-6 border-r border-b border-slate-200 dark:border-slate-700 bg-[#eef1f5] dark:bg-slate-800/90 sticky left-0 z-40" />
                  {SUMMARY_COL_LETTERS.map((letter, colIdx) => {
                    const colActive =
                      selectedCell.tab === 'variables-summary' && selectedCell.col === colIdx;
                    return (
                      <th
                        key={letter}
                        className={`h-6 px-2 text-center font-semibold border-r border-b border-slate-200 dark:border-slate-700 ${
                          colActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                            : 'bg-[#f8f9fa] dark:bg-slate-900'
                        }`}
                      >
                        {letter}
                      </th>
                    );
                  })}
                </tr>
                <tr className="text-[11px] font-semibold">
                  <th className="w-[40px] min-w-[40px] py-2 text-center font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 border-r border-b-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 sticky left-0 z-40">
                    1
                  </th>
                  <th className="min-w-[130px] px-2.5 py-2 text-left border-r border-b-2 border-indigo-300/80 dark:border-indigo-800 bg-indigo-100/85 dark:bg-indigo-950/75 text-indigo-950 dark:text-indigo-100 whitespace-nowrap">
                    Group
                  </th>
                  <th className="min-w-[200px] px-2.5 py-2 text-left border-r border-b-2 border-sky-300/80 dark:border-sky-800 bg-sky-100/85 dark:bg-sky-950/75 text-sky-950 dark:text-sky-100 whitespace-nowrap">
                    Variable
                  </th>
                  <th className="min-w-[180px] px-2.5 py-2 text-left border-r border-b-2 border-violet-300/80 dark:border-violet-800 bg-violet-100/85 dark:bg-violet-950/75 text-violet-950 dark:text-violet-100 whitespace-nowrap">
                    Formula / Basis
                  </th>
                  <th className="min-w-[110px] px-2.5 py-2 text-right border-r border-b-2 border-amber-300/80 dark:border-amber-800 bg-amber-100/85 dark:bg-amber-950/75 text-amber-950 dark:text-amber-100 whitespace-nowrap">
                    Prev. ({prevMonthLabel})
                  </th>
                  <th className="min-w-[120px] px-2.5 py-2 text-right border-r border-b-2 border-emerald-300/80 dark:border-emerald-800 bg-emerald-100/90 dark:bg-emerald-950/75 text-emerald-950 dark:text-emerald-100 whitespace-nowrap">
                    Curr. ({shortMonthLabel})
                  </th>
                  <th className="min-w-[120px] px-2.5 py-2 text-right border-r border-b-2 border-cyan-300/80 dark:border-cyan-800 bg-cyan-100/85 dark:bg-cyan-950/75 text-cyan-950 dark:text-cyan-100 whitespace-nowrap">
                    Closing
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleVariablesRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 px-4 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-950"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        No matching variables found
                      </p>
                      <p className="text-xs mt-1">
                        No variables available for this period.
                      </p>
                    </td>
                  </tr>
                ) : (
                  visibleVariablesRows.map((item, idx) => {
                    const prevGroup = idx > 0 ? visibleVariablesRows[idx - 1].group : item.group;
                    const isNewGroup = idx > 0 && item.group !== prevGroup;
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
                        className={`${
                          idx % 2 === 1
                            ? 'bg-sky-50/80 dark:bg-slate-900/85'
                            : 'bg-white dark:bg-slate-950'
                        } ${
                          isNewGroup
                            ? 'border-t-2 border-t-slate-300/80 dark:border-t-slate-700'
                            : ''
                        } hover:bg-emerald-50/50 dark:hover:bg-emerald-950/25 transition-colors`}
                      >
                        <td
                          onClick={() => selectSheetCell('variables-summary', idx, 0)}
                          className={`w-[40px] min-w-[40px] ${cellPadY} text-center font-mono text-[11px] border-r border-b border-slate-200 dark:border-slate-800 sticky left-0 z-20 cursor-pointer ${
                            rowActive
                              ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 font-bold'
                              : idx % 2 === 1
                                ? 'bg-[#e8f1fb] dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                : 'bg-[#f8f9fa] dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {idx + 2}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:0`}
                          onClick={() => selectSheetCell('variables-summary', idx, 0)}
                          className={`px-3 ${cellPadY} text-[11px] font-semibold text-slate-600 dark:text-slate-400 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                            isCellActive('variables-summary', idx, 0)
                          )}`}
                        >
                          {isNewGroup || idx === 0 ? item.group : ''}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:1`}
                          onClick={() => selectSheetCell('variables-summary', idx, 1)}
                          className={`px-3 ${cellPadY} font-medium text-slate-900 dark:text-slate-100 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell ${cellRingClass(
                            isCellActive('variables-summary', idx, 1)
                          )}`}
                        >
                          {item.variable}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:2`}
                          onClick={() => selectSheetCell('variables-summary', idx, 2)}
                          className={`px-3 ${cellPadY} font-mono text-[11px] text-slate-500 dark:text-slate-400 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell ${cellRingClass(
                            isCellActive('variables-summary', idx, 2)
                          )}`}
                        >
                          {item.basis}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:3`}
                          onClick={() => selectSheetCell('variables-summary', idx, 3)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${cellRingClass(
                            isCellActive('variables-summary', idx, 3)
                          )}`}
                        >
                          {item.prevValue}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:4`}
                          onClick={() => selectSheetCell('variables-summary', idx, 4)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums bg-emerald-50/20 dark:bg-emerald-950/15 border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${highlightColor} ${cellRingClass(
                            isCellActive('variables-summary', idx, 4)
                          )}`}
                        >
                          {item.currValue}
                        </td>
                        <td
                          data-sheet-cell={`variables-summary:${idx}:5`}
                          onClick={() => selectSheetCell('variables-summary', idx, 5)}
                          className={`px-3 ${cellPadY} text-right font-mono tabular-nums border-r border-b border-slate-200 dark:border-slate-800 cursor-cell whitespace-nowrap ${highlightColor} ${cellRingClass(
                            isCellActive('variables-summary', idx, 5)
                          )}`}
                        >
                          {item.closingValue}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Bottom Sheet Tabs & Status Bar */}
        <div className="shrink-0 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 print-hidden">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Balance Sheet tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'balance-sheet'}
              onClick={() => {
                setActiveTab('balance-sheet');
                setSelectedCell({ tab: 'balance-sheet', row: 0, col: 0 });
              }}
              className={`h-8 px-3 rounded-lg text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'balance-sheet'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
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
              className={`h-8 px-3 rounded-lg text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'variables-summary'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <Sigma className="w-3.5 h-3.5" aria-hidden="true" />
              <span>All Variables Summary</span>
            </button>
          </div>

          {sheet && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 px-1">
              <span>
                Rows:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeTab === 'balance-sheet'
                    ? rows.length
                    : allVariablesRows.length}
                </strong>
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">
                Refund Qard:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {formatMoney(sheet.thisMonthRepaidAmount, ccy)}
                </strong>
              </span>
              <span className="hidden md:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden md:inline">
                All-Time Fund:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                </strong>
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth(nextMonthKey)}
                className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-sans font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Open {nextMonthLabel}</span>
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>
  );

  return (
    <div className="space-y-4">
      {!isFullScreen && kpiSummaryStrip}

      {isFullScreen && mounted ? (
        <>
          <div
            aria-hidden="true"
            className="min-h-[68vh] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30"
          />
          {createPortal(
            <div
              role="region"
              aria-label="Full screen Balance Sheet"
              className="fixed inset-0 z-[60] bg-white dark:bg-slate-950 flex flex-col"
            >
              {workbookSection}
            </div>,
            document.body
          )}
        </>
      ) : (
        workbookSection
      )}

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
        onViewMemberProfile={
          onViewMemberProfile
            ? (targetId) => {
                setIsFullScreen(false);
                onViewMemberProfile(targetId);
              }
            : undefined
        }
      />
    </div>
  );
}
