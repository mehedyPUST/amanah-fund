'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  HandCoins,
  KeyRound,
  Lock,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { AuditLogEntry, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, shortHash } from '../utils/format.ts';
import { MotionCard } from './MotionCard.tsx';

type AdminAuditCategory =
  | 'all'
  | 'user_approvals'
  | 'setting_changes'
  | 'member_governance'
  | 'financial_reviews'
  | 'moderation_sync';

interface SystemAuditLogsViewProps {
  user: PublicUser;
}

const USER_APPROVAL_ACTIONS = new Set([
  'MEMBER_SIGNUP_APPROVED',
  'MEMBER_SIGNUP_REJECTED',
  'MEMBER_CREATED_BY_ADMIN',
]);

const SETTING_CHANGE_ACTIONS = new Set([
  'FUND_POLICY_UPDATED',
  'FUND_CONFIG_INITIALIZED',
]);

const MEMBER_GOVERNANCE_ACTIONS = new Set([
  'MEMBER_RBAC_UPDATED',
  'MEMBER_SUSPENDED',
  'MEMBER_REACTIVATED',
  'MEMBER_REMOVED_BY_ADMIN',
]);

const FINANCIAL_REVIEW_ACTIONS = new Set([
  'CONTRIBUTION_APPROVED',
  'CONTRIBUTION_REJECTED',
  'LOAN_ADMIN_APPROVED',
  'LOAN_ADMIN_REJECTED',
  'LOAN_DISBURSED',
  'LOAN_RESCHEDULE_APPROVED',
  'LOAN_RESCHEDULE_REJECTED',
  'REPAYMENT_VERIFIED',
  'REPAYMENT_REJECTED',
  'HALAL_PROJECT_PROPOSED',
  'HALAL_PROJECT_CREATED',
  'HALAL_PROFIT_DISTRIBUTED',
]);

const MODERATION_AND_SYNC_ACTIONS = new Set([
  'COMMUNITY_POST_DELETED_BY_ADMIN',
  'COMMUNITY_COMMENT_DELETED_BY_ADMIN',
  'COMMUNITY_POST_PIN',
  'COMMUNITY_POST_UNPIN',
  'COMMUNITY_POST_LOCK',
  'COMMUNITY_POST_UNLOCK',
  'COMMUNITY_POST_HIDE',
  'COMMUNITY_POST_RESTORE',
  'COMMUNITY_MEMBER_MUTED',
  'COMMUNITY_MEMBER_UNMUTED',
  'GOOGLE_SHEET_SYNCED',
  'GMAIL_NOTIFICATIONS_DISPATCHED',
  'REMINDER_BATCH_GENERATED',
  'REPORT_EXPORTED',
]);

const ALL_ADMIN_ACTION_SET = new Set([
  ...USER_APPROVAL_ACTIONS,
  ...SETTING_CHANGE_ACTIONS,
  ...MEMBER_GOVERNANCE_ACTIONS,
  ...FINANCIAL_REVIEW_ACTIONS,
  ...MODERATION_AND_SYNC_ACTIONS,
]);

function isAdministrativeLog(entry: AuditLogEntry): boolean {
  if (ALL_ADMIN_ACTION_SET.has(entry.action)) return true;
  return entry.actorRole === 'admin' || entry.actorRole === 'manager';
}

