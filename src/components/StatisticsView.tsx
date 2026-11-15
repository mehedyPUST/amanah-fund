'use client';

import { BarChart3 } from 'lucide-react';
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Treasury Analytics &amp; Cashflow Telemetry</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Statistics &amp; Fund Performance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monthly cash position, treasury growth trajectory, contribution ratios, and Qard Hasan
            lending velocity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Pool Liquidity:{' '}
            <strong className="text-slate-900 dark:text-white">
              {overview ? `${overview.treasury.availableLiquidity.toLocaleString()} ${ccy}` : '—'}
            </strong>
          </span>
        </div>
      </div>

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
