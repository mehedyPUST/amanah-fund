'use client';

import { useTranslations } from 'next-intl';
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
import { ContributionLeaderboard } from './ContributionLeaderboard.tsx';
import { MonthlyFinancialSnapshot } from './MonthlyFinancialSnapshot.tsx';
import { TreasuryGrowthChart } from './TreasuryGrowthChart.tsx';

interface StatisticsViewProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  onNavigate: (section: DashboardSectionId) => void;
  onViewMemberProfile?: (userId: string) => void;
}

export function StatisticsView({
  overview,
  contributions,
  loans,
  user,
  loading,
  onNavigate,
  onViewMemberProfile,
}: StatisticsViewProps) {
  const t = useTranslations('Statistics');
  const ccy = overview?.config.currency || 'BDT';
  const monthlySeries = overview?.monthlySeries || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
      >
        <div className="space-y-1">
          {loading && !overview ? (
            <>
              <Skeleton width={150} height={13} />
              <Skeleton width={235} height={22} />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('eyebrow')}</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('heading')}
              </h2>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {t('poolLiquidity')}{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
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

      <ContributionLeaderboard
        entries={overview?.leaderboard || []}
        config={overview?.config || null}
        loading={loading && !overview}
        onNavigate={onNavigate}
        onViewMemberProfile={onViewMemberProfile}
      />
    </div>
  );
}
