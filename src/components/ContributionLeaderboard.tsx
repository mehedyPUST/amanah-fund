'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Award, CheckCircle2, Flame, Trophy } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { DashboardSectionId, FundConfig, LeaderboardEntry } from '../types/coop.ts';
import { formatMoney } from '../utils/format.ts';

interface ContributionLeaderboardProps {
  entries: LeaderboardEntry[];
  config: FundConfig | null;
  loading?: boolean;
  onNavigate: (section: DashboardSectionId) => void;
}

function MemberInitials({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center justify-center shrink-0"
    >
      {initials || 'AM'}
    </div>
  );
}

export function ContributionLeaderboard({
  entries,
  config,
  loading = false,
  onNavigate,
}: ContributionLeaderboardProps) {
  const ccy = config?.currency || 'BDT';
  const [mode, setMode] = useState<'top' | 'consistent'>('top');

  const ranked = useMemo(() => {
    const copy = [...entries];
    if (mode === 'top') {
      return copy.sort((a, b) => {
        if (b.totalContributed !== a.totalContributed) {
          return b.totalContributed - a.totalContributed;
        }
        if (b.approvedMonthsCount !== a.approvedMonthsCount) {
          return b.approvedMonthsCount - a.approvedMonthsCount;
        }
        return b.currentStreakMonths - a.currentStreakMonths;
      });
    }
    return copy.sort((a, b) => {
      if (b.currentStreakMonths !== a.currentStreakMonths) {
        return b.currentStreakMonths - a.currentStreakMonths;
      }
      if (b.consistencyScore !== a.consistencyScore) {
        return b.consistencyScore - a.consistencyScore;
      }
      if (b.approvedMonthsCount !== a.approvedMonthsCount) {
        return b.approvedMonthsCount - a.approvedMonthsCount;
      }
      return b.totalContributed - a.totalContributed;
    });
  }, [entries, mode]);

  const maxContributed = useMemo(
    () => Math.max(1, ...entries.map((e) => e.totalContributed)),
    [entries]
  );

  const selfRankIndex = ranked.findIndex((e) => e.isSelf);
  const selfEntry = selfRankIndex >= 0 ? ranked[selfRankIndex] : null;
  const hasAnyContribution = entries.some((e) => e.totalContributed > 0);

  if (loading) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <Skeleton width="55%" height={18} />
        <Skeleton height={56} />
        <Skeleton height={160} />
      </section>
    );
  }

  return (
    <section
      aria-label="Contribution Leaderboard"
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Cooperative Fund Participation</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
              Contribution Leaderboard
            </h3>
          </div>

          <div
            role="tablist"
            aria-label="Leaderboard ranking mode"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'top'}
              onClick={() => setMode('top')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'top'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Top Contributors
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'consistent'}
              onClick={() => setMode('consistent')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'consistent'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Consistent Payers
            </button>
          </div>
        </div>

        {!hasAnyContribution ? (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-6 text-center space-y-3">
            <Award className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                No Approved Contributions Yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Once monthly Bank or MFS contributions are verified by a manager, top contributors
                and consecutive monthly streaks will appear here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('monthly-contribution')}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer transition-colors"
            >
              Submit Monthly Contribution
            </button>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto scrollbar-subtle divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl">
            {ranked.map((entry, idx) => {
              const rank = idx + 1;
              const barPct =
                mode === 'top'
                  ? Math.round((entry.totalContributed / maxContributed) * 100)
                  : entry.consistencyScore;

              return (
                <div
                  key={entry.userId}
                  className={`px-4 py-3 space-y-2 transition-colors ${
                    entry.isSelf
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/25'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-md font-mono tabular-nums text-xs font-semibold flex items-center justify-center shrink-0 ${
                          rank === 1
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : rank === 2
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                              : rank === 3
                                ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300'
                                : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        #{rank}
                      </span>

                      <MemberInitials name={entry.memberName} photoUrl={entry.photoUrl} />

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {entry.memberName}
                          </span>
                          {entry.isSelf && (
                            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">{entry.memberCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {entry.approvedMonthsCount}{' '}
                            {entry.approvedMonthsCount === 1 ? 'month' : 'months'}
                          </span>
                          {entry.currentStreakMonths > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400 font-medium tabular-nums">
                                <Flame className="w-3 h-3" aria-hidden="true" />
                                {entry.currentStreakMonths}m streak
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {mode === 'top' ? (
                        <>
                          <div className="text-xs sm:text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(entry.totalContributed, ccy)}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {entry.consistencyScore}% consistency
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs sm:text-sm font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {entry.consistencyScore}% on-time
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1">
                            {entry.currentMonthPaid ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                Current month paid
                              </span>
                            ) : (
                              <span className="font-mono tabular-nums">
                                {formatMoney(entry.totalContributed, ccy)}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Proportional Progress Bar */}
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        rank === 1
                          ? 'bg-amber-500'
                          : entry.isSelf
                            ? 'bg-emerald-600'
                            : 'bg-emerald-500/80 dark:bg-emerald-500/70'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, barPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: Personal Rank & Participation CTA */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {selfEntry
            ? `Your rank: #${selfRankIndex + 1} of ${ranked.length} active · ${selfEntry.currentStreakMonths}m streak`
            : `${ranked.length} active members`}
        </span>
        <button
          type="button"
          onClick={() => onNavigate('monthly-contribution')}
          className="group text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
        >
          <span>Contribute This Month</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </section>
  );
}
