'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Target } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, DashboardOverview, FundConfig } from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

interface ManagerCollectionGoalChartProps {
  contributions: Contribution[];
  config: FundConfig | null;
  treasury: DashboardOverview['treasury'] | null;
  loading?: boolean;
}

interface MonthlyGoalPoint {
  month: string;
  monthLabel: string;
  approvedCollected: number;
  pendingReview: number;
  targetGoal: number;
  cumulativeCollected: number;
  cumulativeTarget: number;
  attainmentPct: number;
}

interface GoalTooltipProps {
  active?: boolean;
  label?: string;
  currency: FundConfig['currency'];
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: MonthlyGoalPoint;
  }>;
}

function CollectionGoalTooltip({ active, payload, label, currency }: GoalTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-md text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1">
        <span className="font-semibold text-slate-900 dark:text-white">{label}</span>
        {point && (
          <span
            className={`font-mono tabular-nums font-semibold ${
              point.attainmentPct >= 100
                ? 'text-emerald-700 dark:text-emerald-400'
                : point.attainmentPct >= 60
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {point.attainmentPct}% of goal
          </span>
        )}
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
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function getRecentMonthKeys(count: number, anchorMonthKey?: string): string[] {
  let year = new Date().getUTCFullYear();
  let month = new Date().getUTCMonth() + 1;
  if (anchorMonthKey && /^\d{4}-\d{2}$/.test(anchorMonthKey)) {
    const [y, m] = anchorMonthKey.split('-').map(Number);
    if (y && m) {
      year = y;
      month = m;
    }
  }
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    result.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export function ManagerCollectionGoalChart({
  contributions,
  config,
  treasury,
  loading = false,
}: ManagerCollectionGoalChartProps) {
  const ccy = config?.currency || 'BDT';
  const [range, setRange] = useState<'6m' | '12m' | 'all'>('6m');
  const [mode, setMode] = useState<'monthly' | 'cumulative'>('monthly');

  const monthlyTarget = useMemo(() => {
    if (treasury?.thisMonthContributionTarget && treasury.thisMonthContributionTarget > 0) {
      return treasury.thisMonthContributionTarget;
    }
    const perMember = config?.monthlyContributionAmount || 5000;
    const memberCount = Math.max(1, treasury?.contributingMembersCount || 1);
    return perMember * memberCount;
  }, [treasury, config]);

  const series = useMemo<MonthlyGoalPoint[]>(() => {
    const bucketMap = new Map<string, { approved: number; pending: number }>();

    const seedMonths = getRecentMonthKeys(6, treasury?.thisMonthKey);
    seedMonths.forEach((ym) => {
      bucketMap.set(ym, { approved: 0, pending: 0 });
    });

    contributions.forEach((c) => {
      const ym = c.billingMonth || c.submittedAt.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      if (!bucketMap.has(ym)) {
        bucketMap.set(ym, { approved: 0, pending: 0 });
      }
      const b = bucketMap.get(ym)!;
      if (c.status === 'approved') {
        b.approved += c.amount;
      } else if (c.status === 'pending') {
        b.pending += c.amount;
      }
    });

    const sortedMonths = Array.from(bucketMap.keys()).sort((a, b) => a.localeCompare(b));
    let runningCollected = 0;
    let runningTarget = 0;

    return sortedMonths.map((month) => {
      const b = bucketMap.get(month)!;
      runningCollected += b.approved;
      runningTarget += monthlyTarget;
      const attainmentPct =
        monthlyTarget > 0 ? Math.round((b.approved / monthlyTarget) * 100) : 0;

      return {
        month,
        monthLabel: formatBillingMonth(month),
        approvedCollected: b.approved,
        pendingReview: b.pending,
        targetGoal: monthlyTarget,
        cumulativeCollected: runningCollected,
        cumulativeTarget: runningTarget,
        attainmentPct,
      };
    });
  }, [contributions, monthlyTarget, treasury?.thisMonthKey]);

  const visibleSeries = useMemo(() => {
    if (range === '6m') return series.slice(-6);
    if (range === '12m') return series.slice(-12);
    return series;
  }, [series, range]);

  const summary = useMemo(() => {
    const windowCollected = visibleSeries.reduce((s, p) => s + p.approvedCollected, 0);
    const windowPending = visibleSeries.reduce((s, p) => s + p.pendingReview, 0);
    const windowTarget = visibleSeries.reduce((s, p) => s + p.targetGoal, 0);
    const windowAttainmentPct =
      windowTarget > 0 ? Math.round((windowCollected / windowTarget) * 100) : 0;

    const currentMonthCollected =
      treasury?.thisMonthContributionCollected ??
      visibleSeries[visibleSeries.length - 1]?.approvedCollected ??
      0;
    const currentMonthPct =
      monthlyTarget > 0 ? Math.round((currentMonthCollected / monthlyTarget) * 100) : 0;

    const monthsMetCount = visibleSeries.filter(
      (p) => p.targetGoal > 0 && p.approvedCollected >= p.targetGoal
    ).length;

    return {
      windowCollected,
      windowPending,
      windowTarget,
      windowAttainmentPct,
      currentMonthCollected,
      currentMonthPct,
      monthsMetCount,
    };
  }, [visibleSeries, treasury?.thisMonthContributionCollected, monthlyTarget]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-label="Monthly Collection Progress vs Target Goals"
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between gap-5"
    >
      {/* Header & Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </span>
              <span>Treasury Collection Analytics</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Monthly Collection Progress vs. Target Goals
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Goal: {formatMoney(monthlyTarget, ccy)}/mo
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Chart comparison mode"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              {(
                [
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'cumulative', label: 'Cumulative' },
                ] as const
              ).map((tab) => {
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    className={`relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mgr-collection-mode-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-xs ring-1 ring-teal-500/20"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div
              role="group"
              aria-label="Chart range"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              {(
                [
                  { id: '6m', label: '6M' },
                  { id: '12m', label: '12M' },
                  { id: 'all', label: 'All' },
                ] as const
              ).map((r) => {
                const active = range === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id)}
                    className={`relative px-2 py-1 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mgr-collection-range-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-xs ring-1 ring-indigo-500/20"
                      />
                    )}
                    <span className="relative z-10">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Metrics Strip */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-1.5">
                <Skeleton width="70%" height={11} />
                <Skeleton width="80%" height={20} />
                <Skeleton width="55%" height={10} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Current Month Progress
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(summary.currentMonthCollected, ccy)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.currentMonthPct}% of target
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Monthly Goal Target
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {formatMoney(monthlyTarget, ccy)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {treasury?.thisMonthClearanceClearedMembers ?? 0}/
                {treasury?.thisMonthClearanceTotalMembers ??
                  treasury?.contributingMembersCount ??
                  0}{' '}
                members cleared
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Period Goal Attainment
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                {summary.windowAttainmentPct}%
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.monthsMetCount} of {visibleSeries.length} months met
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Pending in Period
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {formatMoney(summary.windowPending, ccy)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Awaiting manager check
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recharts Canvas */}
      {loading ? (
        <Skeleton height={270} borderRadius={10} />
      ) : (
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={visibleSeries}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="mgrCollectedAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(148, 163, 184, 0.24)"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatAxisCompact}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip content={<CollectionGoalTooltip currency={ccy} />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

              {mode === 'monthly' ? (
                <>
                  <Bar
                    dataKey="approvedCollected"
                    name="Approved Collected"
                    stackId="collection"
                    fill="#059669"
                    radius={[0, 0, 0, 0]}
                    barSize={24}
                  />
                  <Bar
                    dataKey="pendingReview"
                    name="Pending Verification"
                    stackId="collection"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                  <Line
                    type="monotone"
                    dataKey="targetGoal"
                    name="Cooperative Target Goal"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  <ReferenceLine
                    y={monthlyTarget}
                    stroke="#6366f1"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                  />
                </>
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="cumulativeCollected"
                    name="Cumulative Collected"
                    stroke="#059669"
                    strokeWidth={2.25}
                    fill="url(#mgrCollectedAreaGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeTarget"
                    name="Cumulative Target Goal"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#6366f1' }}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.section>
  );
}
