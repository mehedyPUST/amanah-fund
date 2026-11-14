'use client';

import { useMemo, useState } from 'react';
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
import { ArrowRight, TrendingUp } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  FundConfig,
  LoanRequest,
  MonthlyCashflowPoint,
} from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

interface TreasuryGrowthChartProps {
  contributions: Contribution[];
  loans: LoanRequest[];
  monthlySeries: MonthlyCashflowPoint[];
  currency: FundConfig['currency'];
  currentUserId: string;
  centralBalance: number;
  loading?: boolean;
  onSubmitContribution?: () => void;
}

interface TreasuryPoint {
  month: string;
  monthLabel: string;
  approvedContributions: number;
  pendingContributions: number;
  myContributions: number;
  disbursed: number;
  repaid: number;
  cumulativePool: number;
  treasuryBalance: number;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  currency: FundConfig['currency'];
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
  }>;
}

function TreasuryChartTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-md text-xs space-y-1.5">
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
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return String(value);
}

export function TreasuryGrowthChart({
  contributions,
  loans,
  monthlySeries,
  currency,
  currentUserId,
  centralBalance,
  loading = false,
  onSubmitContribution,
}: TreasuryGrowthChartProps) {
  const [viewMode, setViewMode] = useState<'combined' | 'contributions' | 'treasury'>('combined');
  const [range, setRange] = useState<'6m' | '12m' | 'all'>('12m');

  const fullSeries = useMemo<TreasuryPoint[]>(() => {
    const buckets = new Map<
      string,
      {
        approvedContributions: number;
        pendingContributions: number;
        myContributions: number;
        loanOutflow: number;
        repaid: number;
      }
    >();

    const ensureBucket = (ym: string) => {
      if (!buckets.has(ym)) {
        buckets.set(ym, {
          approvedContributions: 0,
          pendingContributions: 0,
          myContributions: 0,
          loanOutflow: 0,
          repaid: 0,
        });
      }
      return buckets.get(ym)!;
    };

    // Baseline from server monthlySeries
    monthlySeries.forEach((pt) => {
      const b = ensureBucket(pt.month);
      b.approvedContributions = pt.contributions;
      b.loanOutflow = pt.disbursed;
      b.repaid = pt.repaid;
    });

    // Enrich with raw contribution records when present (adds pending + member-specific breakdown)
    if (contributions.length > 0) {
      buckets.forEach((b) => {
        b.approvedContributions = 0;
        b.pendingContributions = 0;
        b.myContributions = 0;
      });
      contributions.forEach((c) => {
        const ym = c.billingMonth || c.submittedAt.slice(0, 7);
        const b = ensureBucket(ym);
        if (c.status === 'approved') {
          b.approvedContributions += c.amount;
          if (c.userId === currentUserId) {
            b.myContributions += c.amount;
          }
        } else if (c.status === 'pending') {
          b.pendingContributions += c.amount;
        }
      });
    }

    // Recompute exact loan deductions & repayments when loans list is loaded
    if (loans.length > 0) {
      buckets.forEach((b) => {
        b.loanOutflow = 0;
        b.repaid = 0;
      });
      loans.forEach((l) => {
        if (
          l.status === 'approved_pending_disbursement' ||
          l.status === 'active' ||
          l.status === 'repaid'
        ) {
          const ym = (l.disbursedAt || l.approvedAt || l.requestedAt).slice(0, 7);
          ensureBucket(ym).loanOutflow += l.amount;
        }
        l.installments.forEach((inst) => {
          if (inst.status === 'paid' && inst.paidAt) {
            ensureBucket(inst.paidAt.slice(0, 7)).repaid += inst.paidAmount;
          }
        });
      });
    }

    const sortedMonths = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
    let runningPool = 0;
    let runningTreasury = 0;

    return sortedMonths.map((month) => {
      const b = buckets.get(month)!;
      runningPool += b.approvedContributions;
      runningTreasury += b.approvedContributions - b.loanOutflow + b.repaid;

      return {
        month,
        monthLabel: formatBillingMonth(month),
        approvedContributions: b.approvedContributions,
        pendingContributions: b.pendingContributions,
        myContributions: b.myContributions,
        disbursed: b.loanOutflow,
        repaid: b.repaid,
        cumulativePool: runningPool,
        treasuryBalance: runningTreasury,
      };
    });
  }, [contributions, loans, monthlySeries, currentUserId]);

  const visibleSeries = useMemo(() => {
    if (range === '6m') return fullSeries.slice(-6);
    if (range === '12m') return fullSeries.slice(-12);
    return fullSeries;
  }, [fullSeries, range]);

  const metrics = useMemo(() => {
    const latest = fullSeries[fullSeries.length - 1];
    const previous = fullSeries.length > 1 ? fullSeries[fullSeries.length - 2] : undefined;
    const latestMonthContrib = latest?.approvedContributions ?? 0;
    const prevMonthContrib = previous?.approvedContributions ?? 0;

    let contribDeltaPct: number | null = null;
    if (previous && prevMonthContrib > 0) {
      contribDeltaPct = Math.round(((latestMonthContrib - prevMonthContrib) / prevMonthContrib) * 100);
    }

    const totalPool = latest?.cumulativePool ?? 0;
    const latestTreasury = latest ? latest.treasuryBalance : centralBalance;
    const prevTreasury = previous?.treasuryBalance ?? 0;
    const treasuryGrowthDelta = latestTreasury - prevTreasury;
    const memberTotal = fullSeries.reduce((sum, pt) => sum + pt.myContributions, 0);

    return {
      latestMonthLabel: latest?.monthLabel || 'Current',
      latestMonthContrib,
      contribDeltaPct,
      totalPool,
      latestTreasury,
      treasuryGrowthDelta,
      memberTotal,
    };
  }, [fullSeries, centralBalance]);

  return (
    <section className="bg-gradient-to-br from-emerald-50/55 via-white to-amber-50/40 dark:from-emerald-950/25 dark:via-slate-900 dark:to-amber-950/15 border border-emerald-200/70 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
      {/* Header & Interactive Chart Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Treasury Growth & Contribution Analytics</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Monthly Contribution Trends & Treasury Growth
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track monthly cooperative inflows, personal deposits, and net central treasury growth
            over time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Chart dataset view"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'combined', label: 'Overview' },
                { id: 'contributions', label: 'Contributions' },
                { id: 'treasury', label: 'Treasury Growth' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Chart timeframe"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {(
              [
                { id: '6m', label: '6M' },
                { id: '12m', label: '12M' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  range === r.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Net Treasury Balance</div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(metrics.latestTreasury, currency)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {metrics.treasuryGrowthDelta >= 0 ? '+' : ''}
            {formatMoney(metrics.treasuryGrowthDelta, currency)} last period
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Latest Month ({metrics.latestMonthLabel})
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(metrics.latestMonthContrib, currency)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {metrics.contribDeltaPct !== null
              ? `${metrics.contribDeltaPct >= 0 ? '+' : ''}${metrics.contribDeltaPct}% vs prior month`
              : 'Monthly inflow'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Cumulative Pool Growth</div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(metrics.totalPool, currency)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            All-time approved deposits
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Your Approved Deposits</div>
          <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(metrics.memberTotal, currency)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {metrics.totalPool > 0
              ? `${Math.round((metrics.memberTotal / metrics.totalPool) * 100)}% of fund pool`
              : 'Member equity share'}
          </div>
        </div>
      </div>

      {/* Recharts Canvas */}
      {loading ? (
        <Skeleton height={272} />
      ) : visibleSeries.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No monthly contribution or treasury growth recorded yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
              Once monthly deposits are submitted and verified, this chart will plot contribution
              trends alongside cumulative treasury balance growth.
            </p>
          </div>
          {onSubmitContribution && (
            <button
              type="button"
              onClick={onSubmitContribution}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>Submit First Contribution</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={visibleSeries}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="treasuryGrowthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="contribPoolAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(148, 163, 184, 0.24)"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatAxisCompact}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip content={<TreasuryChartTooltip currency={currency} />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

              {viewMode === 'combined' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="treasuryBalance"
                    name="Treasury Balance"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#treasuryGrowthAreaGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativePool"
                    name="Cumulative Contributions"
                    stroke="#b45309"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#b45309' }}
                    activeDot={{ r: 5 }}
                  />
                  <Bar
                    dataKey="approvedContributions"
                    name="Monthly Contributions"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                  />
                  <Bar
                    dataKey="repaid"
                    name="Repayments Returned"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                    barSize={12}
                  />
                </>
              )}

              {viewMode === 'contributions' && (
                <>
                  <Bar
                    dataKey="approvedContributions"
                    name="Pool Approved Monthly"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                  <Bar
                    dataKey="myContributions"
                    name="Your Approved Monthly"
                    fill="#34d399"
                    radius={[4, 4, 0, 0]}
                    barSize={16}
                  />
                  <Bar
                    dataKey="pendingContributions"
                    name="Pending Verification"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                    barSize={14}
                  />
                </>
              )}

              {viewMode === 'treasury' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="treasuryBalance"
                    name="Net Central Treasury"
                    stroke="#059669"
                    strokeWidth={2.5}
                    fill="url(#treasuryGrowthAreaGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePool"
                    name="Cumulative Pool Equity"
                    stroke="#d97706"
                    strokeWidth={2}
                    fill="url(#contribPoolAreaGrad)"
                  />
                  <Bar
                    dataKey="disbursed"
                    name="Loans Disbursed"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                    barSize={14}
                  />
                  <Bar
                    dataKey="repaid"
                    name="Repayments Returned"
                    fill="#64748b"
                    radius={[4, 4, 0, 0]}
                    barSize={14}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