function getAdminActionMeta(action: string) {
  if (USER_APPROVAL_ACTIONS.has(action)) {
    const isRejected = action === 'MEMBER_SIGNUP_REJECTED';
    return {
      categoryLabel: 'User Approval',
      tone: isRejected
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-emerald-700 dark:text-emerald-400',
      Icon: isRejected ? UserX : UserCheck,
    };
  }
  if (SETTING_CHANGE_ACTIONS.has(action)) {
    return {
      categoryLabel: 'Setting Modification',
      tone: 'text-teal-700 dark:text-teal-400',
      Icon: Settings,
    };
  }
  if (MEMBER_GOVERNANCE_ACTIONS.has(action)) {
    const isRevoke = action === 'MEMBER_SUSPENDED' || action === 'MEMBER_REMOVED_BY_ADMIN';
    return {
      categoryLabel: 'Member Governance',
      tone: isRevoke ? 'text-rose-700 dark:text-rose-400' : 'text-indigo-700 dark:text-indigo-400',
      Icon: isRevoke ? UserX : KeyRound,
    };
  }
  if (FINANCIAL_REVIEW_ACTIONS.has(action)) {
    const isRejected = action.endsWith('_REJECTED');
    return {
      categoryLabel: 'Financial Authorization',
      tone: isRejected
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-emerald-700 dark:text-emerald-400',
      Icon: HandCoins,
    };
  }
  if (action.startsWith('COMMUNITY_')) {
    return {
      categoryLabel: 'Moderation Action',
      tone: 'text-amber-700 dark:text-amber-400',
      Icon: MessageSquare,
    };
  }
  return {
    categoryLabel: 'System Dispatch & Export',
    tone: 'text-indigo-700 dark:text-indigo-400',
    Icon: ScrollText,
  };
}

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

