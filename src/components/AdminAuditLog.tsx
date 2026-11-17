'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  HandCoins,
  KeyRound,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { AuditLogEntry, PublicUser, UserRole } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, shortHash } from '../utils/format.ts';
import { MotionCard } from './MotionCard.tsx';

type AuditCategoryFilter =
  | 'all'
  | 'loan_changes'
  | 'contributions'
  | 'system_settings'
  | 'user_access'
  | 'rejections';

interface AdminAuditLogProps {
  user: PublicUser;
  initialLogs?: AuditLogEntry[];
  initialChainValid?: boolean;
  externalLoading?: boolean;
  onRefreshExternal?: () => Promise<void>;
  compactHeader?: boolean;
}

const USER_APPROVAL_ACTIONS = new Set([
  'MEMBER_SIGNUP_REQUESTED',
  'MEMBER_SIGNUP_APPROVED',
  'MEMBER_SIGNUP_REJECTED',
  'MEMBER_CREATED_BY_ADMIN',
  'MEMBER_SUSPENDED',
  'MEMBER_REACTIVATED',
  'MEMBER_REMOVED_BY_ADMIN',
  'MEMBER_RBAC_UPDATED',
  'MEMBER_PROFILE_UPDATED',
  'AUTH_LOGIN',
  'COMMUNITY_MEMBER_MUTED',
  'COMMUNITY_MEMBER_UNMUTED',
]);

const REJECTION_ACTIONS = new Set([
  'MEMBER_SIGNUP_REJECTED',
  'MEMBER_REMOVED_BY_ADMIN',
  'MEMBER_SUSPENDED',
  'LOAN_ADMIN_REJECTED',
  'LOAN_QUORUM_REJECTED',
  'CONTRIBUTION_REJECTED',
  'REPAYMENT_REJECTED',
  'COMMUNITY_POST_DELETED_BY_ADMIN',
  'COMMUNITY_COMMENT_DELETED_BY_ADMIN',
  'COMMUNITY_POST_HIDE',
  'COMMUNITY_MEMBER_MUTED',
]);

const LOAN_STATUS_ACTIONS = new Set([
  'LOAN_REQUEST_CREATED',
  'LOAN_ADMIN_APPROVED',
  'LOAN_ADMIN_REJECTED',
  'LOAN_QUORUM_APPROVED',
  'LOAN_QUORUM_REJECTED',
  'LOAN_DISBURSED',
  'LOAN_REPAID_COMPLETED',
  'LOAN_VOTE_CAST',
  'HALAL_PROJECT_CREATED',
  'INVESTMENT_VOTE_CAST',
]);

const CONTRIBUTION_PAYMENT_ACTIONS = new Set([
  'CONTRIBUTION_SUBMITTED',
  'CONTRIBUTION_APPROVED',
  'CONTRIBUTION_REJECTED',
  'REPAYMENT_SUBMITTED',
  'REPAYMENT_VERIFIED',
  'REPAYMENT_REJECTED',
]);

const SYSTEM_SETTINGS_ACTIONS = new Set([
  'FUND_POLICY_UPDATED',
  'GOOGLE_SHEET_SYNCED',
  'GMAIL_NOTIFICATIONS_DISPATCHED',
  'REMINDER_BATCH_GENERATED',
  'REPORT_EXPORTED',
]);

