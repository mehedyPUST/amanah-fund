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
  FileJson,
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
import { useLocale, useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
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
  'FUND_CONFIG_INITIALIZED',
  'GOOGLE_SHEET_SYNCED',
  'GMAIL_NOTIFICATIONS_DISPATCHED',
  'REMINDER_BATCH_GENERATED',
  'REPORT_EXPORTED',
]);

interface ChangeDiffEntry {
  field: string;
  from: unknown;
  to: unknown;
}

function extractChangeDiffs(payload?: Record<string, unknown>): ChangeDiffEntry[] {
  if (!payload || typeof payload.changes !== 'object' || payload.changes === null) {
    return [];
  }
  const raw = payload.changes as Record<string, { from?: unknown; to?: unknown }>;
  return Object.entries(raw).map(([field, delta]) => ({
    field,
    from: delta?.from,
    to: delta?.to,
  }));
}

function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getAuditVisualMeta(action: string) {
  if (
    action === 'MEMBER_SIGNUP_APPROVED' ||
    action === 'MEMBER_REACTIVATED' ||
    action === 'MEMBER_CREATED_BY_ADMIN'
  ) {
    return {
      labelKey: 'memberApproved' as const,
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
      labelKey: 'memberDeclined' as const,
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
      labelKey: 'rejectedRequest' as const,
      tone: 'text-rose-700 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60',
      Icon: XCircle,
    };
  }
  if (action === 'LOAN_REQUEST_CREATED') {
    return {
      labelKey: 'newLoanRequest' as const,
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
      labelKey: 'loanStatusUpdate' as const,
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'LOAN_VOTE_CAST' || action === 'INVESTMENT_VOTE_CAST' || action === 'HALAL_PROJECT_CREATED') {
    return {
      labelKey: 'anonymizedBallot' as const,
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'CONTRIBUTION_SUBMITTED' || action === 'REPAYMENT_SUBMITTED') {
    return {
      labelKey: 'paymentSubmitted' as const,
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: CreditCard,
    };
  }
  if (action === 'CONTRIBUTION_APPROVED' || action === 'REPAYMENT_VERIFIED') {
    return {
      labelKey: 'contributionVerified' as const,
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: CheckCircle2,
    };
  }
  if (action === 'FUND_POLICY_UPDATED') {
    return {
      labelKey: 'systemSettingsUpdate' as const,
      tone: 'text-teal-700 dark:text-teal-400',
      iconBg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60',
      Icon: Settings,
    };
  }
  if (action === 'MEMBER_SIGNUP_REQUESTED') {
    return {
      labelKey: 'newMemberApplication' as const,
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: UserCheck,
    };
  }
  if (action === 'AUTH_LOGIN' || action === 'MEMBER_RBAC_UPDATED' || action === 'MEMBER_PROFILE_UPDATED') {
    return {
      labelKey: 'securityMemberAccess' as const,
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
      labelKey: isModerationRemoval ? ('communityModeration' as const) : ('communityActivity' as const),
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
    labelKey: 'systemLedgerSync' as const,
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
  const t = useTranslations('Admin.audit');
  const tSys = useTranslations('Admin.systemAudit');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const canViewAuditLogs = user.role === 'admin' || user.role === 'manager';

  const getVisualMeta = (action: string) => {
    const raw = getAuditVisualMeta(action);
    return {
      ...raw,
      label: t(`labels.${raw.labelKey}` as const),
    };
  };

  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs || []);
  const [chainValid, setChainValid] = useState<boolean>(initialChainValid ?? true);
  const [integrity, setIntegrity] = useState<{
    totalEntries: number;
    verifiedEntries: number;
    brokenLinks: string[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(initialLogs ? Boolean(externalLoading) : true);
  const [verifying, setVerifying] = useState(false);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
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
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
    async (silent = false, showVerifyBanner = false) => {
      if (!canViewAuditLogs) {
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      if (showVerifyBanner) {
        setVerifying(true);
      }
      setError(null);
      try {
        if (onRefreshExternal && !silent && !showVerifyBanner) {
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
          setIntegrity(
            res.integrity || {
              totalEntries: res.logs.length,
              verifiedEntries: res.logs.length,
              brokenLinks: [],
            }
          );
          setLastSyncedAt(new Date().toISOString());
          setQueuedLiveEvents(0);

          if (showVerifyBanner) {
            const total = res.integrity?.totalEntries ?? res.logs.length;
            const verified = res.integrity?.verifiedEntries ?? res.logs.length;
            setVerificationNote(
              res.chainValid
                ? tSys('verifySuccess', { verified, total })
                : tSys('verifyMismatch', { count: res.integrity?.brokenLinks.length || 1 })
            );
          }

          if (arrivedIds.length > 0) {
            setNewEntryIds((prev) => Array.from(new Set([...arrivedIds, ...prev])).slice(0, 20));
          }
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : t('loadFailed'));
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
        if (showVerifyBanner) {
          setVerifying(false);
        }
      }
    },
    [canViewAuditLogs, onRefreshExternal, t, tSys]
  );

  // Fade out live highlight tags after 15s
  useEffect(() => {
    if (newEntryIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setNewEntryIds([]);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [newEntryIds]);

  // Initial load & manual API refresh
  useEffect(() => {
    if (initialLogs === undefined) {
      void fetchAuditLogs(false);
    }
    const handleGlobalRefresh = () => {
      void fetchAuditLogs(true);
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [initialLogs, fetchAuditLogs]);

  // Direct real-time SSE feed for critical site activity
  useEffect(() => {
    if (!canViewAuditLogs) return;

    const es = new EventSource(api.getEventsStreamUrl(), { withCredentials: true });
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

  const actorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    for (const log of logs) {
      if (!map.has(log.actorId)) {
        map.set(log.actorId, {
          id: log.actorId,
          name: log.actorName,
          role: log.actorRole,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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
      if (actorFilter !== 'all' && entry.actorId !== actorFilter) {
        return false;
      }

      const entryDate = entry.timestamp.slice(0, 10);
      if (dateFrom && entryDate < dateFrom) return false;
      if (dateTo && entryDate > dateTo) return false;

      if (!q) return true;
      const payloadText = entry.decryptedPayload
        ? JSON.stringify(entry.decryptedPayload).toLowerCase()
        : '';
      return (
        entry.id.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.resourceId.toLowerCase().includes(q) ||
        entry.resourceType.toLowerCase().includes(q) ||
        entry.entryHash.toLowerCase().includes(q) ||
        payloadText.includes(q)
      );
    });
  }, [logs, categoryFilter, roleFilter, actorFilter, dateFrom, dateTo, searchQuery]);

  function handleResetFilters() {
    setCategoryFilter('all');
    setRoleFilter('all');
    setActorFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setVisibleLimit(25);
  }

  function handleExportImmutableJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: `${user.name} (${user.memberCode})`,
      immutabilityModel: 'Append-only SHA-256 hash chain with AES-256-GCM encrypted payload envelopes',
      chainValid,
      integrity: integrity || {
        totalEntries: logs.length,
        verifiedEntries: logs.length,
        brokenLinks: [],
      },
      count: filteredLogs.length,
      records: filteredLogs.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        summary: entry.summary,
        prevHash: entry.prevHash,
        entryHash: entry.entryHash,
        hashVerified: entry.hashVerified,
        chainLinkVerified: entry.chainLinkVerified,
        metadata: entry.decryptedPayload || null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amanah-audit-proof-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!canViewAuditLogs) {
    return (
      <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {t('accessRequiredTitle')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {t('accessRequiredDesc')}
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
      className="space-y-4 sm:space-y-6"
    >
      {/* KPI Summary Strip */}
      {!compactHeader && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <MotionCard
            hue="violet"
            delay={0.02}
            className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>{t('kpiTotalEvents')}</span>
              <ScrollText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? <Skeleton width={48} height={28} /> : metrics.total}
            </div>
            <div
              className={`text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 ${
                chainValid
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {chainValid ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{chainValid ? t('chainVerified') : t('chainAlert')}</span>
            </div>
          </MotionCard>

          <MotionCard
            hue="amber"
            delay={0.06}
            className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>{t('kpiLoanEvents')}</span>
              <HandCoins className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.loanStatusEvents
              )}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('kpiLoanDesc')}
            </div>
          </MotionCard>

          <MotionCard
            hue="emerald"
            delay={0.1}
            className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>{t('kpiContributionEvents')}</span>
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.contributionEvents
              )}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('kpiContributionDesc')}
            </div>
          </MotionCard>

          <MotionCard
            hue="teal"
            delay={0.14}
            className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
          >
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>{t('kpiSettingsEvents')}</span>
              <Settings className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? (
                <Skeleton width={48} height={28} />
              ) : (
                metrics.systemSettingsEvents + metrics.userEvents
              )}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t('kpiSettingsBreakdown', {
                policyCount: metrics.systemSettingsEvents,
                userCount: metrics.userEvents,
              })}
            </div>
          </MotionCard>
        </div>
      )}

      {/* Real-Time Site Activity Feed Panel */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 sm:space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{t('feedTitle')}</span>
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
                    ? t('streamPaused')
                    : streamStatus === 'live'
                      ? t('streamLive')
                      : streamStatus === 'reconnecting'
                        ? t('streamReconnecting')
                        : t('streamConnecting')}
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
                <span>{chainValid ? t('shaVerified') : t('shaAlert')}</span>
              </span>
            </div>

            {lastSyncedAt && (
              <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                {t('lastSynced', { date: formatDateTime(lastSyncedAt) })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
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
              className={`px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                streamPaused
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {streamPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('resumeLive')}</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('pauseFeed')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void fetchAuditLogs(false, true)}
              disabled={loading || verifying}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${loading || verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? tSys('verifying') : tSys('verifyChain')}</span>
            </button>

            <button
              type="button"
              onClick={handleExportImmutableJson}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <FileJson className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>{tSys('exportJsonProof')}</span>
            </button>

            <button
              type="button"
              onClick={() => window.location.assign(api.getCsvReportExportUrl('audit'))}
              className="px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportCsv')}</span>
            </button>
          </div>
        </div>

        {verificationNote && (
          <div
            role="status"
            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
              chainValid
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-800 dark:text-red-300'
            }`}
          >
            <span className="inline-flex items-center gap-2 font-medium">
              {chainValid ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{verificationNote}</span>
            </span>
            <button
              type="button"
              onClick={() => setVerificationNote(null)}
              className="text-xs underline cursor-pointer shrink-0"
            >
              {tSys('dismiss')}
            </button>
          </div>
        )}

        {streamPaused && queuedLiveEvents > 0 && (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <span>
              {t('queuedPausedEvents', { count: queuedLiveEvents })}
            </span>
            <button
              type="button"
              onClick={() => {
                setStreamPaused(false);
                void fetchAuditLogs(true);
              }}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shrink-0"
            >
              {t('syncNow')}
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

        {/* Filter Bar: Activity Categories + Role, Actor, Date Range & Search */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-nowrap xl:flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto no-scrollbar w-full xl:w-fit">
            {(
              [
                { id: 'all', label: t('tabAll', { count: metrics.total }) },
                { id: 'loan_changes', label: t('tabLoans', { count: metrics.loanStatusEvents }) },
                { id: 'contributions', label: t('tabContributions', { count: metrics.contributionEvents }) },
                { id: 'system_settings', label: t('tabSettings', { count: metrics.systemSettingsEvents }) },
                { id: 'user_access', label: t('tabMembers', { count: metrics.userEvents }) },
                { id: 'rejections', label: t('tabRejections', { count: metrics.rejectedEvents }) },
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
                  className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              aria-label={t('filterRoleAria')}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as 'all' | UserRole);
                setVisibleLimit(25);
              }}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t('roleAll')}</option>
              <option value="admin">{t('roleAdmin')}</option>
              <option value="manager">{t('roleManager')}</option>
              <option value="member">{t('roleMember')}</option>
            </select>

            <select
              aria-label={tSys('actorFilterLabel')}
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setVisibleLimit(25);
              }}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{tSys('allAdminsManagers')}</option>
              {actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({translateRoleLabel(actor.role, locale)})
                </option>
              ))}
            </select>

            <input
              type="date"
              aria-label={tSys('fromDateLabel')}
              title={tSys('fromDateLabel')}
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setVisibleLimit(25);
              }}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            />

            <input
              type="date"
              aria-label={tSys('toDateLabel')}
              title={tSys('toDateLabel')}
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setVisibleLimit(25);
              }}
              className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            />

            <div className="relative col-span-2 lg:col-span-1">
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
                placeholder={t('searchPlaceholder')}
                className="w-full pl-8 pr-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
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
          <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-center space-y-2.5">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('emptyTitle')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('emptyDesc')}
            </p>
            {(categoryFilter !== 'all' ||
              roleFilter !== 'all' ||
              actorFilter !== 'all' ||
              Boolean(dateFrom) ||
              Boolean(dateTo) ||
              Boolean(searchQuery.trim())) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {tCommon('resetFilters')}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {displayedLogs.map((entry) => {
              const isOpen = expandedLogId === entry.id;
              const isJustArrived = newEntryIds.includes(entry.id);
              const visual = getVisualMeta(entry.action);
              const Icon = visual.Icon;
              const diffs = extractChangeDiffs(entry.decryptedPayload);

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
                              {t('liveBadge')}
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
                            {t('actorLabel')}{' '}
                            <strong className="font-medium text-slate-700 dark:text-slate-300">
                              {entry.actorName}
                            </strong>{' '}
                            (<span>{translateRoleLabel(entry.actorRole, locale)}</span>)
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDateTime(entry.timestamp)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{t('hashLabel', { hash: shortHash(entry.entryHash) })}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isOpen ? null : entry.id)}
                      className="w-full sm:w-auto px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer self-start"
                    >
                      <span>{isOpen ? t('hideEnvelope') : t('inspectEnvelope')}</span>
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
                            <span className="text-slate-400 dark:text-slate-500">{t('auditId')}</span>{' '}
                            {entry.id}
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">{t('prevHash')}</span>{' '}
                            {shortHash(entry.prevHash)}
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-indigo-600 dark:text-indigo-400">{t('entrySha')}</span>{' '}
                            {entry.entryHash}
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-indigo-600 dark:text-indigo-400">
                              {t('ciphertext')}
                            </span>{' '}
                            {entry.encryptedPayload.ciphertext.slice(0, 72)}…
                          </div>
                        </div>

                        {diffs.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {tSys('modifiedFieldsHeader')}
                            </div>
                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                              <table className="w-full text-left border-collapse text-[11px] font-mono">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                                    <th className="py-1.5 px-3 font-medium">{tSys('colField')}</th>
                                    <th className="py-1.5 px-3 font-medium">{tSys('colPrevValue')}</th>
                                    <th className="py-1.5 px-3 font-medium">{tSys('colNewValue')}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {diffs.map((d) => (
                                    <tr key={d.field}>
                                      <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                                        {d.field}
                                      </td>
                                      <td className="py-1.5 px-3 text-rose-700 dark:text-rose-400 break-all">
                                        {formatDiffValue(d.from)}
                                      </td>
                                      <td className="py-1.5 px-3 text-emerald-700 dark:text-emerald-400 break-all">
                                        {formatDiffValue(d.to)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {entry.decryptedPayload && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                            <div className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 mb-1.5">
                              {t('decryptedMetadata')}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                              {Object.entries(entry.decryptedPayload)
                                .filter(([k]) => k !== 'changes')
                                .map(([k, v]) => (
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {t('showingCount', { shown: displayedLogs.length, total: filteredLogs.length })}
            </span>

            {hasMoreLogs && (
              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + 25)}
                  className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
                >
                  {t('loadMore')}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(filteredLogs.length)}
                  className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 inline-flex items-center justify-center cursor-pointer"
                >
                  {t('showAll', { count: filteredLogs.length })}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}
