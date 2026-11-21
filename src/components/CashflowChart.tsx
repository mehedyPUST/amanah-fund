'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { FundConfig, MonthlyCashflowPoint } from '../types/coop.ts';
import { formatBillingMonth, formatMoney } from '../utils/format.ts';

interface CashflowChartProps {
  data: MonthlyCashflowPoint[];
  currency: FundConfig['currency'];
}

export function CashflowChart({ data, currency }: CashflowChartProps) {
  const t = useTranslations('Charts');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const recent = data.slice(-7);

  if (recent.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/25">
        {t('noCashflowActivity')}
      </div>
    );
  }

  const maxVal = Math.max(
    1,
    ...recent.flatMap((d) => [d.contributions, d.disbursed, d.repaid])
  );
  const chartHeight = 180;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" aria-hidden="true" />
            <span>{t('monthlyContributions')}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" aria-hidden="true" />
            <span>{t('qardHasanDisbursed')}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-teal-600 dark:bg-teal-400" aria-hidden="true" />
            <span>{t('installmentsRepaid')}</span>
          </span>
        </div>

        {hoveredIdx !== null && recent[hoveredIdx] && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200"
          >
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
              {formatBillingMonth(recent[hoveredIdx].month)}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              {t('inflowLabel', { amount: formatMoney(recent[hoveredIdx].contributions, currency) })}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="text-amber-700 dark:text-amber-400">
              {t('disbursedLabel', { amount: formatMoney(recent[hoveredIdx].disbursed, currency) })}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="text-teal-700 dark:text-teal-400">
              {t('repaidLabel', { amount: formatMoney(recent[hoveredIdx].repaid, currency) })}
            </span>
          </motion.div>
        )}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 700 ${chartHeight + 34}`}
          className="w-full h-56 overflow-visible"
          role="img"
          aria-label={t('cashflowAriaLabel')}
        >
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartHeight - tick * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={0}
                  x2={700}
                  y1={y}
                  y2={y}
                  className="stroke-slate-200/80 dark:stroke-slate-800/80"
                  strokeDasharray="3 3"
                />
                <text
                  x={0}
                  y={Math.max(10, y - 4)}
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {formatMoney(Math.round(maxVal * tick), currency)}
                </text>
              </g>
            );
          })}

          <line
            x1={0}
            x2={700}
            y1={chartHeight}
            y2={chartHeight}
            className="stroke-slate-300 dark:stroke-slate-700"
          />

          {recent.map((point, idx) => {
            const slotWidth = 700 / recent.length;
            const centerX = idx * slotWidth + slotWidth / 2;
            const barW = Math.min(18, slotWidth * 0.22);
            const h1 = (point.contributions / maxVal) * (chartHeight - 10);
            const h2 = (point.disbursed / maxVal) * (chartHeight - 10);
            const h3 = (point.repaid / maxVal) * (chartHeight - 10);

            return (
              <g
                key={point.month}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={idx * slotWidth + 4}
                  y={0}
                  width={slotWidth - 8}
                  height={chartHeight}
                  rx={6}
                  className={
                    hoveredIdx === idx
                      ? 'fill-indigo-50/70 dark:fill-indigo-950/35'
                      : 'fill-transparent'
                  }
                />
                <motion.rect
                  x={centerX - barW * 1.6}
                  y={chartHeight - h1}
                  width={barW}
                  height={Math.max(point.contributions > 0 ? 3 : 0, h1)}
                  rx={3}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 }}
                  style={{ transformOrigin: `${centerX - barW * 1.1}px ${chartHeight}px` }}
                  className="fill-emerald-600 dark:fill-emerald-500 transition-opacity"
                />
                <motion.rect
                  x={centerX - barW * 0.45}
                  y={chartHeight - h2}
                  width={barW}
                  height={Math.max(point.disbursed > 0 ? 3 : 0, h2)}
                  rx={3}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 + 0.04 }}
                  style={{ transformOrigin: `${centerX}px ${chartHeight}px` }}
                  className="fill-amber-500 transition-opacity"
                />
                <motion.rect
                  x={centerX + barW * 0.7}
                  y={chartHeight - h3}
                  width={barW}
                  height={Math.max(point.repaid > 0 ? 3 : 0, h3)}
                  rx={3}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 + 0.08 }}
                  style={{ transformOrigin: `${centerX + barW * 1.2}px ${chartHeight}px` }}
                  className="fill-teal-600 dark:fill-teal-400 transition-opacity"
                />
                <text
                  x={centerX}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[11px] font-mono"
                >
                  {formatBillingMonth(point.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