function getAuditVisualMeta(action: string) {
  if (
    action === 'MEMBER_SIGNUP_APPROVED' ||
    action === 'MEMBER_REACTIVATED' ||
    action === 'MEMBER_CREATED_BY_ADMIN'
  ) {
    return {
      label: 'Member Approved & Active',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: UserCheck,
    };
  }
  if (
    action === 'MEMBER_SIGNUP_REJECTED' ||
    action === 'MEMBER_REMOVED_BY_ADMIN' ||
    action === 'MEMBER_SUSPENDED'
  ) {
    return {
      label: 'Member Declined / Access Revoked',
      tone: 'text-rose-700 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60',
      Icon: UserX,
    };
  }
  if (
    action === 'LOAN_ADMIN_REJECTED' ||
    action === 'LOAN_QUORUM_REJECTED' ||
    action === 'CONTRIBUTION_REJECTED' ||
    action === 'REPAYMENT_REJECTED'
  ) {
    return {
      label: 'Rejected Request',
      tone: 'text-rose-700 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60',
      Icon: XCircle,
    };
  }
  if (action === 'LOAN_REQUEST_CREATED') {
    return {
      label: 'New Loan Request',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: HandCoins,
    };
  }
  if (
    action === 'LOAN_ADMIN_APPROVED' ||
    action === 'LOAN_QUORUM_APPROVED' ||
    action === 'LOAN_DISBURSED' ||
    action === 'LOAN_REPAID_COMPLETED'
  ) {
    return {
      label: 'Loan Status Update',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'LOAN_VOTE_CAST' || action === 'INVESTMENT_VOTE_CAST' || action === 'HALAL_PROJECT_CREATED') {
    return {
      label: 'Anonymized Ballot Event',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'CONTRIBUTION_SUBMITTED' || action === 'REPAYMENT_SUBMITTED') {
    return {
      label: 'Payment Submitted',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: CreditCard,
    };
  }
  if (action === 'CONTRIBUTION_APPROVED' || action === 'REPAYMENT_VERIFIED') {
    return {
      label: 'Contribution / Payment Verified',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: CheckCircle2,
    };
  }
  if (action === 'FUND_POLICY_UPDATED') {
    return {
      label: 'System Settings Update',
      tone: 'text-teal-700 dark:text-teal-400',
      iconBg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60',
      Icon: Settings,
    };
  }
  if (action === 'MEMBER_SIGNUP_REQUESTED') {
    return {
      label: 'New Member Application',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: UserCheck,
    };
  }
  if (action === 'AUTH_LOGIN' || action === 'MEMBER_RBAC_UPDATED' || action === 'MEMBER_PROFILE_UPDATED') {
    return {
      label: 'Security & Member Access',
      tone: 'text-indigo-700 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60',
      Icon: KeyRound,
    };
  }
  if (action.startsWith('COMMUNITY_')) {
    const isModerationRemoval =
      action.includes('DELETED_BY_ADMIN') ||
      action === 'COMMUNITY_POST_HIDE' ||
      action === 'COMMUNITY_MEMBER_MUTED';
    return {
      label: isModerationRemoval ? 'Community Moderation' : 'Community Activity',
      tone: isModerationRemoval
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-emerald-700 dark:text-emerald-400',
      iconBg: isModerationRemoval
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: MessageSquare,
    };
  }
  return {
    label: 'System & Ledger Sync',
    tone: 'text-teal-700 dark:text-teal-400',
    iconBg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60',
    Icon: Settings,
  };
}

export function AdminAuditLog({
  user,
  initialLogs,
  initialChainValid,
  externalLoading,
  onRefreshExternal,
  compactHeader = false,
}: AdminAuditLogProps) {
  const canViewAuditLogs = user.role === 'admin' || user.role === 'manager';

  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs || []);
  const [chainValid, setChainValid] = useState<boolean>(initialChainValid ?? true);
  const [loading, setLoading] = useState<boolean>(initialLogs ? Boolean(externalLoading) : true);
  const [error, setError] = useState<string | null>(null);

  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [streamPaused, setStreamPaused] = useState(false);
  const [queuedLiveEvents, setQueuedLiveEvents] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [newEntryIds, setNewEntryIds] = useState<string[]>([]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const streamPausedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<AuditCategoryFilter>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(25);

  useEffect(() => {
    streamPausedRef.current = streamPaused;
  }, [streamPaused]);

  useEffect(() => {
    if (initialLogs !== undefined) {
      setLogs(initialLogs);
      initialLogs.forEach((l) => knownIdsRef.current.add(l.id));
      hasLoadedOnceRef.current = true;
    }
  }, [initialLogs]);

  useEffect(() => {
    if (initialChainValid !== undefined) {
      setChainValid(initialChainValid);
    }
  }, [initialChainValid]);

  useEffect(() => {
    if (externalLoading !== undefined) {
      setLoading(externalLoading);
    }
  }, [externalLoading]);

  const fetchAuditLogs = useCallback(
    async (silent = false) => {
      if (!canViewAuditLogs) {
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        if (onRefreshExternal && !silent) {
          await onRefreshExternal();
        } else {
          const res = await api.getAuditLogs();
          const arrivedIds: string[] = [];
          if (hasLoadedOnceRef.current) {
            for (const entry of res.logs) {
              if (!knownIdsRef.current.has(entry.id)) {
                arrivedIds.push(entry.id);
              }
            }
          }
          res.logs.forEach((entry) => knownIdsRef.current.add(entry.id));
          hasLoadedOnceRef.current = true;

          setLogs(res.logs);
          setChainValid(res.chainValid);
          setLastSyncedAt(new Date().toISOString());
          setQueuedLiveEvents(0);

          if (arrivedIds.length > 0) {
            setNewEntryIds((prev) => Array.from(new Set([...arrivedIds, ...prev])).slice(0, 20));
          }
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load site activity feed.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [canViewAuditLogs, onRefreshExternal]
  );

  // Fade out live highlight tags after 15s
  useEffect(() => {
    if (newEntryIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setNewEntryIds([]);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [newEntryIds]);

  // Initial load
  useEffect(() => {
    if (initialLogs === undefined) {
      void fetchAuditLogs(false);
    }
  }, [initialLogs, fetchAuditLogs]);

  // Direct real-time SSE feed for critical site activity
  useEffect(() => {
    if (!canViewAuditLogs) return;

    const es = new EventSource('/api/events', { withCredentials: true });
    const scheduleSilentSync = () => {
      if (streamPausedRef.current) {
        setQueuedLiveEvents((n) => n + 1);
        return;
      }
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        void fetchAuditLogs(true);
      }, 160);
    };

    es.addEventListener('connected', () => {
      setStreamStatus('live');
    });
    es.onopen = () => {
      setStreamStatus('live');
    };
    es.onerror = () => {
      setStreamStatus('reconnecting');
    };

    const liveEvents = [
      'audit:updated',
      'loan:created',
      'loan:reviewed',
      'loan:voted',
      'contribution:submitted',
      'contribution:reviewed',
      'repayment:submitted',
      'repayment:verified',
      'config:updated',
      'members:updated',
      'investment:created',
      'investment:voted',
      'notification:created',
      'sheet:synced',
      'community:updated',
    ];
    liveEvents.forEach((evtName) => {
      es.addEventListener(evtName, scheduleSilentSync);
    });

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      es.close();
    };
  }, [canViewAuditLogs, fetchAuditLogs]);

  const metrics = useMemo(() => {
    const loanStatusEvents = logs.filter((l) => LOAN_STATUS_ACTIONS.has(l.action)).length;
    const contributionEvents = logs.filter((l) => CONTRIBUTION_PAYMENT_ACTIONS.has(l.action)).length;
    const systemSettingsEvents = logs.filter((l) => SYSTEM_SETTINGS_ACTIONS.has(l.action)).length;
    const userEvents = logs.filter((l) => USER_APPROVAL_ACTIONS.has(l.action)).length;
    const rejectedEvents = logs.filter((l) => REJECTION_ACTIONS.has(l.action)).length;
    return {
      total: logs.length,
      loanStatusEvents,
      contributionEvents,
      systemSettingsEvents,
      userEvents,
      rejectedEvents,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (categoryFilter === 'loan_changes' && !LOAN_STATUS_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'contributions' && !CONTRIBUTION_PAYMENT_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'system_settings' && !SYSTEM_SETTINGS_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'user_access' && !USER_APPROVAL_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'rejections' && !REJECTION_ACTIONS.has(entry.action)) {
        return false;
      }

      if (roleFilter !== 'all' && entry.actorRole !== roleFilter) {
        return false;
      }

      if (!q) return true;
      const payloadText = entry.decryptedPayload
        ? JSON.stringify(entry.decryptedPayload).toLowerCase()
        : '';
      return (
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.resourceId.toLowerCase().includes(q) ||
        entry.resourceType.toLowerCase().includes(q) ||
        payloadText.includes(q)
      );
    });
  }, [logs, categoryFilter, roleFilter, searchQuery]);

  if (!canViewAuditLogs) {
    return (
      <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Administrator Access Required
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Real-time site activity and cryptographic hash-chain inspection are restricted to
          cooperative administrators.
        </p>
      </div>
    );
  }

  const displayedLogs = filteredLogs.slice(0, visibleLimit);
  const hasMoreLogs = filteredLogs.length > visibleLimit;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* KPI Summary Strip */}
      {!compactHeader && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MotionCard
            hue="violet"
            delay={0.02}
            className="border rounded-2xl p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Total Site Events</span>
              <ScrollText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? <Skeleton width={48} height={28} /> : metrics.total}
            </div>
            <div
              className={`text-xs font-medium inline-flex items-center gap-1 ${
                chainValid
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {chainValid ? (
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{chainValid ? 'SHA-256 Chain Verified' : 'Chain Integrity Alert'}</span>
            </div>
          </MotionCard>

          <MotionCard
            hue="amber"
            delay={0.06}
            className="border rounded-2xl p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Loan Requests &amp; Votes</span>
              <HandCoins className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.loanStatusEvents
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Applications, 2/3 ballots, reviews &amp; payouts
            </div>
          </MotionCard>

          <MotionCard
            hue="emerald"
            delay={0.1}
            className="border rounded-2xl p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Contributions &amp; Repayments</span>
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.contributionEvents
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Monthly Bank/MFS deposits &amp; installments
            </div>
          </MotionCard>

          <MotionCard
            hue="teal"
            delay={0.14}
            className="border rounded-2xl p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Settings &amp; Member Registry</span>
              <Settings className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.systemSettingsEvents + metrics.userEvents
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {metrics.systemSettingsEvents} policy/sync · {metrics.userEvents} member events
            </div>
          </MotionCard>
        </div>
      )}

      {/* Real-Time Site Activity Feed Panel */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Real-Time Site Activity Feed</span>
              </h2>

              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  streamPaused
                    ? 'text-amber-700 dark:text-amber-400'
                    : streamStatus === 'live'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {streamPaused
                    ? 'Stream Paused'
                    : streamStatus === 'live'
                      ? 'Live Stream Active'
                      : streamStatus === 'reconnecting'
                        ? 'Reconnecting…'
                        : 'Connecting…'}
                </span>
              </span>

              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>

              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  chainValid
                    ? 'text-indigo-700 dark:text-indigo-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {chainValid ? (
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{chainValid ? 'SHA-256 Verified' : 'Chain Alert'}</span>
              </span>
            </div>

            {lastSyncedAt && (
              <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                Last synced {formatDateTime(lastSyncedAt)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (streamPaused) {
                  setStreamPaused(false);
                  void fetchAuditLogs(true);
                } else {
                  setStreamPaused(true);
                }
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                streamPaused
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {streamPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resume Live</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pause Feed</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void fetchAuditLogs(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => window.location.assign('/api/reports/export?type=audit')}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>

        {streamPaused && queuedLiveEvents > 0 && (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <span>
              {queuedLiveEvents} new activity event{queuedLiveEvents === 1 ? '' : 's'} received
              while paused.
            </span>
            <button
              type="button"
              onClick={() => {
                setStreamPaused(false);
                void fetchAuditLogs(true);
              }}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shrink-0"
            >
              Sync Now
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Filter Bar: Critical Site Activity Categories + Actor Role + Search */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `All Activity (${metrics.total})` },
                { id: 'loan_changes', label: `Loans & Ballots (${metrics.loanStatusEvents})` },
                { id: 'contributions', label: `Contributions & Payments (${metrics.contributionEvents})` },
                { id: 'system_settings', label: `System Settings (${metrics.systemSettingsEvents})` },
                { id: 'user_access', label: `Member Registry (${metrics.userEvents})` },
                { id: 'rejections', label: `Rejections (${metrics.rejectedEvents})` },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(tab.id);
                    setVisibleLimit(25);
                  }}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="audit-category-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by actor role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as 'all' | UserRole);
                setVisibleLimit(25);
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Actor Roles</option>
              <option value="admin">Admin Only</option>
              <option value="manager">Manager Only</option>
              <option value="member">Member Only</option>
            </select>

            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLimit(25);
                }}
                placeholder="Search actor, action, ID, summary…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Live Site Activity Stream */}
        {loading && logs.length === 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 flex items-start justify-between gap-3 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-start gap-3 flex-1">
                  <Skeleton width={36} height={36} borderRadius={8} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton width="45%" height={14} />
                    <Skeleton width="82%" height={16} />
                    <Skeleton width="55%" height={12} />
                  </div>
                </div>
                <Skeleton width={130} height={30} borderRadius={8} />
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-center space-y-1.5">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No matching site activity records found
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adjust your category filter, role filter, or search query to inspect other events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {displayedLogs.map((entry) => {
              const isOpen = expandedLogId === entry.id;
              const isJustArrived = newEntryIds.includes(entry.id);
              const visual = getAuditVisualMeta(entry.action);
              const Icon = visual.Icon;

              return (
                <div
                  key={entry.id}
                  className={`p-4 transition-colors space-y-3 ${
                    isJustArrived
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/25 ring-1 ring-inset ring-emerald-500/30'
                      : 'bg-white/50 dark:bg-slate-900/50 hover:bg-slate-50/70 dark:hover:bg-slate-900/75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${visual.iconBg} ${visual.tone}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          {isJustArrived && (
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              LIVE
                            </span>
                          )}
                          <span className={`font-semibold ${visual.tone}`}>{visual.label}</span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {entry.action}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {entry.resourceType}:{entry.resourceId}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                          {entry.summary}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Actor:{' '}
                            <strong className="font-medium text-slate-700 dark:text-slate-300">
                              {entry.actorName}
                            </strong>{' '}
                            (<span className="capitalize">{entry.actorRole}</span>)
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDateTime(entry.timestamp)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">Hash {shortHash(entry.entryHash)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isOpen ? null : entry.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 shrink-0 cursor-pointer self-start"
                    >
                      <span>{isOpen ? 'Hide Envelope' : 'Inspect Hash & Payload'}</span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16 }}
                        className="ml-0 sm:ml-12 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-indigo-200/80 dark:border-indigo-900/50 space-y-2.5 text-[11px]"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-slate-600 dark:text-slate-400 break-all">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Audit ID:</span>{' '}
                            {entry.id}
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Prev Hash:</span>{' '}
                            {shortHash(entry.prevHash)}
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-indigo-600 dark:text-indigo-400">Entry SHA-256:</span>{' '}
                            {entry.entryHash}
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-indigo-600 dark:text-indigo-400">
                              AES-256-GCM Ciphertext:
                            </span>{' '}
                            {entry.encryptedPayload.ciphertext.slice(0, 72)}…
                          </div>
                        </div>

                        {entry.decryptedPayload && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                            <div className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 mb-1.5">
                              Decrypted Audit Metadata
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                              {Object.entries(entry.decryptedPayload).map(([k, v]) => (
                                <div
                                  key={k}
                                  className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 break-all"
                                >
                                  <span className="text-slate-500 dark:text-slate-400">{k}:</span>{' '}
                                  <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Count & Pagination */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Showing {displayedLogs.length} of {filteredLogs.length} matching activity entries
            </span>

            {hasMoreLogs && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + 25)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Load 25 More
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(filteredLogs.length)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                >
                  Show All ({filteredLogs.length})
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}
