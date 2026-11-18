'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type {
  FundConfig,
  MonthlySheetData,
  MonthlySheetMemberRow,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney } from '../utils/format.ts';
import { useCoopSession } from './AppProviders.tsx';

interface MonthlySheetViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
  onViewMemberProfile?: (userId: string) => void;
}

type SheetFilter = 'all' | 'paid' | 'due' | 'qard_hasan';

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

function formatSheetMonthShort(ym: string, locale: 'en' | 'bn'): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const date = new Date(Date.UTC(year, monthIdx, 1));
  if (locale === 'bn') {
    return new Intl.DateTimeFormat('bn-BD', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(date);
  }
  const mon = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .toLowerCase();
  const yy = String(year).slice(-2);
  return `${mon}-${yy}`;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const SHEET_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

export function MonthlySheetView({
  user,
  config,
  onViewMemberProfile,
}: MonthlySheetViewProps) {
  const { locale } = useCoopSession();
  const t = useTranslations('MonthlySheet');
  const tCommon = useTranslations('Common');

  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [sheet, setSheet] = useState<MonthlySheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SheetFilter>('all');
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'sheet'>('cards');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadSheet = useCallback(
    async (monthKey: string, options?: { silent?: boolean }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.getMonthlySheet(monthKey);
        setSheet(res.sheet);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [user, t]
  );

  useEffect(() => {
    void loadSheet(selectedMonth);
  }, [loadSheet, selectedMonth]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadSheet(selectedMonth, { silent: true });
    };
    window.addEventListener('amanah:refresh', handleRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleRefresh);
    };
  }, [loadSheet, selectedMonth]);

  const ccy = sheet?.currency || config?.currency || 'BDT';
  const shortMonthLabel = useMemo(
    () => formatSheetMonthShort(selectedMonth, locale),
    [selectedMonth, locale]
  );
  const prevMonthKey = sheet?.previousMonth || shiftMonthKey(selectedMonth, -1);
  const nextMonthKey = sheet?.nextMonth || shiftMonthKey(selectedMonth, 1);
  const prevMonthLabel = useMemo(
    () => formatSheetMonthShort(prevMonthKey, locale),
    [prevMonthKey, locale]
  );
  const nextMonthLabel = useMemo(
    () => formatSheetMonthShort(nextMonthKey, locale),
    [nextMonthKey, locale]
  );

  const monthOptions = useMemo(() => {
    const set = new Set<string>(sheet?.availableMonths || []);
    set.add(selectedMonth);
    set.add(getCurrentMonthKey());
    set.add(shiftMonthKey(getCurrentMonthKey(), 1));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [sheet?.availableMonths, selectedMonth]);

  const rows = sheet?.rows || [];

  const filterCounts = useMemo(() => {
    let paid = 0;
    let due = 0;
    let qardHasan = 0;
    for (const r of rows) {
      if (r.contributionStatus === 'paid') paid += 1;
      else due += 1;
      if (r.hasQardHasan || r.thisMonthSummary.qardHasanAmount > 0) qardHasan += 1;
    }
    return {
      all: rows.length,
      paid,
      due,
      qardHasan,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, filter, search]);

  const isFiltered = filteredRows.length !== rows.length;

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
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
  }, [filteredRows]);

  const renderContributionCellText = useCallback(
    (row: MonthlySheetMemberRow): string => {
      if (row.contributionStatus === 'paid') {
        return formatMoney(row.contributionAmount, ccy);
      }
      if (row.contributionStatus === 'partial') {
        return `${formatMoney(row.contributionAmount, ccy)} (${t('partialLabel')})`;
      }
      if (row.contributionStatus === 'pending') {
        return `${t('pendingLabel')} (${formatMoney(row.contributionPendingAmount, ccy)})`;
      }
      return `${t('dueLabel')} (${formatMoney(row.contributionTarget, ccy)})`;
    },
    [ccy, t]
  );

  const renderSignedDueDelta = useCallback(
    (dueChange: number, repaidAmount: number): { primary: string; secondary?: string; tone: 'emerald' | 'amber' | 'muted' } => {
      if (dueChange === 0 && repaidAmount === 0) {
        return { primary: t('noneDash'), tone: 'muted' };
      }
      if (dueChange < 0) {
        return {
          primary: `-${formatMoney(Math.abs(dueChange), ccy)}`,
          secondary: repaidAmount > 0 ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) }) : undefined,
          tone: 'emerald',
        };
      }
      if (dueChange > 0) {
        return {
          primary: `+${formatMoney(dueChange, ccy)}`,
          secondary: repaidAmount > 0 ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) }) : undefined,
          tone: 'amber',
        };
      }
      return {
        primary: formatMoney(0, ccy),
        secondary: repaidAmount > 0 ? t('repaidShort', { amount: formatMoney(repaidAmount, ccy) }) : undefined,
        tone: 'emerald',
      };
    },
    [ccy, t]
  );

  const handleExportCsv = useCallback(() => {
    if (!sheet) return;
    const csvRows: (string | number)[][] = [
      ['', `Month - ${shortMonthLabel}`, '', '', '', 'Previous month Summary', '', '', `This month (${shortMonthLabel})`, '', '', '', '', `This month summary (rolls to ${nextMonthLabel})`, '', ''],
      [
        'S.N',
        'Member name',
        'Member ID',
        'Mobile No',
        'Email',
        'Prev Contribution',
        'Prev Qard Hasana',
        'Prev Due Hasana',
        'This Month Contribution',
        'This Month Status',
        'This Month Qard Hasana',
        'This Month Repaid',
        'This Month Due Change',
        'Closing Contribution',
        'Closing Qard Hasana',
        'Closing Due Hasana',
      ],
      [
        '',
        '',
        '',
        '',
        'Previous month Summary',
        sheet.previousMonthSummary.contributionAmount,
        sheet.previousMonthSummary.qardHasanAmount,
        sheet.previousMonthSummary.dueHasanaAmount,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
      ...filteredRows.map((row) => [
        row.serialNo,
        row.name,
        row.memberCode,
        row.mobile,
        row.email,
        row.previousSummary.contributionAmount,
        row.previousSummary.qardHasanAmount,
        row.previousSummary.dueHasanaAmount,
        row.thisMonth.contributionAmount,
        row.contributionStatus === 'paid' || row.contributionStatus === 'partial'
          ? row.contributionStatus.toUpperCase()
          : row.contributionStatus === 'pending'
            ? `Pending (${row.contributionPendingAmount})`
            : `Due (${row.contributionTarget})`,
        row.thisMonth.qardHasanAmount,
        row.thisMonth.repaidAmount,
        row.thisMonth.dueChangeAmount,
        row.thisMonthSummary.contributionAmount,
        row.thisMonthSummary.qardHasanAmount,
        row.thisMonthSummary.dueHasanaAmount,
      ]),
      [
        '',
        '',
        '',
        '',
        'This month summary (previous + this month)',
        sheet.previousMonthSummary.contributionAmount,
        sheet.previousMonthSummary.qardHasanAmount,
        sheet.previousMonthSummary.dueHasanaAmount,
        sheet.thisMonthOnly.contributionAmount,
        '',
        sheet.thisMonthOnly.qardHasanAmount,
        sheet.thisMonthRepaidAmount,
        sheet.thisMonthOnly.dueHasanaAmount,
        sheet.thisMonthSummary.contributionAmount,
        sheet.thisMonthSummary.qardHasanAmount,
        sheet.thisMonthSummary.dueHasanaAmount,
      ],
      [
        '',
        '',
        '',
        '',
        'Fund summary',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        `Fund Height: ${sheet.fundSummary.fundHeight}`,
        `Total Qard Hasana: ${sheet.fundSummary.totalQardHasan}`,
        `Total Due Hasana: ${sheet.fundSummary.totalDueHasana}`,
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

    setExportNotice(t('csvSuccess'));
    window.setTimeout(() => setExportNotice(null), 3000);
  }, [sheet, shortMonthLabel, nextMonthLabel, filteredRows, t]);

  if (!user) {
    return (
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 sm:p-8">
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* Header & Toolbar */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('title')}{' '}
              <span className="font-mono tabular-nums text-sm text-emerald-700 dark:text-emerald-400">
                ({shortMonthLabel})
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('rolloverNotice', { current: shortMonthLabel, next: nextMonthLabel })}
            </p>
          </div>

          {/* Month Selector & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, -1))}
                aria-label={t('prevMonthAria')}
                className="p-2 min-h-[40px] sm:min-h-[36px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label={t('selectMonthAria')}
                className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatSheetMonthShort(m, locale)} ({m})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, 1))}
                aria-label={t('nextMonthAria')}
                className="p-2 min-h-[40px] sm:min-h-[36px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!sheet || loading}
              className="px-3.5 py-2 min-h-[40px] sm:min-h-[36px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportCsv')}</span>
            </button>

            <button
              type="button"
              onClick={() => void loadSheet(selectedMonth)}
              disabled={loading}
              className="px-3.5 py-2 min-h-[40px] sm:min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{tCommon('refresh')}</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-fit">
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
                  className={`relative px-3 py-1.5 min-h-[36px] sm:min-h-0 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="monthly-sheet-filter-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAria')}
                className="pl-8 pr-3 py-2 min-h-[40px] sm:min-h-[36px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            {/* Mobile Card/Sheet Switch */}
            <div className="md:hidden inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setMobileViewMode('cards')}
                className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  mobileViewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('viewToggleCards')}
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode('sheet')}
                className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  mobileViewMode === 'sheet'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('viewToggleSheet')}
              </button>
            </div>
          </div>
        </div>

        {exportNotice && (
          <div
            role="status"
            className="text-xs text-emerald-700 dark:text-emerald-300 font-medium"
          >
            {exportNotice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300"
          >
            {error}
          </div>
        )}
      </section>

      {/* Main Content */}
      {loading ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <Skeleton height={34} borderRadius={6} />
          <Skeleton height={36} borderRadius={6} />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={38} borderRadius={6} />
          ))}
          <Skeleton height={36} borderRadius={6} />
          <Skeleton height={36} borderRadius={6} />
        </section>
      ) : sheet ? (
        <>
          {/* Mobile Cards Mode (< md when selected) */}
          {mobileViewMode === 'cards' && (
            <div className="md:hidden space-y-3">
              {/* Mobile Top Summary Card */}
              <div className="rounded-xl border border-emerald-400/70 dark:border-emerald-700/60 bg-emerald-500/15 dark:bg-emerald-950/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    {t('previousMonthSummary')}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-900/80 dark:text-emerald-200/80">
                    {t('previousMonthSub', { month: prevMonthLabel })}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colContribution')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colQardHasana')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {sheet.previousMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colDueHasana')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {sheet.previousMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Member Cards */}
              {filteredRows.length === 0 ? (
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
                      className="mt-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      {tCommon('resetFilters')}
                    </button>
                  )}
                </section>
              ) : (
                <div className="space-y-2.5">
                  {filteredRows.map((row) => {
                    const deltaInfo = renderSignedDueDelta(
                      row.thisMonth.dueChangeAmount,
                      row.thisMonth.repaidAmount
                    );
                    return (
                      <div
                        key={row.userId}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs tabular-nums text-slate-400">
                                #{row.serialNo}
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
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {row.memberCode} · {row.mobile}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {row.email}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-mono font-semibold tabular-nums ${
                                row.contributionStatus === 'paid'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : row.contributionStatus === 'pending'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {renderContributionCellText(row)}
                            </div>
                          </div>
                        </div>

                        {/* 3-Period Per-User Ledger Grid */}
                        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 overflow-hidden text-[11px]">
                          <div className="grid grid-cols-4 bg-slate-50 dark:bg-slate-950/70 px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200/80 dark:border-slate-800">
                            <div />
                            <div className="text-right">{t('colContribution')}</div>
                            <div className="text-right">{t('colQardHasana')}</div>
                            <div className="text-right">{t('colDueHasana')}</div>
                          </div>

                          {/* Previous Month Summary */}
                          <div className="grid grid-cols-4 px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 items-center">
                            <div className="font-medium text-slate-600 dark:text-slate-300 pr-1">
                              {t('previousMonthSummary')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {formatMoney(row.previousSummary.contributionAmount, ccy)}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {row.previousSummary.qardHasanAmount > 0
                                ? formatMoney(row.previousSummary.qardHasanAmount, ccy)
                                : t('no')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {row.previousSummary.dueHasanaAmount > 0
                                ? formatMoney(row.previousSummary.dueHasanaAmount, ccy)
                                : t('no')}
                            </div>
                          </div>

                          {/* This Month Values */}
                          <div className="grid grid-cols-4 px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 items-center">
                            <div className="font-medium text-slate-600 dark:text-slate-300 pr-1">
                              {shortMonthLabel}
                            </div>
                            <div
                              className={`text-right font-mono tabular-nums font-medium ${
                                row.contributionStatus === 'paid'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : row.contributionStatus === 'pending'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {row.thisMonth.contributionAmount > 0
                                ? formatMoney(row.thisMonth.contributionAmount, ccy)
                                : row.contributionStatus === 'pending'
                                  ? t('pendingLabel')
                                  : t('dueLabel')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {row.thisMonth.qardHasanAmount > 0
                                ? `+${formatMoney(row.thisMonth.qardHasanAmount, ccy)}`
                                : t('no')}
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

                          {/* Closing This Month Summary (Next Month Opening) */}
                          <div className="grid grid-cols-4 px-2.5 py-2 bg-emerald-500/12 dark:bg-emerald-950/35 items-center font-semibold">
                            <div className="text-emerald-950 dark:text-emerald-100 pr-1">
                              {t('thisMonthSummary')}
                            </div>
                            <div className="text-right font-mono tabular-nums text-emerald-900 dark:text-emerald-200">
                              {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-900 dark:text-white">
                              {row.thisMonthSummary.qardHasanAmount > 0
                                ? formatMoney(row.thisMonthSummary.qardHasanAmount, ccy)
                                : t('no')}
                            </div>
                            <div
                              className={`text-right font-mono tabular-nums ${
                                row.thisMonthSummary.dueHasanaAmount > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {row.thisMonthSummary.dueHasanaAmount > 0
                                ? formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)
                                : t('no')}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Mobile Summary Cards */}
              <div className="rounded-xl border border-emerald-400/70 dark:border-emerald-700/60 bg-emerald-500/15 dark:bg-emerald-950/40 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                  <span>{t('thisMonthSummary')}</span>
                  <span className="text-[11px] font-normal opacity-80">
                    {t('previousPlusThisMonth')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colContribution')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colQardHasana')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {sheet.thisMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.thisMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-slate-400">{t('colDueHasana')}</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {sheet.thisMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(nextMonthKey)}
                  className="w-full py-2 px-3 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-emerald-400/50 dark:border-emerald-700/50 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{t('openNextMonth', { month: nextMonthLabel })}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {t('fundSummary')}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('fundHeight')}</div>
                    <div className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {t('colQardHasana')} ({t('totalLabel')})
                    </div>
                    <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {formatMoney(sheet.fundSummary.totalQardHasan, ccy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {t('colDueHasana')} ({t('totalLabel')})
                    </div>
                    <div className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                      {formatMoney(sheet.fundSummary.totalDueHasana, ccy)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Spreadsheet Grid View (always visible on md+, selectable on mobile) */}
          <section
            className={`${
              mobileViewMode === 'sheet' ? 'block' : 'hidden md:block'
            } bg-white dark:bg-slate-900 border border-slate-300/90 dark:border-slate-700/90 rounded-2xl overflow-hidden shadow-xs`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse text-xs">
                <thead>
                  {/* Spreadsheet Column Letters A - L */}
                  <tr className="bg-slate-100/95 dark:bg-slate-950 text-[11px] font-mono text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-slate-700/80 select-none">
                    {SHEET_COL_LETTERS.map((letter, idx) => (
                      <th
                        key={letter}
                        className={`py-1 px-2.5 text-center font-medium ${
                          idx < SHEET_COL_LETTERS.length - 1
                            ? 'border-r border-slate-200 dark:border-slate-800'
                            : ''
                        } ${idx === 0 ? 'w-11 sticky left-0 z-20 bg-slate-100 dark:bg-slate-950' : ''} ${
                          idx === 1 ? 'sticky left-[44px] z-20 bg-slate-100 dark:bg-slate-950' : ''
                        }`}
                      >
                        {letter}
                      </th>
                    ))}
                  </tr>

                  {/* Row 1: Month - nov-26 + Continuity Link */}
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <td className="py-2 px-2.5 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-10 bg-white dark:bg-slate-900" />
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800 whitespace-nowrap sticky left-[44px] z-10 bg-white dark:bg-slate-900">
                      {t('monthPrefix', { month: shortMonthLabel })}
                    </td>
                    <td
                      colSpan={10}
                      className="py-2 px-3 text-right"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedMonth(nextMonthKey)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <span>{t('openNextMonth', { month: nextMonthLabel })}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>

                  {/* Row 2: Section Group Headers */}
                  <tr className="border-b border-slate-300 dark:border-slate-700 text-[11px]">
                    <th
                      colSpan={2}
                      className="py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/90 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-20"
                    >
                      {t('colMember')}
                    </th>
                    <th className="py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/90 border-r border-slate-300 dark:border-slate-700">
                      {t('colContact')}
                    </th>
                    <th
                      colSpan={3}
                      className="py-2 px-3 text-center font-semibold bg-emerald-500/15 dark:bg-emerald-900/30 text-emerald-950 dark:text-emerald-100 border-r border-emerald-400/50 dark:border-emerald-700/60"
                    >
                      <div>{t('previousMonthSummary')}</div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('previousMonthSub', { month: prevMonthLabel })}
                      </div>
                    </th>
                    <th
                      colSpan={3}
                      className="py-2 px-3 text-center font-semibold bg-slate-100/90 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700"
                    >
                      <div>{t('thisMonthGroup', { month: shortMonthLabel })}</div>
                      <div className="text-[10px] font-normal opacity-75">
                        {t('thisMonthGroupSub')}
                      </div>
                    </th>
                    <th
                      colSpan={3}
                      className="py-2 px-3 text-center font-semibold bg-emerald-500/20 dark:bg-emerald-600/25 text-emerald-950 dark:text-emerald-100"
                    >
                      <div>{t('thisMonthSummary')}</div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('thisMonthSummarySub', { month: nextMonthLabel })}
                      </div>
                    </th>
                  </tr>

                  {/* Row 3: Individual Column Headers */}
                  <tr className="bg-slate-50 dark:bg-slate-950/80 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap w-11 sticky left-0 z-20 bg-slate-50 dark:bg-slate-950">
                      {t('colSn')}
                    </th>
                    <th className="py-2 px-3 text-left font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap min-w-[165px] sticky left-[44px] z-20 bg-slate-50 dark:bg-slate-950">
                      {t('colMemberName')} / {t('colMemberId')}
                    </th>
                    <th className="py-2 px-3 text-left font-semibold border-r border-slate-300 dark:border-slate-700 whitespace-nowrap min-w-[170px]">
                      {t('colMobileNo')} / {t('colEmail')}
                    </th>

                    {/* Previous Month Summary Sub-headers */}
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap bg-emerald-50/60 dark:bg-emerald-950/20">
                      {t('colContribution')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap bg-emerald-50/60 dark:bg-emerald-950/20">
                      {t('colQardHasana')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-emerald-300 dark:border-emerald-800 whitespace-nowrap bg-emerald-50/60 dark:bg-emerald-950/20">
                      {t('colDueHasana')}
                    </th>

                    {/* This Month Sub-headers */}
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colContribution')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colQardHasana')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                      {t('colDueDelta')}
                    </th>

                    {/* This Month Summary Sub-headers */}
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap bg-emerald-50/75 dark:bg-emerald-950/25">
                      {t('colContribution')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap bg-emerald-50/75 dark:bg-emerald-950/25">
                      {t('colQardHasana')}
                    </th>
                    <th className="py-2 px-2.5 text-right font-semibold whitespace-nowrap bg-emerald-50/75 dark:bg-emerald-950/25">
                      {t('colDueHasana')}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Top Green Summary Band: Previous month Summary (Co-op Total) */}
                  <tr className="bg-emerald-500/20 dark:bg-emerald-600/25 text-emerald-950 dark:text-emerald-100 border-b-2 border-emerald-500/60 dark:border-emerald-500/50 font-semibold">
                    <td className="py-2.5 px-2.5 border-r border-emerald-400/40 dark:border-emerald-700/50 sticky left-0 z-10 bg-emerald-100 dark:bg-emerald-950" />
                    <td
                      colSpan={2}
                      className="py-2.5 px-3 text-right border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap"
                    >
                      {t('previousMonthSummary')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {sheet.previousMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-500/50 dark:border-emerald-600/60 whitespace-nowrap">
                      {sheet.previousMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </td>
                    <td
                      colSpan={6}
                      className="py-2.5 px-3 text-right text-[11px] font-normal opacity-80 whitespace-nowrap"
                    >
                      {t('previousMonthSub', { month: prevMonthLabel })}
                    </td>
                  </tr>

                  {/* Member Data Rows */}
                  {filteredRows.length === 0 ? (
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <td colSpan={12} className="py-10 px-4 text-center space-y-2">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {t('emptyTitle')}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('emptyDesc')}
                        </p>
                        {(search || filter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch('');
                              setFilter('all');
                            }}
                            className="mt-1 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {tCommon('resetFilters')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const deltaInfo = renderSignedDueDelta(
                        row.thisMonth.dueChangeAmount,
                        row.thisMonth.repaidAmount
                      );
                      return (
                        <tr
                          key={row.userId}
                          className="group border-b border-slate-200/90 dark:border-slate-800 hover:bg-emerald-50/35 dark:hover:bg-slate-800/45 transition-colors"
                        >
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-emerald-50/90 dark:group-hover:bg-slate-800">
                            {row.serialNo}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap sticky left-[44px] z-10 bg-white dark:bg-slate-900 group-hover:bg-emerald-50/90 dark:group-hover:bg-slate-800">
                            <div className="font-medium text-slate-900 dark:text-white">
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
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {row.memberCode}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                            <div className="tabular-nums text-[11px]">{row.mobile}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {row.email}
                            </div>
                          </td>

                          {/* Previous Month Summary (User Opening) */}
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-950/10 whitespace-nowrap">
                            {formatMoney(row.previousSummary.contributionAmount, ccy)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-950/10 whitespace-nowrap">
                            {row.previousSummary.qardHasanAmount > 0 ? (
                              <span className="text-slate-900 dark:text-white">
                                {formatMoney(row.previousSummary.qardHasanAmount, ccy)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">{t('no')}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/30 dark:bg-emerald-950/10 whitespace-nowrap">
                            {row.previousSummary.dueHasanaAmount > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                {formatMoney(row.previousSummary.dueHasanaAmount, ccy)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">{t('no')}</span>
                            )}
                          </td>

                          {/* This Month Values */}
                          <td
                            className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-medium border-r border-slate-200 dark:border-slate-800 whitespace-nowrap ${
                              row.contributionStatus === 'paid'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : row.contributionStatus === 'pending'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {renderContributionCellText(row)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            {row.thisMonth.qardHasanAmount > 0 ? (
                              <span className="font-medium text-slate-900 dark:text-white">
                                +{formatMoney(row.thisMonth.qardHasanAmount, ccy)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">{t('no')}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                            <div
                              className={
                                deltaInfo.tone === 'emerald'
                                  ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                  : deltaInfo.tone === 'amber'
                                    ? 'font-medium text-amber-700 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
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

                          {/* This Month Summary (Previous + This Month -> Next Month Opening) */}
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-800 dark:text-emerald-300 border-r border-slate-200 dark:border-slate-800 bg-emerald-50/45 dark:bg-emerald-950/15 whitespace-nowrap">
                            {formatMoney(row.thisMonthSummary.contributionAmount, ccy)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 bg-emerald-50/45 dark:bg-emerald-950/15 whitespace-nowrap">
                            {row.thisMonthSummary.qardHasanAmount > 0 ? (
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {formatMoney(row.thisMonthSummary.qardHasanAmount, ccy)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">{t('no')}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums bg-emerald-50/45 dark:bg-emerald-950/15 whitespace-nowrap">
                            {row.thisMonthSummary.dueHasanaAmount > 0 ? (
                              <span className="font-semibold text-amber-700 dark:text-amber-400">
                                {formatMoney(row.thisMonthSummary.dueHasanaAmount, ccy)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">{t('no')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Filtered Subtotal Row (only when filtered to fewer than all active members) */}
                  {isFiltered && filteredRows.length > 0 && (
                    <tr className="bg-slate-100/80 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-t border-slate-300 dark:border-slate-700 font-medium text-[11px]">
                      <td className="py-2 px-2.5 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-10 bg-slate-100 dark:bg-slate-800" />
                      <td
                        colSpan={2}
                        className="py-2 px-3 text-right border-r border-slate-300 dark:border-slate-700 whitespace-nowrap"
                      >
                        {t('filteredSubtotal', { count: filteredRows.length })}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {formatMoney(filteredTotals.prevContrib, ccy)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {filteredTotals.prevQard > 0 ? formatMoney(filteredTotals.prevQard, ccy) : t('no')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                        {filteredTotals.prevDue > 0 ? formatMoney(filteredTotals.prevDue, ccy) : t('no')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {formatMoney(filteredTotals.thisContrib, ccy)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {filteredTotals.thisQard > 0 ? `+${formatMoney(filteredTotals.thisQard, ccy)}` : t('no')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-300 dark:border-slate-700 whitespace-nowrap">
                        {renderSignedDueDelta(filteredTotals.thisDueChange, filteredTotals.thisRepaid).primary}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {formatMoney(filteredTotals.closeContrib, ccy)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {filteredTotals.closeQard > 0 ? formatMoney(filteredTotals.closeQard, ccy) : t('no')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {filteredTotals.closeDue > 0 ? formatMoney(filteredTotals.closeDue, ccy) : t('no')}
                      </td>
                    </tr>
                  )}

                  {/* Bottom Green Summary Band: This month summary (previous + this month) */}
                  <tr className="bg-emerald-500/20 dark:bg-emerald-600/25 text-emerald-950 dark:text-emerald-100 border-y-2 border-emerald-500/60 dark:border-emerald-500/50 font-semibold">
                    <td className="py-2.5 px-2.5 border-r border-emerald-400/40 dark:border-emerald-700/50 sticky left-0 z-10 bg-emerald-100 dark:bg-emerald-950" />
                    <td
                      colSpan={2}
                      className="py-2.5 px-3 text-right border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap"
                    >
                      <div>{t('thisMonthSummary')}</div>
                      <div className="text-[10px] font-normal opacity-80">
                        {isFiltered ? t('coopTotalsLabel') : t('previousPlusThisMonth')}
                      </div>
                    </td>

                    {/* Previous Month Totals */}
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {sheet.previousMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-500/50 dark:border-emerald-600/60 whitespace-nowrap">
                      {sheet.previousMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </td>

                    {/* This Month Only Totals */}
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      +{formatMoney(sheet.thisMonthOnly.contributionAmount, ccy)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {sheet.thisMonthOnly.qardHasanAmount > 0
                        ? `+${formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)}`
                        : t('no')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-500/50 dark:border-emerald-600/60 whitespace-nowrap">
                      <div>
                        {
                          renderSignedDueDelta(
                            sheet.thisMonthOnly.dueHasanaAmount,
                            sheet.thisMonthRepaidAmount
                          ).primary
                        }
                      </div>
                      {sheet.thisMonthRepaidAmount > 0 && (
                        <div className="text-[10px] font-normal opacity-80">
                          {t('repaidShort', {
                            amount: formatMoney(sheet.thisMonthRepaidAmount, ccy),
                          })}
                        </div>
                      )}
                    </td>

                    {/* Closing This Month Summary Totals (Previous + This Month -> Next Month) */}
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      <div>{formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}</div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {sheet.thisMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.thisMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {sheet.thisMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </td>
                  </tr>

                  {/* Bottom Row: Fund summary (Fund Height | Total Qard Hasana | Total Due Hasana) */}
                  <tr className="bg-slate-50/95 dark:bg-slate-950/90 text-slate-900 dark:text-white font-semibold">
                    <td className="py-3 px-2.5 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-10 bg-slate-50 dark:bg-slate-950" />
                    <td
                      colSpan={8}
                      className="py-3 px-3 text-right border-r border-slate-300 dark:border-slate-700 whitespace-nowrap"
                    >
                      {t('fundSummary')}
                    </td>
                    <td className="py-3 px-2.5 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('fundHeight')}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('totalLabel')}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(sheet.fundSummary.totalQardHasan, ccy)}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('totalLabel')}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                        {formatMoney(sheet.fundSummary.totalDueHasana, ccy)}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </motion.div>
  );
}
