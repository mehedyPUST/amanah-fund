'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3 } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Skeleton from 'react-loading-skeleton';
import { useTranslations } from 'next-intl';
import { useCoopSession } from './AppProviders.tsx';
import type {
  Contribution,
  FundConfig,
  LoanRequest,
  MonthlyCashflowPoint,
} from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

interface AuditTrendsChartsProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  monthlySeries: MonthlyCashflowPoint[];
  currency: FundConfig['currency'];
  loading?: boolean;
}

interface AuditChartPoint {
  month: string;
  monthLabel: string;
  monthlyContributions: number;
  pendingContributions: number;
  cumulativeContributions: number;
  monthlyLoanVolume: number;
  monthlyRepaid: number;
  cumulativeLoanVolume: number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  currency: FundConfig['currency'];
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
  }>;
}

function AuditChartTooltip({ active, payload, label, currency }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white/94 dark:bg-slate-900/94 backdrop-blur-xl border border-slate-200/85 dark:border-slate-700/85 rounded-xl px-3.5 py-2.5 shadow-lg text-xs space-y-1.5">
      <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1">
        {label}
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color || '#059669' }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
              {formatMoney(Number(entry.value || 0), currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatAxisCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function AuditTrendsCharts({
  contributions,
  loans,
  monthlySeries,
  currency,
  loading = false,
}: AuditTrendsChartsProps) {
  const t = useTranslations('Charts');
  const { darkMode } = useCoopSession();
  const [chartView, setChartView] = useState<'both' | 'contributions' | 'loans'>('both');
  const axisFill = darkMode ? '#94a3b8' : '#475569';
  const gridStroke = darkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.16)';
  const hoverCursor = {
    fill: darkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.05)',
  };
  const legendStyle = {
    fontSize: '12px',
    paddingTop: '8px',
    color: darkMode ? '#cbd5e1' : '#334155',
  };

  const chartData = useMemo<AuditChartPoint[]>(() => {
    const monthBuckets = new Map<
      string,
      {
        monthlyContributions: number;
        pendingContributions: number;
        monthlyLoanVolume: number;
        monthlyRepaid: number;
      }
    >();

    const ensureBucket = (ym: string) => {
      if (!monthBuckets.has(ym)) {
        monthBuckets.set(ym, {
          monthlyContributions: 0,
          pendingContributions: 0,
          monthlyLoanVolume: 0,
          monthlyRepaid: 0,
        });
      }
      return monthBuckets.get(ym)!;
    };

    monthlySeries.forEach((pt) => {
      const b = ensureBucket(pt.month);
      b.monthlyContributions = Math.max(b.monthlyContributions, pt.contributions);
      b.monthlyRepaid = Math.max(b.monthlyRepaid, pt.repaid);
    });

    if (contributions.length > 0) {
      monthBuckets.forEach((b) => {
        b.monthlyContributions = 0;
        b.pendingContributions = 0;
      });
      contributions.forEach((c) => {
        const ym = c.billingMonth || c.submittedAt.slice(0, 7);
        const b = ensureBucket(ym);
        if (c.status === 'approved') {
          b.monthlyContributions += c.amount;
        } else if (c.status === 'pending') {
          b.pendingContributions += c.amount;
        }
      });
    }

    loans.forEach((loan) => {
      if (loan.status === 'rejected') return;
      const ym = (loan.disbursedAt || loan.approvedAt || loan.requestedAt).slice(0, 7);
      ensureBucket(ym).monthlyLoanVolume += loan.amount;
    });

    if (loans.length > 0) {
      monthBuckets.forEach((b) => {
        b.monthlyRepaid = 0;
      });
      loans.forEach((loan) => {
        loan.installments.forEach((inst) => {
          if (inst.status === 'paid' && inst.paidAt) {
            ensureBucket(inst.paidAt.slice(0, 7)).monthlyRepaid += inst.paidAmount;
          }
        });
      });
    }

    const sortedMonths = Array.from(monthBuckets.keys()).sort((a, b) => a.localeCompare(b));
    let runningContributions = 0;
    let runningLoanVolume = 0;

    return sortedMonths.map((month) => {
      const b = monthBuckets.get(month)!;
      runningContributions += b.monthlyContributions;
      runningLoanVolume += b.monthlyLoanVolume;

      return {
        month,
        monthLabel: formatBillingMonth(month),
        monthlyContributions: b.monthlyContributions,
        pendingContributions: b.pendingContributions,
        cumulativeContributions: runningContributions,
        monthlyLoanVolume: b.monthlyLoanVolume,
        monthlyRepaid: b.monthlyRepaid,
        cumulativeLoanVolume: runningLoanVolume,
      };
    });
  }, [contributions, loans, monthlySeries]);

  const totals = useMemo(() => {
    const totalApprovedContrib = chartData.reduce((s, d) => s + d.monthlyContributions, 0);
    const totalLoanVol = chartData.reduce((s, d) => s + d.monthlyLoanVolume, 0);
    const totalRepaid = chartData.reduce((s, d) => s + d.monthlyRepaid, 0);
    const recoveryPct =
      totalLoanVol > 0 ? Math.round((totalRepaid / totalLoanVol) * 100) : 100;
    return { totalApprovedContrib, totalLoanVol, totalRepaid, recoveryPct };
  }, [chartData]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <BarChart3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </span>
            <span>{t('auditTelemetryBadge')}</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t('auditAnalyticsTitle')}
          </h2>
        </div>

        <div className="flex flex-nowrap items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/75 dark:border-slate-700/75 w-full sm:w-fit max-w-full overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              { id: 'both', label: t('tabCombinedView') },
              { id: 'contributions', label: t('tabContributions') },
              { id: 'loans', label: t('tabLoanVolume') },
            ] as const
          ).map((tab) => {
            const active = chartView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChartView(tab.id)}
                className={`relative min-h-[36px] sm:min-h-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="audit-trends-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Audit Summary Strip */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className={`space-y-1.5 ${idx === 2 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <Skeleton width="65%" height={12} />
              <Skeleton width="55%" height={24} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="pt-2 sm:pt-3 min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('cumulativeApprovedContributions')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(totals.totalApprovedContrib, currency)}
            </div>
          </div>
          <div className="pt-2 sm:pt-3 min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('cumulativeLoanVolume')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {formatMoney(totals.totalLoanVol, currency)}
            </div>
          </div>
          <div className="pt-2 sm:pt-3 col-span-2 sm:col-span-1 min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('verifiedRepaymentsVsVolume')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
              {formatMoney(totals.totalRepaid, currency)}{' '}
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                ({totals.recoveryPct}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Skeleton height={270} borderRadius={10} />
          <Skeleton height={270} borderRadius={10} />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/25">
          {t('noAuditHistory')}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            chartView === 'both' ? 'xl:grid-cols-2' : ''
          } gap-6`}
        >
          {(chartView === 'both' || chartView === 'contributions') && (
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('monthlyContributionTrends')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('monthlyInflowAndPool')}
                </span>
              </div>

              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="contribAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={gridStroke}
                    />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11, fill: axisFill }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatAxisCompact}
                      tick={{ fontSize: 11, fill: axisFill }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip
                      cursor={hoverCursor}
                      content={<AuditChartTooltip currency={currency} />}
                    />
                    <Legend wrapperStyle={legendStyle} />
                    <Area
                      type="monotone"
                      dataKey="cumulativeContributions"
                      name={t('seriesCumulativeContributions')}
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#contribAreaGrad)"
                    />
                    <Bar
                      dataKey="monthlyContributions"
                      name={t('seriesApprovedMonthly')}
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                    <Bar
                      dataKey="pendingContributions"
                      name={t('seriesPendingReview')}
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                      barSize={14}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(chartView === 'both' || chartView === 'loans') && (
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('totalLoanVolumeOverTime')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('monthlyIssuedRepaidVolume')}
                </span>
              </div>

              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={gridStroke}
                    />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11, fill: axisFill }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatAxisCompact}
                      tick={{ fontSize: 11, fill: axisFill }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip
                      cursor={hoverCursor}
                      content={<AuditChartTooltip currency={currency} />}
                    />
                    <Legend wrapperStyle={legendStyle} />
                    <Bar
                      dataKey="monthlyLoanVolume"
                      name={t('seriesMonthlyLoanVolume')}
                      fill="#d97706"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                    <Bar
                      dataKey="monthlyRepaid"
                      name={t('seriesMonthlyRepaid')}
                      fill="#0d9488"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeLoanVolume"
                      name={t('seriesCumulativeLoanVolume')}
                      stroke="#0f766e"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#0f766e' }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
