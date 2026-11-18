'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
    async (monthKey: string) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.getMonthlySheet(monthKey);
        setSheet(res.sheet);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [user, t]
  );

  useEffect(() => {
    void loadSheet(selectedMonth);
  }, [loadSheet, selectedMonth]);

  const ccy = sheet?.currency || config?.currency || 'BDT';
  const shortMonthLabel = useMemo(
    () => formatSheetMonthShort(selectedMonth, locale),
    [selectedMonth, locale]
  );

  const monthOptions = useMemo(() => {
    const set = new Set<string>(sheet?.availableMonths || []);
    set.add(selectedMonth);
    set.add(getCurrentMonthKey());
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
      if (r.hasQardHasan) qardHasan += 1;
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
      if (filter === 'qard_hasan' && !r.hasQardHasan) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.memberCode.toLowerCase().includes(q) ||
        r.mobile.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

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

  const handleExportCsv = useCallback(() => {
    if (!sheet) return;
    const csvRows: (string | number)[][] = [
      ['', `Month - ${shortMonthLabel}`, '', '', '', '', '', ''],
      [
        'S.N',
        'Member name',
        'Member ID',
        'Mobile No',
        'Email',
        'Contribution',
        'Qard Hasana',
        'Due Hasana',
      ],
      [
        '',
        '',
        '',
        '',
        'Previous month Summary',
        sheet.previousMonthSummary.contributionAmount,
        sheet.previousMonthSummary.qardHasanAmount > 0
          ? sheet.previousMonthSummary.qardHasanAmount
          : 'No',
        sheet.previousMonthSummary.dueHasanaAmount > 0
          ? sheet.previousMonthSummary.dueHasanaAmount
          : 'No',
      ],
      ...filteredRows.map((row) => [
        row.serialNo,
        row.name,
        row.memberCode,
        row.mobile,
        row.email,
        row.contributionStatus === 'paid' || row.contributionStatus === 'partial'
          ? row.contributionAmount
          : row.contributionStatus === 'pending'
            ? `Pending (${row.contributionPendingAmount})`
            : `Due (${row.contributionTarget})`,
        row.hasQardHasan ? `Yes (${row.qardHasanAmount})` : 'No',
        row.dueHasanaAmount > 0 ? row.dueHasanaAmount : 'No',
      ]),
      [
        '',
        '',
        '',
        '',
        'This month summary',
        sheet.thisMonthSummary.contributionAmount,
        sheet.thisMonthSummary.qardHasanAmount > 0
          ? sheet.thisMonthSummary.qardHasanAmount
          : 'No',
        sheet.thisMonthSummary.dueHasanaAmount > 0
          ? sheet.thisMonthSummary.dueHasanaAmount
          : 'No',
      ],
      [
        '',
        '',
        '',
        '',
        'Fund summary',
        `Fund Height: ${sheet.fundSummary.fundHeight}`,
        `Total: ${sheet.fundSummary.totalQardHasan}`,
        `Total: ${sheet.fundSummary.totalDueHasana}`,
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
  }, [sheet, shortMonthLabel, filteredRows, t]);

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
              {/* Mobile Summary Cards */}
              <div className="grid grid-cols-1 gap-2.5">
                <div className="rounded-xl border border-emerald-400/70 dark:border-emerald-700/60 bg-emerald-500/15 dark:bg-emerald-950/40 p-3.5 space-y-2">
                  <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    {t('previousMonthSummary')}
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
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {filteredRows.map((row) => (
                    <div key={row.userId} className="p-3.5 space-y-2.5">
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
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('colQardHasana')}:{' '}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-white">
                            {row.hasQardHasan
                              ? `${t('yes')} (${formatMoney(row.qardHasanAmount, ccy)})`
                              : t('no')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('colDueHasana')}:{' '}
                          </span>
                          <span
                            className={`font-mono font-medium tabular-nums ${
                              row.dueHasanaAmount > 0
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {row.dueHasanaAmount > 0
                              ? formatMoney(row.dueHasanaAmount, ccy)
                              : t('no')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Mobile Summary Cards */}
              <div className="rounded-xl border border-emerald-400/70 dark:border-emerald-700/60 bg-emerald-500/15 dark:bg-emerald-950/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-950 dark:text-emerald-100">
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
              <table className="w-full min-w-[920px] border-collapse text-xs">
                <thead>
                  {/* Spreadsheet Column Letters A - H */}
                  <tr className="bg-slate-100/95 dark:bg-slate-950 text-[11px] font-mono text-slate-500 dark:text-slate-400 border-b border-slate-300/80 dark:border-slate-700/80 select-none">
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800 w-14">
                      A
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      B
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      C
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      D
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      E
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      F
                    </th>
                    <th className="py-1 px-3 text-center font-medium border-r border-slate-200 dark:border-slate-800">
                      G
                    </th>
                    <th className="py-1 px-3 text-center font-medium">H</th>
                  </tr>

                  {/* Row 1: Month - nov-26 */}
                  <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('monthPrefix', { month: shortMonthLabel })}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-2 px-3" />
                  </tr>

                  {/* Row 2: Column Headers */}
                  <tr className="bg-slate-50 dark:bg-slate-950/80 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                    <th className="py-2.5 px-3 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colSn')}
                    </th>
                    <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colMemberName')}
                    </th>
                    <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colMemberId')}
                    </th>
                    <th className="py-2.5 px-3 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colMobileNo')}
                    </th>
                    <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colEmail')}
                    </th>
                    <th className="py-2.5 px-3 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colContribution')}
                    </th>
                    <th className="py-2.5 px-3 text-right font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('colQardHasana')}
                    </th>
                    <th className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                      {t('colDueHasana')}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Row 3 (Top Green Summary Band): Previous month Summary */}
                  <tr className="bg-emerald-500/20 dark:bg-emerald-600/25 text-emerald-950 dark:text-emerald-100 border-b-2 border-emerald-500/60 dark:border-emerald-500/50 font-semibold">
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 text-right border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {t('previousMonthSummary')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {formatMoney(sheet.previousMonthSummary.contributionAmount, ccy)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      {sheet.previousMonthSummary.qardHasanAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.qardHasanAmount, ccy)
                        : t('no')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {sheet.previousMonthSummary.dueHasanaAmount > 0
                        ? formatMoney(sheet.previousMonthSummary.dueHasanaAmount, ccy)
                        : t('no')}
                    </td>
                  </tr>

                  {/* Member Data Rows */}
                  {filteredRows.length === 0 ? (
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <td colSpan={8} className="py-10 px-4 text-center space-y-2">
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
                    filteredRows.map((row) => (
                      <tr
                        key={row.userId}
                        className="border-b border-slate-200/90 dark:border-slate-800 hover:bg-emerald-50/35 dark:hover:bg-slate-800/45 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                          {row.serialNo}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
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
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {row.memberCode}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {row.mobile}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {row.email}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium border-r border-slate-200 dark:border-slate-800 whitespace-nowrap ${
                            row.contributionStatus === 'paid'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : row.contributionStatus === 'pending'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {renderContributionCellText(row)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {row.hasQardHasan ? (
                            <span className="text-slate-900 dark:text-white font-medium">
                              {t('yes')} · {formatMoney(row.qardHasanAmount, ccy)}
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">{t('no')}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.dueHasanaAmount > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {formatMoney(row.dueHasanaAmount, ccy)}
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">{t('no')}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Bottom Green Summary Band: This month summary (previous + this month) */}
                  <tr className="bg-emerald-500/20 dark:bg-emerald-600/25 text-emerald-950 dark:text-emerald-100 border-y-2 border-emerald-500/60 dark:border-emerald-500/50 font-semibold">
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 border-r border-emerald-400/40 dark:border-emerald-700/50" />
                    <td className="py-2.5 px-3 text-right border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      <div>{t('thisMonthSummary')}</div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('previousPlusThisMonth')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      <div>{formatMoney(sheet.thisMonthSummary.contributionAmount, ccy)}</div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('thisMonthShort', {
                          value: formatMoney(sheet.thisMonthOnly.contributionAmount, ccy),
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-emerald-400/40 dark:border-emerald-700/50 whitespace-nowrap">
                      <div>
                        {sheet.thisMonthSummary.qardHasanAmount > 0
                          ? formatMoney(sheet.thisMonthSummary.qardHasanAmount, ccy)
                          : t('no')}
                      </div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('thisMonthShort', {
                          value:
                            sheet.thisMonthOnly.qardHasanAmount > 0
                              ? formatMoney(sheet.thisMonthOnly.qardHasanAmount, ccy)
                              : t('no'),
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div>
                        {sheet.thisMonthSummary.dueHasanaAmount > 0
                          ? formatMoney(sheet.thisMonthSummary.dueHasanaAmount, ccy)
                          : t('no')}
                      </div>
                      <div className="text-[10px] font-normal opacity-80">
                        {t('previousPlusThisMonth')}
                      </div>
                    </td>
                  </tr>

                  {/* Bottom Row: Fund summary (Fund Height | Total | Total) */}
                  <tr className="bg-slate-50/95 dark:bg-slate-950/90 text-slate-900 dark:text-white font-semibold">
                    <td className="py-3 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-3 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-3 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-3 px-3 border-r border-slate-200 dark:border-slate-800" />
                    <td className="py-3 px-3 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      {t('fundSummary')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('fundHeight')}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(sheet.fundSummary.fundHeight, ccy)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {t('totalLabel')}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(sheet.fundSummary.totalQardHasan, ccy)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
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
