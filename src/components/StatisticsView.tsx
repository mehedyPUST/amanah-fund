'use client';

import { BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { AuditTrendsCharts } from './AuditTrendsCharts.tsx';
import { MonthlyFinancialSnapshot } from './MonthlyFinancialSnapshot.tsx';
import { TreasuryGrowthChart } from './TreasuryGrowthChart.tsx';

interface StatisticsViewProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (section: DashboardSectionId) => void;
}

export function StatisticsView({
  overview,
  contributions,
  loans,
  user,
  loading,
  onNavigate,
}: StatisticsViewProps) {
  const ccy = overview?.config.currency || 'BDT';
  const monthlySeries = overview?.monthlySeries || [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="bg-gradient-to-r from-teal-50/75 via-white to-indigo-50/45 dark:from-teal-950/30 dark:via-slate-900 dark:to-indigo-950/25 border border-teal-200/80 dark:border-teal-900/50 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Treasury Analytics &amp; Cashflow Telemetry</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Statistics &amp; Fund Performance
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Pool Liquidity:{' '}
            <strong className="text-indigo-700 dark:text-indigo-300">
              {loading && !overview ? (
                <Skeleton width={90} height={14} inline />
              ) : overview ? (
                `${overview.treasury.availableLiquidity.toLocaleString()} ${ccy}`
              ) : (
                '—'
              )}
            </strong>
          </span>
        </div>
      </motion.div>

      <MonthlyFinancialSnapshot
        contributions={contributions}
        loans={loans}
        config={overview?.config || null}
        loading={loading}
        onNavigate={(target) => onNavigate(target)}
      />

      <TreasuryGrowthChart
        contributions={contributions}
        loans={loans}
        monthlySeries={monthlySeries}
        currency={ccy}
        currentUserId={user.id}
        centralBalance={overview?.treasury.centralBalance || 0}
        loading={loading}
        onSubmitContribution={() => onNavigate('monthly-contribution')}
      />

      <AuditTrendsCharts
        contributions={contributions}
        loans={loans}
        monthlySeries={monthlySeries}
        currency={ccy}
        loading={loading && monthlySeries.length === 0}
      />
    </div>
  );
}
