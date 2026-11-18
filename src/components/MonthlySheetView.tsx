'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  Download,
  FileDown,
  FileSpreadsheet,
  Mail,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
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
import { exportMonthlySheetPdf } from '../utils/monthlySheetPdf.ts';

interface MonthlySheetViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
  onViewMemberProfile?: (userId: string) => void;
}

type SheetFilter = 'all' | 'paid' | 'due' | 'qard_hasan';
type DesktopLedgerMode = 'summary' | 'audit';
type SortField = 'serialNo' | 'name' | 'thisContrib' | 'closingContrib' | 'closingDue';
type SortDirection = 'asc' | 'desc';

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

export function MonthlySheetView({
  user,
  config,
  onViewMemberProfile,
}: MonthlySheetViewProps) {
  const t = useTranslations('MonthlySheet');
  const tCommon = useTranslations('Common');
  const queryClient = useQueryClient();

  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SheetFilter>('all');
  const [desktopMode, setDesktopMode] = useState<DesktopLedgerMode>('summary');
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'sheet'>('cards');
  const [sortField, setSortField] = useState<SortField>('serialNo');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const sheetQuery = useQuery({
    queryKey: queryKeys.dashboard.monthlySheet(selectedMonth),
    queryFn: async (): Promise<MonthlySheetData> => {
      const res = await api.getMonthlySheet(selectedMonth);
      return res.sheet;
    },
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleRefresh = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.monthlySheet(selectedMonth),
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

  const rows = sheet?.rows || [];

  const filterCounts = useMemo(() => {
    let paid = 0;
    let partial = 0;
    let pending = 0;
    let unpaid = 0;
    let qardHasan = 0;
    for (const r of rows) {
      if (r.contributionStatus === 'paid') paid += 1;
      else {
        unpaid += 1;
        if (r.contributionStatus === 'partial') partial += 1;
        else if (r.contributionStatus === 'pending') pending += 1;
      }
      if (r.hasQardHasan || r.thisMonthSummary.qardHasanAmount > 0) qardHasan += 1;
    }
    return {
      all: rows.length,
      paid,
      partial,
      pending,
      due: unpaid,
      qardHasan,
    };
  }, [rows]);

  const expectedCollection = useMemo(
    () => rows.length * (sheet?.monthlyTarget || config?.monthlyContributionAmount || 0),
    [rows.length, sheet?.monthlyTarget, config?.monthlyContributionAmount]
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
      Math.round((sheet.fundSummary.fundHeight - sheet.fundSummary.totalDueHasana) * 100) / 100
    );
  }, [sheet]);

  const handleToggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir(field === 'serialNo' || field === 'name' ? 'asc' : 'desc');
      }
    },
    [sortField]
  );

  const filteredAndSortedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (filter === 'paid' && r.contributionStatus !== 'paid') return false;
      if (filter === 'due' && r.contributionStatus === 'paid') return false;
      if (
        filter === 'qard_hasan' &&
        !r.hasQardHasan &&
        r.thisMonthSummary.qardHasanAmount <= 0
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.memberCode.toLowerCase().includes(q) ||
        r.mobile.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...matched].sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'thisContrib':
          return (a.thisMonth.contributionAmount - b.thisMonth.contributionAmount) * dir;
        case 'closingContrib':
          return (
            (a.thisMonthSummary.contributionAmount - b.thisMonthSummary.contributionAmount) * dir
          );
        case 'closingDue':
          return (a.thisMonthSummary.dueHasanaAmount - b.thisMonthSummary.dueHasanaAmount) * dir;
        case 'serialNo':
        default:
          return (a.serialNo - b.serialNo) * dir;
      }
    });
  }, [rows, filter, search, sortField, sortDir]);

  const isFiltered = filteredAndSortedRows.length !== rows.length;

  const filteredTotals = useMemo(() => {
    return filteredAndSortedRows.reduce(
      (acc, r) => {
        acc.prevContrib += r.previousSummary.contributionAmount;
        acc.prevQard += r.previousSummary.qardHasanAmount;
        acc.prevDue += r.previousSummary.dueHasanaAmount;
        acc.thisContrib += r.thisMonth.contributionAmount;
        acc.thisQard += r.thisMonth.qardHasanAmount;
        acc.thisRepaid += r.thisMonth.repaidAmount;
        acc.thisDueChange += r.thisMonth.dueChangeAmount;
        acc.closeContrib += r.thisMonthSummary.contributionAmount;
        acc.closeQard += r.thisMonthSummary.qardHasanAmount;
        acc.closeDue += r.thisMonthSummary.dueHasanaAmount;
        return acc;
      },
      {
        prevContrib: 0,
        prevQard: 0,
        prevDue: 0,
        thisContrib: 0,
        thisQard: 0,
        thisRepaid: 0,
        thisDueChange: 0,
        closeContrib: 0,
        closeQard: 0,
        closeDue: 0,
      }
    );
  }, [filteredAndSortedRows]);

  const showTransientNotice = useCallback((message: string) => {
    setExportNotice(message);
    window.setTimeout(() => {
      setExportNotice((prev) => (prev === message ? null : prev));
    }, 3200);
  }, []);

  const formatZeroSafe = useCallback(
    (amount: number, showZeroAmount = false): string => {
      if (!showZeroAmount && (!amount || Math.abs(amount) < 0.005)) {
        return t('noneDash');
      }
      return formatMoney(amount, ccy);
    },
    [ccy, t]
  );

  const renderSignedDueDelta = useCallback(
    (
      dueChange: number,
      repaidAmount: number
    ): { primary: string; secondary?: string; tone: 'emerald' | 'amber' | 'muted' } => {
      if (dueChange === 0 && repaidAmount === 0) {
        return { primary: t('noneDash'), tone: 'muted' };
      }
      if (dueChange < 0) {
        return {
          primary: `-${formatMoney(Math.abs(dueChange), ccy)}`,
          secondary:
            repaidAmount > 0
              ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) })
              : undefined,
          tone: 'emerald',
        };
      }
      if (dueChange > 0) {
        return {
          primary: `+${formatMoney(dueChange, ccy)}`,
          secondary:
            repaidAmount > 0
              ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) })
              : undefined,
          tone: 'amber',
        };
      }
      return {
        primary: formatMoney(0, ccy),
        secondary:
          repaidAmount > 0
            ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) })
            : undefined,
        tone: 'emerald',
      };
    },
    [ccy, t]
  );

  const renderStatusIndicator = useCallback(
    (row: MonthlySheetMemberRow) => {
      switch (row.contributionStatus) {
        case 'paid':
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('statusPaid')}</span>
            </span>
          );
        case 'partial':
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
              <CircleDashed className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('statusPartial')}</span>
            </span>
          );
        case 'pending':
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('statusPending')}</span>
            </span>
          );
        default:
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 whitespace-nowrap">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('statusDue')}</span>
            </span>
          );
      }
    },
    [t]
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" aria-hidden="true" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
    );
  };

  const handleExportPdf = useCallback(() => {
    if (!sheet) return;
    const filterDescriptor =
      filter === 'all' && !search.trim()
        ? undefined
        : [
            filter !== 'all' ? `Filter: ${filter.replace('_', ' ')}` : '',
            search.trim() ? `Search: "${search.trim()}"` : '',
          ]
            .filter(Boolean)
            .join(', ');

    exportMonthlySheetPdf({
      sheet,
      rows: filteredAndSortedRows,
      isFiltered,
      filterLabel: filterDescriptor,
      fundName,
      preparedBy: user,
    });
    showTransientNotice(t('pdfSuccess'));
  }, [sheet, filter, search, filteredAndSortedRows, isFiltered, fundName, user, showTransientNotice, t]);

  const handleExportCsv = useCallback(() => {
    if (!sheet) return;
    const csvRows: (string | number)[][] = [
      [fundName, '', `Monthly Financial Sheet — ${fullMonthLabel} (${sheet.month})`, '', '', `Currency: ${ccy}`, '', `Monthly Target: ${sheet.monthlyTarget}`, '', '', '', '', '', '', '', ''],
      [
        'S.N',
        'Member Name',
        'Member ID',
        'Mobile',
        'Email',
        'Contribution Status',
        `Opening Savings (${prevMonthLabel})`,
        `Opening Qard Hasana (${prevMonthLabel})`,
        `Opening Due Hasana (${prevMonthLabel})`,
        `Paid (${shortMonthLabel})`,
        `Qard Issued (${shortMonthLabel})`,
        `Repaid (${shortMonthLabel})`,
        `Due Delta (${shortMonthLabel})`,
        `Closing Savings (Rolls to ${nextMonthLabel})`,
        `Closing Qard Hasana (Rolls to ${nextMonthLabel})`,
        `Closing Due Hasana (Rolls to ${nextMonthLabel})`,
      ],
      ...filteredAndSortedRows.map((row) => [
        row.serialNo,
        row.name,
        row.memberCode,
        row.mobile,
        row.email,
        row.contributionStatus.toUpperCase(),
        row.previousSummary.contributionAmount,
        row.previousSummary.qardHasanAmount,
        row.previousSummary.dueHasanaAmount,
        row.thisMonth.contributionAmount,
        row.thisMonth.qardHasanAmount,
        row.thisMonth.repaidAmount,
        row.thisMonth.dueChangeAmount,
        row.thisMonthSummary.contributionAmount,
        row.thisMonthSummary.qardHasanAmount,
        row.thisMonthSummary.dueHasanaAmount,
      ]),
      [
        '',
        'COOPERATIVE PERIOD TOTALS',
        `${sheet.rows.length} Active Members`,
        '',
        '',
        `${filterCounts.paid}/${sheet.rows.length} Paid`,
        sheet.previousMonthSummary.contributionAmount,
        sheet.previousMonthSummary.qardHasanAmount,
        sheet.previousMonthSummary.dueHasanaAmount,
        sheet.thisMonthOnly.contributionAmount,
        sheet.thisMonthOnly.qardHasanAmount,
        sheet.thisMonthRepaidAmount,
        sheet.thisMonthOnly.dueHasanaAmount,
        sheet.thisMonthSummary.contributionAmount,
        sheet.thisMonthSummary.qardHasanAmount,
        sheet.thisMonthSummary.dueHasanaAmount,
      ],
      [
        '',
        'ALL-TIME FUND POSITION',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        `Fund Height: ${sheet.fundSummary.fundHeight}`,
        `Total Qard Issued: ${sheet.fundSummary.totalQardHasan}`,
        `Outstanding Due: ${sheet.fundSummary.totalDueHasana}`,
        `Available Liquid: ${netLiquidFund}`,
      ],
    ];

    const csv = csvRows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amanah-monthly-sheet-${sheet.month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showTransientNotice(t('csvSuccess'));
  }, [
    sheet,
    fundName,
    fullMonthLabel,
    ccy,
    prevMonthLabel,
    shortMonthLabel,
    nextMonthLabel,
    filteredAndSortedRows,
    filterCounts.paid,
    netLiquidFund,
    showTransientNotice,
    t,
  ]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!user) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {tCommon('loadingWorkspace')}
            </h2>
          </div>
        </div>
      </section>
    );
  }

  const totalColSpan = desktopMode === 'audit' ? 12 : 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* Institutional Statement Masthead & Period Command Bar */}
      <section className="monthly-sheet-printable bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{fundName}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {t('title')}
              </h2>
              <span className="text-base sm:text-lg font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                {fullMonthLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">{activeMonth}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {t('metaMonthlyTarget', {
                  amount: formatMoney(
                    sheet?.monthlyTarget || config?.monthlyContributionAmount || 5000,
                    ccy
                  ),
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {t('metaActiveMembers', { count: rows.length })}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="hidden sm:inline">
                {t('rolloverNotice', { current: shortMonthLabel, next: nextMonthLabel })}
              </span>
            </div>
          </div>

          {/* Period Selector & Official Export Actions */}
          <div className="print-hidden flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, -1))}
                aria-label={t('prevMonthAria')}
                className="px-2.5 py-2 min-h-[40px] sm:min-h-[36px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label={t('selectMonthAria')}
                className="px-2.5 py-1.5 min-h-[40px] sm:min-h-[36px] text-xs font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer tabular-nums"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLong(m)} ({m})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, 1))}
                aria-label={t('nextMonthAria')}
                className="px-2.5 py-2 min-h-[40px] sm:min-h-[36px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="px-3 py-2 min-h-[40px] sm:min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {t('currentMonthBtn')}
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!sheet || isInitialLoading}
              className="px-4 py-2 min-h-[40px] sm:min-h-[36px] rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportPdf')}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!sheet || isInitialLoading}
              className="px-3.5 py-2 min-h-[40px] sm:min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportCsv')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!sheet || isInitialLoading}
              className="hidden sm:inline-flex px-3 py-2 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('printSheet')}</span>
            </button>

            <button
              type="button"
              onClick={() => void sheetQuery.refetch()}
              disabled={isRefetching}
              aria-label={tCommon('refresh')}
              title={tCommon('refresh')}
              className="p-2 min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {exportNotice && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="print-hidden flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 pt-2 border-t border-slate-100 dark:border-slate-800"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{exportNotice}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMessage && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/35 text-xs text-rose-800 dark:text-rose-300"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void sheetQuery.refetch()}
              className="px-3 py-1.5 rounded-md border border-rose-300 dark:border-rose-800 font-medium hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer whitespace-nowrap"
            >
              {tCommon('refresh')}
            </button>
          </div>
        )}
      </section>

      {/* Main Content Area */}
      {isInitialLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton width={110} height={12} />
                <Skeleton width={150} height={24} />
                <Skeleton width="85%" height={12} />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
            <Skeleton height={36} borderRadius={6} />
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} height={42} borderRadius={6} />
            ))}
            <Skeleton height={44} borderRadius={6} />
          </div>
        </div>
      ) : sheet ? (
        <>
          {/* 4-Column Executive Financial KPI Strip (Single Flat Container, Hairline Dividers) */}
          <section className="monthly-sheet-printable bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800">
              {/* KPI 1: Monthly Collection Progress */}
              <div className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">{t('kpiCollectionTitle')}</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {collectionRatePct}%
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
                  {formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: collectionRatePct / 100 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'left center' }}
                    className="h-full w-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('kpiCollectionBreakdown', {
                    paid: filterCounts.paid,
                    unpaid: filterCounts.due,
                  })}{' '}
                  · {t('kpiCollectionOfTarget', { pct: collectionRatePct, target: formatMoney(expectedCollection, ccy) })}
                </div>
              </div>

              {/* KPI 2: Period Savings Rollover */}
              <div className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">{t('kpiRolloverTitle')}</span>
                  <span className="font-mono tabular-nums text-[11px]">{shortMonthLabel}</span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
                  {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {t('kpiRolloverEquation', {
                    prev: formatMoney(sheet.previousMonthSummary.contributionAmount, ccy),
                    curr: formatMoney(sheet.thisMonthOnly.contributionAmount, ccy),
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(nextMonthKey)}
                  className="print-hidden inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <span>{t('openNextMonth', { month: nextMonthLabel })}</span>
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>

              {/* KPI 3: Qard Hasana Activity & Closing Due */}
              <div className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">{t('kpiQardTitle')}</span>
                  <span className="font-mono tabular-nums text-[11px]">{shortMonthLabel}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-xl font-bold font-mono tabular-nums tracking-tight ${
                      sheet.thisMonthSummary.dueHasanaAmount > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)}
                  </span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {t('kpiQardSub', {
                    issued: formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy),
                    repaid: formatMoney(sheet.thisMonthRepaidAmount, ccy),
                  })}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('previousMonthSummary')}: {formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)}
                </div>
              </div>

              {/* KPI 4: Cooperative Fund Position (All-Time) */}
              <div className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">{t('kpiFundTitle')}</span>
                  <span className="text-[11px]">{t('totalLabel')}</span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 tracking-tight">
                  {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                  {t('kpiFundLiquid', { amount: formatMoney(netLiquidFund, ccy) })}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {t('totalQardIssued')}: {formatMoney(sheet.fundSummary.totalQardHasan, ccy)}
                </div>
              </div>
            </div>
          </section>

          {/* Filter, Search & Ledger View Toolbar */}
          <section className="print-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Segmented Filter Tabs */}
            <div className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 rounded-lg w-full lg:w-fit">
              {(
                [
                  { id: 'all', label: t('filterAll', { count: filterCounts.all }) },
                  { id: 'paid', label: t('filterPaid', { count: filterCounts.paid }) },
                  { id: 'due', label: t('filterDue', { count: filterCounts.due }) },
                  {
                    id: 'qard_hasan',
                    label: t('filterQardHasan', { count: filterCounts.qardHasan }),
                  },
                ] as const
              ).map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`relative px-3 py-1.5 min-h-[36px] sm:min-h-[32px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="monthly-sheet-filter-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-2xs"
                      />
                    )}
                    <span className="relative z-10 tabular-nums">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search + View Mode Controls */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchAria')}
                  className="pl-8 pr-8 py-2 min-h-[40px] sm:min-h-[36px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('clearSearchAria')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Desktop Ledger Density Toggle (Summary vs Full 3-Period Audit) */}
              <div className="hidden md:inline-flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setDesktopMode('summary')}
                  className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                    desktopMode === 'summary'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t('viewModeSummary')}
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopMode('audit')}
                  className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                    desktopMode === 'audit'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t('viewModeAudit')}
                </button>
              </div>

              {/* Mobile Cards / Ledger Switcher */}
              <div className="md:hidden inline-flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileViewMode('cards')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    mobileViewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t('viewToggleCards')}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewMode('sheet')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    mobileViewMode === 'sheet'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t('viewToggleSheet')}
                </button>
              </div>
            </div>
          </section>

          {/* Mobile Member Cards Mode (< md when selected) */}
          {mobileViewMode === 'cards' && (
            <div className="md:hidden space-y-3">
              {filteredAndSortedRows.length === 0 ? (
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('emptyTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('emptyDesc')}</p>
                  {(search || filter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setFilter('all');
                      }}
                      className="mt-2 px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      {tCommon('resetFilters')}
                    </button>
                  )}
                </section>
              ) : (
                <div className="space-y-3">
                  {filteredAndSortedRows.map((row) => {
                    const deltaInfo = renderSignedDueDelta(
                      row.thisMonth.dueChangeAmount,
                      row.thisMonth.repaidAmount
                    );
                    return (
                      <article
                        key={row.userId}
                        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden"
                      >
                        <div className="p-3.5 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs tabular-nums text-slate-400">
                                {String(row.serialNo).padStart(2, '0')}
                              </span>
                              {onViewMemberProfile ? (
                                <button
                                  type="button"
                                  onClick={() => onViewMemberProfile(row.userId)}
                                  className="text-sm font-semibold text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 truncate cursor-pointer text-left"
                                >
                                  {row.name}
                                </button>
                              ) : (
                                <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {row.name}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {row.memberCode} · {row.mobile}
                            </div>
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <div>{renderStatusIndicator(row)}</div>
                            <div className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                              {row.thisMonth.contributionAmount > 0
                                ? formatMoney(row.thisMonth.contributionAmount, ccy)
                                : row.contributionStatus === 'pending'
                                  ? formatMoney(row.contributionPendingAmount, ccy)
                                  : formatMoney(row.contributionTarget, ccy)}
                            </div>
                          </div>
                        </div>

                        {/* Clean 3-Period Accounting Grid */}
                        <div className="text-[11px] divide-y divide-slate-100 dark:divide-slate-800/80">
                          <div className="grid grid-cols-4 bg-slate-50/80 dark:bg-slate-950/60 px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">
                            <div>Period</div>
                            <div className="text-right">{t('colContribution')}</div>
                            <div className="text-right">{t('colQardHasana')}</div>
                            <div className="text-right">{t('colDueHasana')}</div>
                          </div>

                          <div className="grid grid-cols-4 px-3 py-2 items-center">
                            <div className="text-slate-600 dark:text-slate-300 font-medium">
                              {prevMonthLabel}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {formatZeroSafe(row.previousSummary.contributionAmount, true)}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {formatZeroSafe(row.previousSummary.qardHasanAmount)}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {formatZeroSafe(row.previousSummary.dueHasanaAmount)}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 px-3 py-2 items-center">
                            <div className="text-slate-600 dark:text-slate-300 font-medium">
                              {shortMonthLabel}
                            </div>
                            <div className="text-right font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                              {row.thisMonth.contributionAmount > 0
                                ? `+${formatMoney(row.thisMonth.contributionAmount, ccy)}`
                                : t('noneDash')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                              {row.thisMonth.qardHasanAmount > 0
                                ? `+${formatMoney(row.thisMonth.qardHasanAmount, ccy)}`
                                : t('noneDash')}
                            </div>
                            <div
                              className={`text-right font-mono tabular-nums ${
                                deltaInfo.tone === 'emerald'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : deltaInfo.tone === 'amber'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {deltaInfo.primary}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 px-3 py-2.5 bg-slate-50/90 dark:bg-slate-800/40 items-center font-semibold">
                            <div className="text-slate-900 dark:text-white">
                              {t('thisMonthSummary')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                              {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-900 dark:text-white">
                              {formatZeroSafe(row.thisMonthSummary.qardHasanAmount)}
                            </div>
                            <div
                              className={`text-right font-mono tabular-nums ${
                                row.thisMonthSummary.dueHasanaAmount > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {formatZeroSafe(row.thisMonthSummary.dueHasanaAmount)}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Institutional Financial Ledger Table (always visible on md+, selectable on mobile) */}
          <section
            className={`${
              mobileViewMode === 'sheet' ? 'block' : 'hidden md:block'
            } monthly-sheet-printable bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            {/* Statement Sub-Header Bar */}
            <div className="relative px-4 sm:px-5 py-3 border-b border-slate-200/90 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-950/40">
              {isRefetching && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500/20 overflow-hidden">
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                    className="h-full w-1/2 bg-emerald-600 dark:bg-emerald-400"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {t('ledgerHeading')}
                </h3>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('showingRows', {
                    shown: filteredAndSortedRows.length,
                    total: rows.length,
                  })}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="hidden xl:inline font-mono tabular-nums">
                  {prevMonthLabel} → {shortMonthLabel} → {nextMonthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(nextMonthKey)}
                  className="print-hidden inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  <span>{t('openNextMonth', { month: nextMonthLabel })}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table
                className={`w-full border-collapse text-xs ${
                  desktopMode === 'audit' ? 'min-w-[1160px]' : 'min-w-[780px]'
                }`}
              >
                <thead>
                  {/* Period Group Row (Full 3-Period Audit Mode) */}
                  {desktopMode === 'audit' && (
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px]">
                      <th
                        colSpan={3}
                        className="py-2 px-4 text-left font-semibold text-slate-600 dark:text-slate-300 bg-slate-50/90 dark:bg-slate-950/70 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-20"
                      >
                        {t('colMember')} &amp; {t('colStatus')}
                      </th>
                      <th
                        colSpan={3}
                        className="py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 bg-slate-100/70 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800"
                      >
                        <div>{t('previousMonthSummary')}</div>
                        <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                          {t('previousMonthSub', { month: prevMonthLabel })}
                        </div>
                      </th>
                      <th
                        colSpan={3}
                        className="py-2 px-3 text-center font-semibold text-sky-900 dark:text-sky-200 bg-sky-50/70 dark:bg-sky-950/25 border-r border-slate-200 dark:border-slate-800"
                      >
                        <div>{t('thisMonthGroup', { month: shortMonthLabel })}</div>
                        <div className="text-[10px] font-normal text-sky-700/80 dark:text-sky-300/75">
                          {t('thisMonthGroupSub')}
                        </div>
                      </th>
                      <th
                        colSpan={3}
                        className="py-2 px-3 text-center font-semibold text-emerald-900 dark:text-emerald-200 bg-emerald-50/75 dark:bg-emerald-950/25"
                      >
                        <div>{t('thisMonthSummary')}</div>
                        <div className="text-[10px] font-normal text-emerald-700/80 dark:text-emerald-300/75">
                          {t('thisMonthSummarySub', { month: nextMonthLabel })}
                        </div>
                      </th>
                    </tr>
                  )}

                  {/* Column Header Row */}
                  <tr className="bg-slate-50/95 dark:bg-slate-950/75 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-[11px]">
                    <th className="py-2.5 pl-4 pr-2 text-right font-semibold whitespace-nowrap w-12 sticky left-0 z-20 bg-slate-50 dark:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => handleToggleSort('serialNo')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <span>{t('colSn')}</span>
                        {renderSortIcon('serialNo')}
                      </button>
                    </th>

                    <th className="py-2.5 px-3 text-left font-semibold whitespace-nowrap min-w-[205px] sticky left-[48px] z-20 bg-slate-50 dark:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => handleToggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <span>{t('colMember')}</span>
                        {renderSortIcon('name')}
                      </button>
                    </th>

                    <th
                      className={`py-2.5 px-3 text-left font-semibold whitespace-nowrap ${
                        desktopMode === 'audit'
                          ? 'border-r border-slate-200 dark:border-slate-800'
                          : ''
                      }`}
                    >
                      {t('colStatus')}
                    </th>

                    {desktopMode === 'audit' ? (
                      <>
                        {/* Opening Columns */}
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-slate-100/40 dark:bg-slate-800/25">
                          {t('colContribution')}
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-slate-100/40 dark:bg-slate-800/25">
                          {t('colQardHasana')}
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-slate-100/40 dark:bg-slate-800/25 border-r border-slate-200 dark:border-slate-800">
                          {t('colDueHasana')}
                        </th>

                        {/* Current Month Columns */}
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-sky-50/40 dark:bg-sky-950/15">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('thisContrib')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colContribution')}</span>
                            {renderSortIcon('thisContrib')}
                          </button>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-sky-50/40 dark:bg-sky-950/15">
                          {t('colQardHasana')}
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-sky-50/40 dark:bg-sky-950/15 border-r border-slate-200 dark:border-slate-800">
                          {t('colDueDelta')}
                        </th>

                        {/* Closing Columns */}
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-emerald-50/45 dark:bg-emerald-950/15">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('closingContrib')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colContribution')}</span>
                            {renderSortIcon('closingContrib')}
                          </button>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-emerald-50/45 dark:bg-emerald-950/15">
                          {t('colQardHasana')}
                        </th>
                        <th className="py-2.5 pl-3 pr-4 text-right font-semibold whitespace-nowrap bg-emerald-50/45 dark:bg-emerald-950/15">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('closingDue')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colDueHasana')}</span>
                            {renderSortIcon('closingDue')}
                          </button>
                        </th>
                      </>
                    ) : (
                      <>
                        {/* Summary Mode Columns (Zero Horizontal Scroll on Desktop) */}
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                          {t('colPrevSavings')}
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('thisContrib')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colThisMonthContrib')}</span>
                            {renderSortIcon('thisContrib')}
                          </button>
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                          {t('colDueDelta')}
                        </th>
                        <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap bg-emerald-50/40 dark:bg-emerald-950/15">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('closingContrib')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colClosingSavings')}</span>
                            {renderSortIcon('closingContrib')}
                          </button>
                        </th>
                        <th className="py-2.5 pl-3 pr-4 text-right font-semibold whitespace-nowrap bg-emerald-50/40 dark:bg-emerald-950/15">
                          <button
                            type="button"
                            onClick={() => handleToggleSort('closingDue')}
                            className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <span>{t('colClosingDue')}</span>
                            {renderSortIcon('closingDue')}
                          </button>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredAndSortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={totalColSpan} className="py-12 px-6 text-center space-y-2">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {t('emptyTitle')}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                          {t('emptyDesc')}
                        </p>
                        {(search || filter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch('');
                              setFilter('all');
                            }}
                            className="mt-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {tCommon('resetFilters')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedRows.map((row) => {
                      const deltaInfo = renderSignedDueDelta(
                        row.thisMonth.dueChangeAmount,
                        row.thisMonth.repaidAmount
                      );
                      const isExpanded = expandedUserId === row.userId;
                      return (
                        <Fragment key={row.userId}>
                          <tr className="group hover:bg-slate-50/90 dark:hover:bg-slate-800/45 transition-colors">
                            {/* Serial Number + Expand Toggle */}
                            <td className="py-2.5 pl-3 pr-2 text-right font-mono tabular-nums text-slate-400 dark:text-slate-500 sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedUserId((prev) =>
                                    prev === row.userId ? null : row.userId
                                  )
                                }
                                aria-expanded={isExpanded}
                                aria-label={t('expandRowAria', { name: row.name })}
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                              >
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                    isExpanded ? 'rotate-0 text-emerald-600 dark:text-emerald-400' : '-rotate-90'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span>{String(row.serialNo).padStart(2, '0')}</span>
                              </button>
                            </td>

                            {/* Member Identity */}
                            <td className="py-2.5 px-3 sticky left-[48px] z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 whitespace-nowrap">
                              <div className="font-semibold text-slate-900 dark:text-white leading-snug">
                                {onViewMemberProfile ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewMemberProfile(row.userId)}
                                    className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                                  >
                                    {row.name}
                                  </button>
                                ) : (
                                  row.name
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                {row.memberCode}
                                {row.mobile && row.mobile !== '—' ? ` · ${row.mobile}` : ''}
                              </div>
                            </td>

                            {/* Status Column (Unboxed Semantic Text + Icon) */}
                            <td
                              className={`py-2.5 px-3 whitespace-nowrap ${
                                desktopMode === 'audit'
                                  ? 'border-r border-slate-200/80 dark:border-slate-800'
                                  : ''
                              }`}
                            >
                              {renderStatusIndicator(row)}
                              {row.contributionStatus === 'pending' &&
                                row.contributionPendingAmount > 0 && (
                                  <div className="text-[10px] font-mono tabular-nums text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                                    {formatMoney(row.contributionPendingAmount, ccy)}
                                  </div>
                                )}
                            </td>

                            {desktopMode === 'audit' ? (
                              <>
                                {/* Opening Balance */}
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 bg-slate-50/35 dark:bg-slate-900/40 whitespace-nowrap">
                                  {formatZeroSafe(row.previousSummary.contributionAmount, true)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums bg-slate-50/35 dark:bg-slate-900/40 whitespace-nowrap">
                                  <span
                                    className={
                                      row.previousSummary.qardHasanAmount > 0
                                        ? 'text-slate-800 dark:text-slate-200'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {formatZeroSafe(row.previousSummary.qardHasanAmount)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums bg-slate-50/35 dark:bg-slate-900/40 border-r border-slate-200/80 dark:border-slate-800 whitespace-nowrap">
                                  <span
                                    className={
                                      row.previousSummary.dueHasanaAmount > 0
                                        ? 'text-amber-700 dark:text-amber-400 font-medium'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {formatZeroSafe(row.previousSummary.dueHasanaAmount)}
                                  </span>
                                </td>

                                {/* Current Month Activity */}
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  {row.thisMonth.contributionAmount > 0 ? (
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                      +{formatMoney(row.thisMonth.contributionAmount, ccy)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600">
                                      {t('noneDash')}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  {row.thisMonth.qardHasanAmount > 0 ? (
                                    <span className="font-medium text-slate-900 dark:text-white">
                                      +{formatMoney(row.thisMonth.qardHasanAmount, ccy)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600">
                                      {t('noneDash')}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-200/80 dark:border-slate-800 whitespace-nowrap">
                                  <div
                                    className={
                                      deltaInfo.tone === 'emerald'
                                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                        : deltaInfo.tone === 'amber'
                                          ? 'font-medium text-amber-700 dark:text-amber-400'
                                          : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {deltaInfo.primary}
                                  </div>
                                  {deltaInfo.secondary && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {deltaInfo.secondary}
                                    </div>
                                  )}
                                </td>

                                {/* Closing Balance */}
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/35 dark:bg-emerald-950/10 whitespace-nowrap">
                                  {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums bg-emerald-50/35 dark:bg-emerald-950/10 whitespace-nowrap">
                                  <span
                                    className={
                                      row.thisMonthSummary.qardHasanAmount > 0
                                        ? 'font-medium text-slate-900 dark:text-white'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {formatZeroSafe(row.thisMonthSummary.qardHasanAmount)}
                                  </span>
                                </td>
                                <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums bg-emerald-50/35 dark:bg-emerald-950/10 whitespace-nowrap">
                                  <span
                                    className={
                                      row.thisMonthSummary.dueHasanaAmount > 0
                                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {formatZeroSafe(row.thisMonthSummary.dueHasanaAmount)}
                                  </span>
                                </td>
                              </>
                            ) : (
                              <>
                                {/* Summary Mode Cells */}
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {formatZeroSafe(row.previousSummary.contributionAmount, true)}
                                </td>

                                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  {row.thisMonth.contributionAmount > 0 ? (
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                      +{formatMoney(row.thisMonth.contributionAmount, ccy)}
                                    </span>
                                  ) : row.contributionStatus === 'pending' ? (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {formatMoney(row.contributionPendingAmount, ccy)}
                                    </span>
                                  ) : (
                                    <span className="text-rose-600/80 dark:text-rose-400/80">
                                      {t('dueLabel')} {formatMoney(row.contributionTarget, ccy)}
                                    </span>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  <div
                                    className={
                                      deltaInfo.tone === 'emerald'
                                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                        : deltaInfo.tone === 'amber'
                                          ? 'font-medium text-amber-700 dark:text-amber-400'
                                          : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {deltaInfo.primary}
                                  </div>
                                  {deltaInfo.secondary && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {deltaInfo.secondary}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/10 whitespace-nowrap">
                                  {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                                </td>

                                <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums bg-emerald-50/30 dark:bg-emerald-950/10 whitespace-nowrap">
                                  <span
                                    className={
                                      row.thisMonthSummary.dueHasanaAmount > 0
                                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }
                                  >
                                    {formatZeroSafe(row.thisMonthSummary.dueHasanaAmount)}
                                  </span>
                                </td>
                              </>
                            )}
                          </tr>

                          {/* Expandable Inline Accounting Reconciliation Strip */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-950/60">
                              <td colSpan={totalColSpan} className="px-4 sm:px-6 py-3.5">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center text-xs">
                                  <div className="md:col-span-4 space-y-1.5">
                                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      {t('colContact')}
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-mono text-[11px]">
                                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                      <span className="tabular-nums">{row.mobile}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-mono text-[11px] truncate">
                                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                      <span className="truncate">{row.email}</span>
                                    </div>
                                    {onViewMemberProfile && (
                                      <button
                                        type="button"
                                        onClick={() => onViewMemberProfile(row.userId)}
                                        className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                                      >
                                        <UserRound className="w-3.5 h-3.5" aria-hidden="true" />
                                        <span>{t('viewProfile')}</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
                                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                        {t('colContribution')} Reconciliation
                                      </div>
                                      <div className="font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                                        {formatMoney(row.previousSummary.contributionAmount, ccy)} +{' '}
                                        {formatMoney(row.thisMonth.contributionAmount, ccy)} ={' '}
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                          {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                                        </span>
                                      </div>
                                      {row.contributionPendingAmount > 0 && (
                                        <div className="text-[10px] font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                          {t('pendingReviewLabel')}:{' '}
                                          {formatMoney(row.contributionPendingAmount, ccy)}
                                        </div>
                                      )}
                                    </div>

                                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
                                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                        {t('colQardHasana')} Cumulative
                                      </div>
                                      <div className="font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                                        {formatMoney(row.previousSummary.qardHasanAmount, ccy)} +{' '}
                                        {formatMoney(row.thisMonth.qardHasanAmount, ccy)} ={' '}
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                          {formatMoney(row.thisMonthSummary.qardHasanAmount, ccy)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
                                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                        {t('colDueHasana')} Balance
                                      </div>
                                      <div className="font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                                        {formatMoney(row.previousSummary.dueHasanaAmount, ccy)} →{' '}
                                        <span
                                          className={
                                            row.thisMonthSummary.dueHasanaAmount > 0
                                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                                              : 'font-semibold text-emerald-700 dark:text-emerald-400'
                                          }
                                        >
                                          {formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)}
                                        </span>
                                      </div>
                                      {row.installmentDueThisMonth > 0 && (
                                        <div className="text-[10px] font-mono tabular-nums text-rose-700 dark:text-rose-400">
                                          {t('installmentDueLabel')}:{' '}
                                          {formatMoney(row.installmentDueThisMonth, ccy)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>

                {/* Accounting Reconciliation Footer */}
                <tfoot>
                  {isFiltered && filteredAndSortedRows.length > 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-800/45 text-slate-700 dark:text-slate-200 border-t border-slate-200 dark:border-slate-700 font-medium text-[11px]">
                      <td
                        colSpan={3}
                        className={`py-2.5 px-4 text-right whitespace-nowrap sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/90 ${
                          desktopMode === 'audit'
                            ? 'border-r border-slate-200 dark:border-slate-700'
                            : ''
                        }`}
                      >
                        {t('filteredSubtotal', { count: filteredAndSortedRows.length })}
                      </td>

                      {desktopMode === 'audit' ? (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatMoney(filteredTotals.prevContrib, ccy)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatZeroSafe(filteredTotals.prevQard)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            {formatZeroSafe(filteredTotals.prevDue)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            +{formatMoney(filteredTotals.thisContrib, ccy)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {filteredTotals.thisQard > 0
                              ? `+${formatMoney(filteredTotals.thisQard, ccy)}`
                              : t('noneDash')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            {
                              renderSignedDueDelta(
                                filteredTotals.thisDueChange,
                                filteredTotals.thisRepaid
                              ).primary
                            }
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatMoney(filteredTotals.closeContrib, ccy)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatZeroSafe(filteredTotals.closeQard)}
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatZeroSafe(filteredTotals.closeDue)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatMoney(filteredTotals.prevContrib, ccy)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            +{formatMoney(filteredTotals.thisContrib, ccy)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {
                              renderSignedDueDelta(
                                filteredTotals.thisDueChange,
                                filteredTotals.thisRepaid
                              ).primary
                            }
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatMoney(filteredTotals.closeContrib, ccy)}
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatZeroSafe(filteredTotals.closeDue)}
                          </td>
                        </>
                      )}
                    </tr>
                  )}

                  {/* Official Double-Ruled Cooperative Totals Row */}
                  <tr className="bg-slate-100/90 dark:bg-slate-800/80 text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                    <td
                      colSpan={3}
                      className={`py-3 px-4 text-right whitespace-nowrap sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 ${
                        desktopMode === 'audit'
                          ? 'border-r border-slate-200 dark:border-slate-700'
                          : ''
                      }`}
                    >
                      <div>{t('coopTotalsLabel', { count: rows.length })}</div>
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('thisMonthSummarySub', { month: nextMonthLabel })}
                      </div>
                    </td>

                    {desktopMode === 'audit' ? (
                      <>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatZeroSafe(sheet.previousMonthSummary.qardHasanAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          {formatZeroSafe(sheet.previousMonthSummary.dueHasanaAmount)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {sheet.thisMonthOnly.qardHasanAmount > 0
                            ? `+${formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)}`
                            : t('noneDash')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          <div
                            className={
                              sheet.thisMonthOnly.dueHasanaAmount < 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : sheet.thisMonthOnly.dueHasanaAmount > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {
                              renderSignedDueDelta(
                                sheet.thisMonthOnly.dueHasanaAmount,
                                sheet.thisMonthRepaidAmount
                              ).primary
                            }
                          </div>
                          {sheet.thisMonthRepaidAmount > 0 && (
                            <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                              {t('repaidShort', {
                                amount: formatMoney(sheet.thisMonthRepaidAmount, ccy),
                              })}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                          {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                          {formatZeroSafe(sheet.thisMonthSummary.qardHasanAmount)}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                          {formatZeroSafe(sheet.thisMonthSummary.dueHasanaAmount)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <div
                            className={
                              sheet.thisMonthOnly.dueHasanaAmount < 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : sheet.thisMonthOnly.dueHasanaAmount > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {
                              renderSignedDueDelta(
                                sheet.thisMonthOnly.dueHasanaAmount,
                                sheet.thisMonthRepaidAmount
                              ).primary
                            }
                          </div>
                          {sheet.thisMonthRepaidAmount > 0 && (
                            <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                              {t('repaidShort', {
                                amount: formatMoney(sheet.thisMonthRepaidAmount, ccy),
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                          {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                          {formatZeroSafe(sheet.thisMonthSummary.dueHasanaAmount)}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Anchored All-Time Cooperative Fund Position Strip */}
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-4 sm:px-5 py-3.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('fundSummary')}
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('fundHeight')}
                    </dt>
                    <dd className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('netLiquidFund')}
                    </dt>
                    <dd className="font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatMoney(netLiquidFund, ccy)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('totalQardIssued')}
                    </dt>
                    <dd className="font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatMoney(sheet.fundSummary.totalQardHasan, ccy)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('outstandingDue')}
                    </dt>
                    <dd className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                      {formatMoney(sheet.fundSummary.totalDueHasana, ccy)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </motion.div>
  );
}
