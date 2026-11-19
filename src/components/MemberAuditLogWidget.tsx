'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  CreditCard,
  HandCoins,
  KeyRound,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { AuditLogEntry } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, shortHash } from '../utils/format.ts';
import { subscribeRealtimeEvents } from '../utils/realtimeClient.ts';

type MemberAuditFilter = 'all' | 'contributions' | 'loans' | 'repayments' | 'members';

interface MemberAuditLogWidgetProps {
  onViewMemberProfile?: (memberId: string) => void;
}

const CONTRIBUTION_ACTIONS = new Set([
  'CONTRIBUTION_SUBMITTED',
  'CONTRIBUTION_APPROVED',
  'CONTRIBUTION_REJECTED',
]);

const LOAN_ACTIONS = new Set([
  'LOAN_REQUEST_CREATED',
  'LOAN_ADMIN_APPROVED',
  'LOAN_ADMIN_REJECTED',
  'LOAN_QUORUM_APPROVED',
  'LOAN_QUORUM_REJECTED',
  'LOAN_DISBURSED',
  'LOAN_VOTE_INITIATED',
  'LOAN_VOTE_REVEALED',
  'LOAN_GUARANTOR_RESPONDED',
  'LOAN_RESCHEDULE_REQUESTED',
  'LOAN_RESCHEDULE_REVIEWED',
]);

const REPAYMENT_ACTIONS = new Set([
  'REPAYMENT_SUBMITTED',
  'REPAYMENT_VERIFIED',
  'REPAYMENT_REJECTED',
  'LOAN_REPAID_COMPLETED',
]);

const MEMBER_ACCESS_ACTIONS = new Set([
  'MEMBER_SIGNUP_REQUESTED',
  'MEMBER_SIGNUP_APPROVED',
  'MEMBER_SIGNUP_REJECTED',
  'MEMBER_PROFILE_UPDATED',
  'PROFILE_CHANGE_REQUESTED',
  'PROFILE_CHANGE_REVIEWED',
  'MEMBER_RBAC_UPDATED',
]);

function classifyAction(
  action: string,
  t: (key: string) => string
): {
  category: Exclude<MemberAuditFilter, 'all'> | 'other';
  label: string;
  toneClass: string;
  iconBgClass: string;
  Icon: typeof CreditCard;
} {
  if (CONTRIBUTION_ACTIONS.has(action)) {
    const isRejected = action === 'CONTRIBUTION_REJECTED';
    const isApproved = action === 'CONTRIBUTION_APPROVED';
    return {
      category: 'contributions',
      label: isApproved
        ? t('contribVerified')
        : isRejected
          ? t('contribDenied')
          : t('contribSubmitted'),
      toneClass: isRejected
        ? 'text-rose-700 dark:text-rose-400'
        : isApproved
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-amber-700 dark:text-amber-400',
      iconBgClass: isRejected
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
        : isApproved
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: isRejected ? XCircle : isApproved ? CheckCircle2 : CreditCard,
    };
  }

  if (LOAN_ACTIONS.has(action)) {
    const isRejected = action === 'LOAN_ADMIN_REJECTED' || action === 'LOAN_QUORUM_REJECTED';
    const isPositive =
      action === 'LOAN_ADMIN_APPROVED' ||
      action === 'LOAN_QUORUM_APPROVED' ||
      action === 'LOAN_DISBURSED';
    return {
      category: 'loans',
      label:
        action === 'LOAN_REQUEST_CREATED'
          ? t('loanRequested')
          : action === 'LOAN_DISBURSED'
            ? t('loanDisbursed')
            : isRejected
              ? t('loanDeclined')
              : isPositive
                ? t('loanApproved')
                : t('loanWorkflowUpdate'),
      toneClass: isRejected
        ? 'text-rose-700 dark:text-rose-400'
        : isPositive
          ? 'text-teal-700 dark:text-teal-400'
          : 'text-amber-700 dark:text-amber-400',
      iconBgClass: isRejected
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
        : isPositive
          ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: isRejected ? XCircle : HandCoins,
    };
  }

  if (REPAYMENT_ACTIONS.has(action)) {
    const isRejected = action === 'REPAYMENT_REJECTED';
    const isVerified = action === 'REPAYMENT_VERIFIED' || action === 'LOAN_REPAID_COMPLETED';
    return {
      category: 'repayments',
      label: isRejected
        ? t('repayDenied')
        : isVerified
          ? t('repayVerified')
          : t('installmentSubmitted'),
      toneClass: isRejected
        ? 'text-rose-700 dark:text-rose-400'
        : isVerified
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-amber-700 dark:text-amber-400',
      iconBgClass: isRejected
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
        : isVerified
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: isRejected ? XCircle : ShieldCheck,
    };
  }

  if (MEMBER_ACCESS_ACTIONS.has(action)) {
    return {
      category: 'members',
      label: action.includes('PROFILE') ? t('profileChangeActivity') : t('membershipActivity'),
      toneClass: 'text-indigo-700 dark:text-indigo-400',
      iconBgClass: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60',
      Icon: UserCheck,
    };
  }

  if (action.startsWith('COMMUNITY_')) {
    return {
      category: 'other',
      label: t('communityEvent'),
      toneClass: 'text-teal-700 dark:text-teal-400',
      iconBgClass: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60',
      Icon: MessageSquare,
    };
  }

  return {
    category: 'other',
    label: t('coopEvent'),
    toneClass: 'text-slate-700 dark:text-slate-300',
    iconBgClass: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    Icon: KeyRound,
  };
}