export function SystemAuditLogsView({ user }: SystemAuditLogsViewProps) {
  const canViewSystemLogs = user.role === 'admin' || user.role === 'manager';

  const [allLogs, setAllLogs] = useState<AuditLogEntry[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [integrity, setIntegrity] = useState<{
    totalEntries: number;
    verifiedEntries: number;
    brokenLinks: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<AdminAuditCategory>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(30);

  const syncTimerRef = useRef<number | null>(null);

  const fetchLogs = useCallback(
    async (silent = false, showVerifyBanner = false) => {
      if (!canViewSystemLogs) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      if (showVerifyBanner) setVerifying(true);
      setError(null);

      try {
        const res = await api.getAuditLogs();
        setAllLogs(res.logs);
        setChainValid(res.chainValid);
        setIntegrity(
          res.integrity || {
            totalEntries: res.logs.length,
            verifiedEntries: res.logs.length,
            brokenLinks: [],
          }
        );
        if (showVerifyBanner) {
          const total = res.integrity?.totalEntries ?? res.logs.length;
          const verified = res.integrity?.verifiedEntries ?? res.logs.length;
          setVerificationNote(
            res.chainValid
              ? `SHA-256 hash chain verified across ${verified}/${total} immutable ledger blocks.`
              : `Hash chain discrepancy detected on ${res.integrity?.brokenLinks.length || 1} record(s).`
          );
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load system audit logs.');
        }
      } finally {
        if (!silent) setLoading(false);
        if (showVerifyBanner) setVerifying(false);
      }
    },
    [canViewSystemLogs]
  );

  useEffect(() => {
    void fetchLogs(false, false);
  }, [fetchLogs]);

  useEffect(() => {
    if (!canViewSystemLogs) return;
    const es = new EventSource('/api/events', { withCredentials: true });
    const scheduleSync = () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        void fetchLogs(true, false);
      }, 200);
    };

    const events = [
      'audit:updated',
      'members:updated',
      'config:updated',
      'loan:reviewed',
      'contribution:reviewed',
      'repayment:verified',
      'investment:created',
      'investment:distributed',
      'community:updated',
      'sheet:synced',
    ];
    events.forEach((evt) => es.addEventListener(evt, scheduleSync));

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      es.close();
    };
  }, [canViewSystemLogs, fetchLogs]);

  const adminLogs = useMemo(() => {
    return allLogs.filter(isAdministrativeLog);
  }, [allLogs]);

  const actorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    for (const log of adminLogs) {
      if (!map.has(log.actorId)) {
        map.set(log.actorId, {
          id: log.actorId,
          name: log.actorName,
          role: log.actorRole,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [adminLogs]);

  const metrics = useMemo(() => {
    return {
      total: adminLogs.length,
      userApprovals: adminLogs.filter((l) => USER_APPROVAL_ACTIONS.has(l.action)).length,
      settingChanges: adminLogs.filter((l) => SETTING_CHANGE_ACTIONS.has(l.action)).length,
      memberGovernance: adminLogs.filter((l) => MEMBER_GOVERNANCE_ACTIONS.has(l.action)).length,
      financialReviews: adminLogs.filter((l) => FINANCIAL_REVIEW_ACTIONS.has(l.action)).length,
      moderationSync: adminLogs.filter((l) => MODERATION_AND_SYNC_ACTIONS.has(l.action)).length,
    };
  }, [adminLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return adminLogs.filter((entry) => {
      if (categoryFilter === 'user_approvals' && !USER_APPROVAL_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'setting_changes' && !SETTING_CHANGE_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'member_governance' && !MEMBER_GOVERNANCE_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'financial_reviews' && !FINANCIAL_REVIEW_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'moderation_sync' && !MODERATION_AND_SYNC_ACTIONS.has(entry.action)) {
        return false;
      }
      if (actorFilter !== 'all' && entry.actorId !== actorFilter) {
        return false;
      }

      const entryDate = entry.timestamp.slice(0, 10);
      if (dateFrom && entryDate < dateFrom) return false;
      if (dateTo && entryDate > dateTo) return false;

      if (!q) return true;
      const payloadStr = entry.decryptedPayload
        ? JSON.stringify(entry.decryptedPayload).toLowerCase()
        : '';
      return (
        entry.id.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.resourceType.toLowerCase().includes(q) ||
        entry.resourceId.toLowerCase().includes(q) ||
        entry.entryHash.toLowerCase().includes(q) ||
        payloadStr.includes(q)
      );
    });
  }, [adminLogs, categoryFilter, actorFilter, dateFrom, dateTo, searchQuery]);

  function handleResetFilters() {
    setCategoryFilter('all');
    setActorFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setVisibleLimit(30);
  }

  function handleExportImmutableJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: `${user.name} (${user.memberCode})`,
      immutabilityModel: 'Append-only SHA-256 hash chain with AES-256-GCM encrypted payload envelopes',
      chainValid,
      integrity,
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
    link.download = `amanah-system-audit-proof-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!canViewSystemLogs) {
    return (
      <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Administrator Access Required
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          System Audit Logs and immutable governance records are restricted to cooperative
          administrators and authorized managers.
        </p>
      </div>
    );
  }

  const displayedLogs = filteredLogs.slice(0, visibleLimit);
  const hasMore = filteredLogs.length > visibleLimit;
  const hasActiveFilters =
    categoryFilter !== 'all' ||
    actorFilter !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(searchQuery.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* 4-Column Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <MotionCard
          hue="violet"
          delay={0.02}
          className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Immutable Admin Records</span>
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading && allLogs.length === 0 ? <Skeleton width={48} height={28} /> : metrics.total}
          </div>
          <div
            className={`text-[11px] sm:text-xs font-medium inline-flex items-center gap-1.5 ${
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
            <span className="font-mono tabular-nums">
              {chainValid
                ? `Append-only · ${integrity?.verifiedEntries ?? allLogs.length}/${integrity?.totalEntries ?? allLogs.length} verified`
                : 'Chain Integrity Alert'}
            </span>
          </div>
        </MotionCard>

        <MotionCard
          hue="emerald"
          delay={0.06}
          className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>User Approvals &amp; Registry</span>
            <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading && allLogs.length === 0 ? (
              <Skeleton width={48} height={28} />
            ) : (
              metrics.userApprovals + metrics.memberGovernance
            )}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.userApprovals} onboarding · {metrics.memberGovernance} RBAC/status
          </div>
        </MotionCard>

        <MotionCard
          hue="teal"
          delay={0.1}
          className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Setting Modifications</span>
            <Settings className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading && allLogs.length === 0 ? (
              <Skeleton width={48} height={28} />
            ) : (
              metrics.settingChanges
            )}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            Policy quotas, maturity &amp; guarantor rules
          </div>
        </MotionCard>

        <MotionCard
          hue="amber"
          delay={0.14}
          className="border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-1 shadow-xs hover:shadow-md transition-all duration-200"
        >
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Financial &amp; Moderation</span>
            <HandCoins className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading && allLogs.length === 0 ? (
              <Skeleton width={48} height={28} />
            ) : (
              metrics.financialReviews + metrics.moderationSync
            )}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.financialReviews} treasury · {metrics.moderationSync} sync/mod
          </div>
        </MotionCard>
      </div>

      {/* Main Immutable Audit Ledger Panel */}
      <section className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 sm:space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Append-Only Cryptographic Ledger</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>SHA-256 Linked Blocks</span>
              <span aria-hidden="true">·</span>
              <span>AES-256-GCM Envelopes</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              System Audit Logs · Administrative Actions &amp; Setting History
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={() => void fetchLogs(false, true)}
              disabled={loading || verifying}
              className="px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${loading || verifying ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{verifying ? 'Verifying…' : 'Verify Chain'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportImmutableJson}
              disabled={filteredLogs.length === 0}
              className="px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <FileJson className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>Export JSON Proof</span>
            </button>

            <button
              type="button"
              onClick={() => window.location.assign('/api/reports/export?type=audit&scope=admin')}
              className="col-span-2 sm:col-span-1 px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Admin CSV</span>
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
              Dismiss
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

        {/* Filter & Search Bar */}
        <div className="space-y-3">
          <div className="flex flex-nowrap lg:flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full lg:w-fit max-w-full overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: `All Admin (${metrics.total})` },
                { id: 'user_approvals', label: `User Approvals (${metrics.userApprovals})` },
                { id: 'setting_changes', label: `Setting Changes (${metrics.settingChanges})` },
                {
                  id: 'member_governance',
                  label: `Member Governance (${metrics.memberGovernance})`,
                },
                {
                  id: 'financial_reviews',
                  label: `Financial Reviews (${metrics.financialReviews})`,
                },
                { id: 'moderation_sync', label: `Moderation & Sync (${metrics.moderationSync})` },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(tab.id);
                    setVisibleLimit(30);
                  }}
                  className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="system-audit-category-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor="audit-actor-filter"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Administrator / Actor
              </label>
              <select
                id="audit-actor-filter"
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setVisibleLimit(30);
                }}
                className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Administrators &amp; Managers</option>
                {actorOptions.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ({actor.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-date-from"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                From Date
              </label>
              <input
                id="audit-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setVisibleLimit(30);
                }}
                className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="audit-date-to"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                To Date
              </label>
              <input
                id="audit-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setVisibleLimit(30);
                }}
                className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor="audit-search-input"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Search Action, Target, or Hash
              </label>
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="audit-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleLimit(30);
                  }}
                  placeholder="Actor, setting, member ID, hash…"
                  className="w-full pl-8 pr-3 py-2 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* High-Density Immutable Audit Table */}
        {loading && allLogs.length === 0 ? (
          <>
            <div className="lg:hidden space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton width={130} height={14} />
                    <Skeleton width={85} height={14} />
                  </div>
                  <Skeleton width="85%" height={14} />
                  <Skeleton width="55%" height={12} />
                </div>
              ))}
            </div>

            <div className="hidden lg:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-medium">Timestamp</th>
                    <th className="py-2.5 px-4 font-medium">Action &amp; Category</th>
                    <th className="py-2.5 px-4 font-medium">Administrator</th>
                    <th className="py-2.5 px-4 font-medium">Summary &amp; Target</th>
                    <th className="py-2.5 px-4 font-medium">Immutable Proof</th>
                    <th className="py-2.5 px-4 font-medium text-right">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton width={110} height={16} /></td>
                      <td className="py-3 px-4"><Skeleton width={130} height={16} /></td>
                      <td className="py-3 px-4"><Skeleton width={100} height={16} /></td>
                      <td className="py-3 px-4"><Skeleton width={220} height={16} /></td>
                      <td className="py-3 px-4"><Skeleton width={100} height={16} /></td>
                      <td className="py-3 px-4 text-right"><Skeleton width={64} height={26} borderRadius={6} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {adminLogs.length === 0
                ? 'No administrative audit records recorded yet.'
                : 'No administrative audit entries match your current filters.'}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Tap-Cards (< lg) */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white/75 dark:bg-slate-950/70">
              {displayedLogs.map((entry) => {
                const isOpen = expandedId === entry.id;
                const meta = getAdminActionMeta(entry.action);
                const Icon = meta.Icon;
                const diffs = extractChangeDiffs(entry.decryptedPayload);
                const verified =
                  entry.hashVerified !== false && entry.chainLinkVerified !== false;

                return (
                  <div key={entry.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className={`text-xs font-semibold flex items-center gap-1.5 ${meta.tone}`}>
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{meta.categoryLabel}</span>
                        </div>
                        <div className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300 break-all">
                          {entry.action}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                          verified
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {verified ? (
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>{shortHash(entry.entryHash)}</span>
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                      {entry.summary}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        <strong className="font-medium text-slate-700 dark:text-slate-300">
                          {entry.actorName}
                        </strong>{' '}
                        (<span className="capitalize">{entry.actorRole}</span>)
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : entry.id)}
                      aria-expanded={isOpen}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center justify-between cursor-pointer"
                    >
                      <span>
                        {isOpen
                          ? 'Hide Cryptographic Envelope'
                          : diffs.length > 0
                            ? `Inspect Hash & ${diffs.length} Field Change${diffs.length === 1 ? '' : 's'}`
                            : 'Inspect Hash & Payload'}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16 }}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-900/50 space-y-3 text-[11px]"
                        >
                          <div className="space-y-1.5 font-mono text-slate-600 dark:text-slate-400 break-all">
                            <div>
                              <span className="text-slate-400 dark:text-slate-500">Target: </span>
                              <span className="text-slate-800 dark:text-slate-200">
                                {entry.resourceType}:{entry.resourceId}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 dark:text-slate-500">Record ID: </span>
                              <span className="text-slate-800 dark:text-slate-200">{entry.id}</span>
                            </div>
                            <div>
                              <span className="text-indigo-600 dark:text-indigo-400">Entry Hash: </span>
                              <span className="text-slate-800 dark:text-slate-200">{entry.entryHash}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 dark:text-slate-500">Prev Hash: </span>
                              <span className="text-slate-800 dark:text-slate-200">{entry.prevHash}</span>
                            </div>
                          </div>

                          {diffs.length > 0 && (
                            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                Modified Fields
                              </div>
                              {diffs.map((d) => (
                                <div
                                  key={d.field}
                                  className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono space-y-0.5 break-all"
                                >
                                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                                    {d.field}
                                  </div>
                                  <div className="text-rose-700 dark:text-rose-400">
                                    From: {formatDiffValue(d.from)}
                                  </div>
                                  <div className="text-emerald-700 dark:text-emerald-400">
                                    To: {formatDiffValue(d.to)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {entry.decryptedPayload && (
                            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="font-semibold text-indigo-700 dark:text-indigo-400">
                                Decrypted Payload Envelope
                              </div>
                              <div className="grid grid-cols-1 gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                                {Object.entries(entry.decryptedPayload)
                                  .filter(([k]) => k !== 'changes')
                                  .map(([k, v]) => (
                                    <div
                                      key={k}
                                      className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 break-all"
                                    >
                                      <span className="text-slate-500 dark:text-slate-400">{k}: </span>
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

            {/* Desktop Table (>= lg) */}
            <div className="hidden lg:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Timestamp</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Action &amp; Category</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Administrator</th>
                    <th className="py-2.5 px-4 font-medium">Summary &amp; Target</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Immutable Proof</th>
                    <th className="py-2.5 px-4 font-medium text-right whitespace-nowrap">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedLogs.map((entry) => {
                    const isOpen = expandedId === entry.id;
                    const meta = getAdminActionMeta(entry.action);
                    const Icon = meta.Icon;
                    const diffs = extractChangeDiffs(entry.decryptedPayload);
                    const verified =
                      entry.hashVerified !== false && entry.chainLinkVerified !== false;

                    return (
                      <AdminAuditTableRow
                        key={entry.id}
                        entry={entry}
                        meta={meta}
                        Icon={Icon}
                        diffs={diffs}
                        verified={verified}
                        isOpen={isOpen}
                        onToggle={() => setExpandedId(isOpen ? null : entry.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Footer Count & Pagination */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Showing {displayedLogs.length} of {filteredLogs.length} immutable administrative records
            </span>

            {hasMore && (
              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + 30)}
                  className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
                >
                  Load 30 More
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(filteredLogs.length)}
                  className="px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 inline-flex items-center justify-center cursor-pointer"
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

function AdminAuditTableRow({
  entry,
  meta,
  Icon,
  diffs,
  verified,
  isOpen,
  onToggle,
}: {
  entry: AuditLogEntry;
  meta: { categoryLabel: string; tone: string };
  Icon: typeof Settings;
  diffs: ChangeDiffEntry[];
  verified: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
            {formatDateTime(entry.timestamp)}
          </div>
          <div className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {entry.timestamp}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className={`font-medium flex items-center gap-1.5 ${meta.tone}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{meta.categoryLabel}</span>
          </div>
          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            {entry.action}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div className="font-medium text-slate-900 dark:text-white">{entry.actorName}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize mt-0.5">
            {entry.actorRole} · <span className="font-mono">{entry.actorId}</span>
          </div>
        </td>

        <td className="py-3 px-4 align-top min-w-[260px]">
          <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
            {entry.summary}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            {entry.resourceType}:{entry.resourceId}
            {diffs.length > 0 && (
              <>
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span className="text-teal-700 dark:text-teal-400">
                  {diffs.length} field{diffs.length === 1 ? '' : 's'} modified
                </span>
              </>
            )}
          </div>
        </td>

        <td className="py-3 px-4 align-top whitespace-nowrap">
          <div
            className={`font-mono text-[11px] font-medium inline-flex items-center gap-1 ${
              verified
                ? 'text-indigo-700 dark:text-indigo-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {verified ? (
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{verified ? 'SHA-256 Verified' : 'Hash Mismatch'}</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {shortHash(entry.entryHash)}
          </div>
        </td>

        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>{isOpen ? 'Hide' : 'Inspect'}</span>
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {isOpen && (
          <tr className="bg-slate-50/75 dark:bg-slate-950/60">
            <td colSpan={6} className="p-0">
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="px-4 py-4 text-xs space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">Audit Record ID: </span>
                    <span className="text-slate-800 dark:text-slate-200">{entry.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">Previous Block Hash: </span>
                    <span className="text-slate-800 dark:text-slate-200">{entry.prevHash}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-indigo-600 dark:text-indigo-400">SHA-256 Entry Hash: </span>
                    <span className="text-slate-800 dark:text-slate-200">{entry.entryHash}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-indigo-600 dark:text-indigo-400">
                      AES-256-GCM Ciphertext ({entry.encryptedPayload.keyVersion}):{' '}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {entry.encryptedPayload.ciphertext.slice(0, 84)}…
                    </span>
                  </div>
                </div>

                {diffs.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Modified Fields (Before vs. After)
                    </div>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                      <table className="w-full text-left border-collapse text-[11px] font-mono">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                            <th className="py-1.5 px-3 font-medium">Field</th>
                            <th className="py-1.5 px-3 font-medium">Previous Value</th>
                            <th className="py-1.5 px-3 font-medium">New Value</th>
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
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">
                      Decrypted Payload Envelope
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {Object.entries(entry.decryptedPayload)
                        .filter(([k]) => k !== 'changes')
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 break-all"
                          >
                            <span className="text-slate-500 dark:text-slate-400">{k}: </span>
                            <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
