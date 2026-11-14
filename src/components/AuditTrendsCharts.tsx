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
import Skeleton from 'react-loading-skeleton';
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
  const [chartView, setChartView] = useState<'both' | 'contributions' | 'loans'>('both');

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

    // Seed from overview monthlySeries first so server-aggregated baseline months appear
    monthlySeries.forEach((pt) => {
      const b = ensureBucket(pt.month);
      b.monthlyContributions = Math.max(b.monthlyContributions, pt.contributions);
      b.monthlyRepaid = Math.max(b.monthlyRepaid, pt.repaid);
    });

    // Aggregate direct contribution entries (approved vs pending)
    if (contributions.length > 0) {
      // Recompute contribution buckets cleanly from raw contributions when available
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

    // Aggregate Qard Hasan loan volume over time (non-rejected loans anchored by disbursement or request month)
    loans.forEach((loan) => {
      if (loan.status === 'rejected') return;
      const ym = (loan.disbursedAt || loan.approvedAt || loan.requestedAt).slice(0, 7);
      ensureBucket(ym).monthlyLoanVolume += loan.amount;

      loan.installments.forEach((inst) => {
        if (inst.status === 'paid' && inst.paidAt) {
          ensureBucket(inst.paidAt.slice(0, 7)).monthlyRepaid =
            Math.max(ensureBucket(inst.paidAt.slice(0, 7)).monthlyRepaid, 0);
        }
      });
    });

    // Recompute exact monthlyRepaid from paid installments if loans are present
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
    <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Audit Analytics: Contribution Trends & Loan Volume Over Time
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Time-series Recharts audit view comparing monthly contribution inflows, cumulative
            treasury growth, and Qard Hasan loan volume
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit shrink-0">
          {(
            [
              { id: 'both', label: 'Combined View' },
              { id: 'contributions', label: 'Contributions' },
              { id: 'loans', label: 'Loan Volume' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setChartView(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartView === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
        <div className="pt-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Cumulative Approved Contributions
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(totals.totalApprovedContrib, currency)}
          </div>
        </div>
        <div className="pt-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Cumulative Qard Hasan Loan Volume
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(totals.totalLoanVol, currency)}
          </div>
        </div>
        <div className="pt-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Verified Repayments vs Volume
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatMoney(totals.totalRepaid, currency)}{' '}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ({totals.recoveryPct}%)
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Skeleton height={270} />
          <Skeleton height={270} />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          No monthly contribution or loan history available to plot yet.
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
                  Monthly Contribution Trends
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly inflow & cumulative pool
                </span>
              </div>

              <div className="h-64 w-full min-w-0">
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
                      stroke="rgba(148, 163, 184, 0.25)"
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
                      width={44}
                    />
                    <Tooltip content={<AuditChartTooltip currency={currency} />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey="cumulativeContributions"
                      name="Cumulative Contributions"
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#contribAreaGrad)"
                    />
                    <Bar
                      dataKey="monthlyContributions"
                      name="Approved Monthly"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                    <Bar
                      dataKey="pendingContributions"
                      name="Pending Review"
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
                  Total Loan Volume Over Time
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly issued, repaid & cumulative volume
                </span>
              </div>

              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(148, 163, 184, 0.25)"
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
                      width={44}
                    />
                    <Tooltip content={<AuditChartTooltip currency={currency} />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar
                      dataKey="monthlyLoanVolume"
                      name="Monthly Loan Volume"
                      fill="#d97706"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                    <Bar
                      dataKey="monthlyRepaid"
                      name="Monthly Repaid"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeLoanVolume"
                      name="Cumulative Loan Volume"
                      stroke="#0d9488"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#0d9488' }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
