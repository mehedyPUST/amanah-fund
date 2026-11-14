'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { ActiveMemberDirectoryItem, FundConfig, PublicUser, UserRole } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';

interface ActiveMembersViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
}

function getMembershipDuration(joinedAtIso: string): { label: string; monthsTotal: number } {
  const joined = new Date(joinedAtIso);
  if (Number.isNaN(joined.getTime())) {
    return { label: 'New member', monthsTotal: 0 };
  }
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - joined.getTime());
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const totalMonths =
    (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());

  if (totalDays < 1) return { label: 'Joined today', monthsTotal: 0 };
  if (totalDays < 30) return { label: `${totalDays} day${totalDays === 1 ? '' : 's'}`, monthsTotal: 0 };
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  if (years > 0 && remMonths > 0) {
    return {
      label: `${years} yr${years === 1 ? '' : 's'} ${remMonths} mo${remMonths === 1 ? '' : 's'}`,
      monthsTotal: totalMonths,
    };
  }
  if (years > 0) {
    return { label: `${years} yr${years === 1 ? '' : 's'}`, monthsTotal: totalMonths };
  }
  return {
    label: `${Math.max(1, totalMonths)} mo${totalMonths === 1 ? '' : 's'}`,
    monthsTotal: Math.max(1, totalMonths),
  };
}

export function ActiveMembersView({ user, config }: ActiveMembersViewProps) {
  const ccy = config?.currency || 'BDT';

  const [members, setMembers] = useState<ActiveMemberDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [brokenPhotos, setBrokenPhotos] = useState<Record<string, boolean>>({});

  const loadDirectory = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getActiveMembers();
      setMembers(res.members);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load verified active members directory.'
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const enriched = useMemo(() => {
    return members.map((m) => {
      const duration = getMembershipDuration(m.joinedAt);
      return { ...m, duration };
    });
  }, [members]);

  const stats = useMemo(() => {
    const totalPool = enriched.reduce((sum, m) => sum + m.totalContributed, 0);
    const totalApprovedDeposits = enriched.reduce(
      (sum, m) => sum + m.approvedContributionsCount,
      0
    );
    const avgMonths =
      enriched.length > 0
        ? Math.round(
            enriched.reduce((sum, m) => sum + m.duration.monthsTotal, 0) / enriched.length
          )
        : 0;
    return {
      totalActive: enriched.length,
      totalPool,
      totalApprovedDeposits,
      avgMonths,
    };
  }, [enriched]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.mobile.toLowerCase().includes(q) ||
        (m.occupation || '').toLowerCase().includes(q) ||
        (m.companyOrganization || '').toLowerCase().includes(q) ||
        (m.presentAddress || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, search, roleFilter]);

  if (!user) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Authentication Required
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              The Active Members directory contains verified member contact information and is
              accessible only to authenticated cooperative members.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Authenticated Member Directory</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Active Members Directory{' '}
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                ({stats.totalActive})
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified cooperative members with contact details, membership tenure, and contribution
              totals
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, phone, role…"
                aria-label="Search active members"
                className="pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-56 sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadDirectory()}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Verified Active</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {stats.totalActive}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              KYC verified standing
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Contributed</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(stats.totalPool, ccy)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Approved member deposits
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Approved Deposits</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {stats.totalApprovedDeposits}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Verified monthly settlements
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Average Membership</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {stats.avgMonths} mo{stats.avgMonths === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Verified tenure across roster
            </div>
          </div>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
          {(
            [
              { id: 'all', label: 'All Roles' },
              { id: 'admin', label: 'Administrators' },
              { id: 'manager', label: 'Managers' },
              { id: 'member', label: 'Members' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                roleFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300"
          >
            {error}
          </div>
        )}
      </section>

      {/* Member Directory Table / Empty / Loading States */}
      {loading ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={58} />
          ))}
        </section>
      ) : filteredMembers.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            No Active Members Match Your Filter
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Adjust the search term or select &ldquo;All Roles&rdquo; to inspect the full verified
            directory.
          </p>
          {(search || roleFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
              }}
              className="mt-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </section>
      ) : (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Verified Member</th>
                  <th className="py-3 px-4 font-medium">Contact Details</th>
                  <th className="py-3 px-4 font-medium">Membership Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Total Contributed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMembers.map((m) => {
                  const photoBroken = brokenPhotos[m.id];
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-start gap-3">
                          {m.photoUrl && !photoBroken ? (
                            <img
                              src={m.photoUrl}
                              alt={`${m.name} portrait`}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenPhotos((prev) => ({ ...prev, [m.id]: true }))
                              }
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                              {m.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{m.name}</span>
                              {m.id === user.id && (
                                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                  (You)
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="font-mono">{m.memberCode}</span>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize">{m.role}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                <span>Verified</span>
                              </span>
                            </div>
                            {(m.occupation || m.companyOrganization) && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                {[m.occupation, m.companyOrganization].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-mono">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                          <a href={`mailto:${m.email}`} className="hover:underline">
                            {m.email}
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                          <span>{m.mobile}</span>
                        </div>
                        {m.presentAddress && (
                          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <MapPin
                              className="w-3 h-3 text-slate-400 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span className="line-clamp-1">{m.presentAddress}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                          {m.duration.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Since {formatShortDate(m.joinedAt)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white text-sm">
                          {formatMoney(m.totalContributed, ccy)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {m.approvedContributionsCount} approved deposit
                          {m.approvedContributionsCount === 1 ? '' : 's'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
