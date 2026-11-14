'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  HandCoins,
  KeyRound,
  Lock,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { AuditLogEntry, PublicUser, UserRole } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, shortHash } from '../utils/format.ts';

type AuditCategoryFilter =
  | 'all'
  | 'user_access'
  | 'rejections'
  | 'loan_changes'
  | 'treasury_policy';

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
]);

const REJECTION_ACTIONS = new Set([
  'MEMBER_SIGNUP_REJECTED',
  'MEMBER_REMOVED_BY_ADMIN',
  'MEMBER_SUSPENDED',
  'LOAN_ADMIN_REJECTED',
  'LOAN_QUORUM_REJECTED',
  'CONTRIBUTION_REJECTED',
  'REPAYMENT_REJECTED',
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
]);

function getAuditVisualMeta(action: string) {
  if (
    action === 'MEMBER_SIGNUP_APPROVED' ||
    action === 'MEMBER_REACTIVATED' ||
    action === 'MEMBER_CREATED_BY_ADMIN'
  ) {
    return {
      label: 'User Approval & Access',
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
      label: 'Application Rejected / Access Revoked',
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
  if (
    action === 'LOAN_ADMIN_APPROVED' ||
    action === 'LOAN_QUORUM_APPROVED' ||
    action === 'LOAN_DISBURSED' ||
    action === 'LOAN_REPAID_COMPLETED'
  ) {
    return {
      label: 'Loan Status Change',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'LOAN_REQUEST_CREATED' || action === 'LOAN_VOTE_CAST') {
    return {
      label: 'Loan Governance Event',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: HandCoins,
    };
  }
  if (action === 'CONTRIBUTION_APPROVED' || action === 'REPAYMENT_VERIFIED') {
    return {
      label: 'Verified Ledger Entry',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      Icon: CheckCircle2,
    };
  }
  if (action === 'MEMBER_SIGNUP_REQUESTED' || action === 'CONTRIBUTION_SUBMITTED') {
    return {
      label: 'Pending Verification',
      tone: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      Icon: FileText,
    };
  }
  if (action === 'AUTH_LOGIN' || action === 'MEMBER_RBAC_UPDATED') {
    return {
      label: 'Security & Access',
      tone: 'text-slate-700 dark:text-slate-300',
      iconBg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
      Icon: KeyRound,
    };
  }
  return {
    label: 'System & Policy',
    tone: 'text-slate-700 dark:text-slate-300',
    iconBg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    Icon: Lock,
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

  const [categoryFilter, setCategoryFilter] = useState<AuditCategoryFilter>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(25);

  useEffect(() => {
    if (initialLogs !== undefined) {
      setLogs(initialLogs);
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

  const loadAuditLogs = useCallback(async () => {
    if (!canViewAuditLogs) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (onRefreshExternal) {
        await onRefreshExternal();
      } else {
        const res = await api.getAuditLogs();
        setLogs(res.logs);
        setChainValid(res.chainValid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security audit trail.');
    } finally {
      setLoading(false);
    }
  }, [canViewAuditLogs, onRefreshExternal]);

  useEffect(() => {
    if (initialLogs === undefined) {
      void loadAuditLogs();
    }
  }, [initialLogs, loadAuditLogs]);

  const metrics = useMemo(() => {
    const userEvents = logs.filter((l) => USER_APPROVAL_ACTIONS.has(l.action)).length;
    const loanStatusEvents = logs.filter((l) => LOAN_STATUS_ACTIONS.has(l.action)).length;
    const rejectedEvents = logs.filter((l) => REJECTION_ACTIONS.has(l.action)).length;
    return {
      total: logs.length,
      userEvents,
      loanStatusEvents,
      rejectedEvents,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (categoryFilter === 'user_access' && !USER_APPROVAL_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'rejections' && !REJECTION_ACTIONS.has(entry.action)) {
        return false;
      }
      if (categoryFilter === 'loan_changes' && !LOAN_STATUS_ACTIONS.has(entry.action)) {
        return false;
      }
      if (
        categoryFilter === 'treasury_policy' &&
        (USER_APPROVAL_ACTIONS.has(entry.action) || LOAN_STATUS_ACTIONS.has(entry.action))
      ) {
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
        <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Administrator Access Required
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Security audit trails and cryptographic hash-chain inspection are restricted to
          cooperative administrators.
        </p>
      </div>
    );
  }

  const displayedLogs = filteredLogs.slice(0, visibleLimit);
  const hasMoreLogs = filteredLogs.length > visibleLimit;

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      {!compactHeader && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Total Audit Events</span>
              <ScrollText className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? '—' : metrics.total}
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
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>User Approvals & Accounts</span>
              <UserCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? '—' : metrics.userEvents}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Signups, approvals, suspensions & RBAC
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Loan Status Changes</span>
              <HandCoins className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading && logs.length === 0 ? '—' : metrics.loanStatusEvents}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Reviews, 2/3 votes, disbursements & repayments
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>Rejected & Revoked</span>
              <XCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
              {loading && logs.length === 0 ? '—' : metrics.rejectedEvents}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Declined registrations, loans & receipts
            </div>
          </div>
        </div>
      )}

      {/* Main Security Audit Log Panel */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Admin Security Audit Log & Hash Chain
              </h2>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
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
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tamper-evident chronological ledger tracking user approvals, rejected applications,
              loan status transitions, and policy changes with AES-256-GCM metadata envelopes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/api/reports/export?type=audit')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {/* Filter Bar: Category Tabs + Actor Role + Search */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `All Events (${metrics.total})` },
                { id: 'user_access', label: `User Approvals (${metrics.userEvents})` },
                { id: 'rejections', label: `Rejections (${metrics.rejectedEvents})` },
                { id: 'loan_changes', label: `Loan Status (${metrics.loanStatusEvents})` },
                { id: 'treasury_policy', label: 'Treasury & Policy' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id);
                  setVisibleLimit(25);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
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
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>
          </div>
        </div>

        {/* Audit Event Stream */}
        {loading && logs.length === 0 ? (
          <Skeleton height={220} />
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-center space-y-1.5">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No matching audit records found
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adjust your category filter, role filter, or search query to inspect other events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {displayedLogs.map((entry) => {
              const isOpen = expandedLogId === entry.id;
              const visual = getAuditVisualMeta(entry.action);
              const Icon = visual.Icon;

              return (
                <div
                  key={entry.id}
                  className="p-4 bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-900/70 transition-colors space-y-3"
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

                  {isOpen && (
                    <div className="ml-0 sm:ml-12 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-[11px]">
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
                          <span className="text-slate-400 dark:text-slate-500">Entry SHA-256:</span>{' '}
                          {entry.entryHash}
                        </div>
                        <div className="md:col-span-2">
                          <span className="text-slate-400 dark:text-slate-500">
                            AES-256-GCM Ciphertext:
                          </span>{' '}
                          {entry.encryptedPayload.ciphertext.slice(0, 72)}…
                        </div>
                      </div>

                      {entry.decryptedPayload && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mb-1.5">
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Count & Pagination */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Showing {displayedLogs.length} of {filteredLogs.length} matching audit entries
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
    </div>
  );
}