export function MemberAuditLogWidget({ onViewMemberProfile }: MemberAuditLogWidgetProps) {
  const t = useTranslations('Admin.auditWidget');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemberAuditFilter>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(12);
  const syncTimerRef = useRef<number | null>(null);

  const tRef = useRef(t);
  tRef.current = t;

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs();
      setLogs(res.logs);
      setChainValid(res.chainValid);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : tRef.current('loadFailed'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs(false);

    const scheduleSync = () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        void loadLogs(true);
      }, 180);
    };

    const unsubscribe = subscribeRealtimeEvents({
      'audit:updated': scheduleSync,
      'contribution:submitted': scheduleSync,
      'contribution:reviewed': scheduleSync,
      'loan:created': scheduleSync,
      'loan:reviewed': scheduleSync,
      'repayment:submitted': scheduleSync,
      'repayment:verified': scheduleSync,
      'profile:update_requested': scheduleSync,
      'profile:update_reviewed': scheduleSync,
      'members:updated': scheduleSync,
    });

    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      unsubscribe();
    };
  }, [loadLogs]);

  const memberActivityLogs = useMemo(() => {
    return logs.filter(
      (entry) =>
        CONTRIBUTION_ACTIONS.has(entry.action) ||
        LOAN_ACTIONS.has(entry.action) ||
        REPAYMENT_ACTIONS.has(entry.action) ||
        MEMBER_ACCESS_ACTIONS.has(entry.action) ||
        entry.actorRole === 'member' ||
        entry.actorRole === 'manager'
    );
  }, [logs]);

  const counts = useMemo(() => {
    let contributions = 0;
    let loans = 0;
    let repayments = 0;
    let members = 0;

    for (const entry of memberActivityLogs) {
      const cat = classifyAction(entry.action, (k) => t(k)).category;
      if (cat === 'contributions') contributions += 1;
      else if (cat === 'loans') loans += 1;
      else if (cat === 'repayments') repayments += 1;
      else if (cat === 'members') members += 1;
    }

    return {
      all: memberActivityLogs.length,
      contributions,
      loans,
      repayments,
      members,
    };
  }, [memberActivityLogs, t]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memberActivityLogs.filter((entry) => {
      const meta = classifyAction(entry.action, (k) => t(k));
      if (filter !== 'all' && meta.category !== filter) return false;
      if (!q) return true;
      return (
        entry.actorName.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.resourceId.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q)
      );
    });
  }, [memberActivityLogs, filter, search, t]);

  const visibleLogs = filteredLogs.slice(0, limit);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      aria-label={t('ariaLabel')}
      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between gap-4"
    >
      <div className="space-y-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <ScrollText className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('oversightFeed')}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span
                className={`font-mono text-[11px] ${
                  chainValid
                    ? 'text-indigo-700 dark:text-indigo-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {chainValid ? t('shaVerified') : t('integrityCheck')}
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('heading')}
            </h3>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs(false)}
            disabled={loading}
            aria-label={t('refreshAria')}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'all', label: t('tabAll'), count: counts.all },
              { id: 'contributions', label: t('tabDeposits'), count: counts.contributions },
              { id: 'loans', label: t('tabLoans'), count: counts.loans },
              { id: 'repayments', label: t('tabRepayments'), count: counts.repayments },
              { id: 'members', label: t('tabAccess'), count: counts.members },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setLimit(12);
                }}
                className={`relative px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="member-audit-filter-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-white dark:bg-slate-800 rounded-md shadow-xs"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
                <span className="relative z-10 font-mono tabular-nums text-[11px] opacity-75">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
          />
        </div>

        {/* Log Stream */}
        {loading && logs.length === 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 flex items-start gap-2.5">
                <Skeleton width={28} height={28} borderRadius={6} />
                <div className="flex-1 space-y-1">
                  <Skeleton width="55%" height={12} />
                  <Skeleton width="88%" height={14} />
                  <Skeleton width="45%" height={11} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300"
          >
            {error}
          </div>
        ) : visibleLogs.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
            {t('emptyFiltered')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg max-h-[300px] overflow-y-auto scrollbar-subtle">
            {visibleLogs.map((entry) => {
              const meta = classifyAction(entry.action, (k) => t(k));
              const Icon = meta.Icon;
              const canOpenProfile =
                Boolean(onViewMemberProfile) &&
                entry.actorId &&
                entry.actorId !== 'anon-ballot' &&
                entry.actorId !== 'system';

              return (
                <div
                  key={entry.id}
                  className="p-3 flex items-start gap-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div
                    className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${meta.iconBgClass} ${meta.toneClass}`}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px]">
                      <span className={`font-semibold ${meta.toneClass}`}>{meta.label}</span>
                      <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                      {entry.summary}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {canOpenProfile ? (
                        <button
                          type="button"
                          onClick={() => onViewMemberProfile?.(entry.actorId)}
                          className="font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                        >
                          {entry.actorName}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {entry.actorName}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{entry.resourceId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{shortHash(entry.entryHash)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Pagination */}
      {filteredLogs.length > visibleLogs.length && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            {t('showingCount', { shown: visibleLogs.length, total: filteredLogs.length })}
          </span>
          <button
            type="button"
            onClick={() => setLimit((n) => n + 15)}
            className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            {t('loadMore')}
          </button>
        </div>
      )}
    </motion.section>
  );
}
