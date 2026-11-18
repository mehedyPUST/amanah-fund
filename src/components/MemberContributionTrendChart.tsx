'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { Contribution, FundConfig } from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

interface MemberContributionTrendChartProps {
  contributions: Contribution[];
  userId: string;
  currency: FundConfig['currency'];
  compact?: boolean;
}

interface TrendPoint {
  monthKey: string;
  shortLabel: string;
  fullLabel: string;
  monthlyApproved: number;
  cumulativeApproved: number;
  pendingAmount: number;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatCompactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: TrendPoint }>;
  currency: FundConfig['currency'];
}

function TrendTooltip({ active, payload, currency }: TrendTooltipProps) {
  const pt = payload?.[0]?.payload;
  if (!active || !pt) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-md text-xs space-y-1">
      <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1">
        {pt.fullLabel}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">Cumulative Saved</span>
        <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatMoney(pt.cumulativeApproved, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">Month Deposit</span>
        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
          {formatMoney(pt.monthlyApproved, currency)}
        </span>
      </div>
      {pt.pendingAmount > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-700 dark:text-amber-400">Pending Review</span>
          <span className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(pt.pendingAmount, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

export function MemberContributionTrendChart({
  contributions,
  userId,
  currency,
  compact = false,
}: MemberContributionTrendChartProps) {
  const { points, sixMonthGain, latestCumulative } = useMemo(() => {
    const now = new Date();
    const months: Array<{ monthKey: string; shortLabel: string; fullLabel: string }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        monthKey,
        shortLabel: SHORT_MONTHS[d.getMonth()],
        fullLabel: formatBillingMonth(monthKey),
      });
    }

    const windowStartKey = months[0].monthKey;
    const monthlyApprovedMap = new Map<string, number>();
    const monthlyPendingMap = new Map<string, number>();
    let baselineBeforeWindow = 0;

    contributions.forEach((c) => {
      if (c.userId !== userId) return;
      const ym = c.billingMonth || c.submittedAt.slice(0, 7);
      if (c.status === 'approved') {
        if (ym < windowStartKey) {
          baselineBeforeWindow += c.amount;
        } else {
          monthlyApprovedMap.set(ym, (monthlyApprovedMap.get(ym) || 0) + c.amount);
        }
      } else if (c.status === 'pending' && ym >= windowStartKey) {
        monthlyPendingMap.set(ym, (monthlyPendingMap.get(ym) || 0) + c.amount);
      }
    });

    let runningTotal = baselineBeforeWindow;
    let gainInWindow = 0;

    const series: TrendPoint[] = months.map((m) => {
      const monthlyApproved = monthlyApprovedMap.get(m.monthKey) || 0;
      const pendingAmount = monthlyPendingMap.get(m.monthKey) || 0;
      runningTotal += monthlyApproved;
      gainInWindow += monthlyApproved;
      return {
        monthKey: m.monthKey,
        shortLabel: m.shortLabel,
        fullLabel: m.fullLabel,
        monthlyApproved,
        cumulativeApproved: runningTotal,
        pendingAmount,
      };
    });

    return {
      points: series,
      sixMonthGain: gainInWindow,
      latestCumulative: runningTotal,
    };
  }, [contributions, userId]);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>6-Month Contribution Growth</span>
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
            +{formatMoney(sixMonthGain, currency)}
          </span>{' '}
          added · Total {formatMoney(latestCumulative, currency)}
        </div>
      </div>

      <div className={compact ? 'h-28 w-full min-w-0' : 'h-40 w-full min-w-0'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={
              compact
                ? { top: 6, right: 8, left: -18, bottom: 0 }
                : { top: 8, right: 12, left: -6, bottom: 0 }
            }
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(148, 163, 184, 0.22)"
            />
            <XAxis
              dataKey="shortLabel"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatCompactAxis}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={compact ? 42 : 46}
            />
            <Tooltip content={<TrendTooltip currency={currency} />} />
            <Line
              type="monotone"
              dataKey="cumulativeApproved"
              name="Cumulative Savings"
              stroke="#059669"
              strokeWidth={2.25}
              dot={{ r: compact ? 2.5 : 3, fill: '#059669', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 1.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
