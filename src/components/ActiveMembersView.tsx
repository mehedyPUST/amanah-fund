'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldAlert,
  User as UserIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { translateRoleLabel } from '../i18n/messages.ts';
import type { ActiveMemberDirectoryItem, FundConfig, PublicUser, UserRole } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { useCoopSession } from './AppProviders.tsx';

interface ActiveMembersViewProps {
  user: PublicUser | null;
  config: FundConfig | null;
  onViewMemberProfile?: (userId: string) => void;
}

export function ActiveMembersView({
  user,
  config,
  onViewMemberProfile,
}: ActiveMembersViewProps) {
  const { locale } = useCoopSession();
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const ccy = config?.currency || 'BDT';

  const [members, setMembers] = useState<ActiveMemberDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [brokenPhotos, setBrokenPhotos] = useState<Record<string, boolean>>({});

  const getMembershipDuration = useCallback(
    (joinedAtIso: string): { label: string; monthsTotal: number } => {
      const joined = new Date(joinedAtIso);
      if (Number.isNaN(joined.getTime())) {
        return { label: t('newMember'), monthsTotal: 0 };
      }
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - joined.getTime());
      const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      let totalMonths =
        (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
      if (now.getDate() < joined.getDate()) {
        totalMonths -= 1;
      }
      totalMonths = Math.max(0, totalMonths);

      if (totalDays < 1) return { label: t('joinedToday'), monthsTotal: 0 };
      if (totalDays < 30) {
        return {
          label: t('daysCount', {
            count: totalDays,
            unit: totalDays === 1 ? t('daySingular') : t('dayPlural'),
          }),
          monthsTotal: 0,
        };
      }
      const years = Math.floor(totalMonths / 12);
      const remMonths = totalMonths % 12;
      if (years > 0 && remMonths > 0) {
        return {
          label: t('yrMo', {
            years,
            yearUnit: years === 1 ? t('yrSingular') : t('yrPlural'),
            months: remMonths,
            monthUnit: remMonths === 1 ? t('moSingular') : t('moPlural'),
          }),
          monthsTotal: totalMonths,
        };
      }
      if (years > 0) {
        return {
          label: t('yrOnly', {
            years,
            yearUnit: years === 1 ? t('yrSingular') : t('yrPlural'),
          }),
          monthsTotal: totalMonths,
        };
      }
      return {
        label: t('moOnly', {
          months: Math.max(1, totalMonths),
          monthUnit: totalMonths === 1 ? t('moSingular') : t('moPlural'),
        }),
        monthsTotal: Math.max(1, totalMonths),
      };
    },
    [t]
  );

  const hasUser = Boolean(user);
  const tRef = useRef(t);
  tRef.current = t;

  const loadDirectory = useCallback(async () => {
    if (!hasUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getActiveMembers();
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : tRef.current('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [hasUser]);

  useEffect(() => {
    void loadDirectory();
    const handleGlobalRefresh = () => {
      void loadDirectory();
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [loadDirectory]);

  const enriched = useMemo(() => {
    return members.map((m) => {
      const duration = getMembershipDuration(m.joinedAt);
      return { ...m, duration };
    });
  }, [members, getMembershipDuration]);

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
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('authRequiredTitle')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('authRequiredDesc')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {/* Search & Role Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchAria')}
              className="pl-8 pr-3 py-2 min-h-[44px] sm:min-h-0 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-full focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 shadow-xs"
            />
          </div>

          {/* Role Filter Tabs */}
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-fit">
            {(
              [
                { id: 'all', label: t('tabAllRoles') },
                { id: 'admin', label: t('tabAdmins') },
                { id: 'manager', label: t('tabManagers') },
                { id: 'member', label: t('tabMembers') },
              ] as const
            ).map((tab) => {
              const active = roleFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="active-members-role-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300"
          >
            {error}
          </div>
        )}
      </div>

      {/* Member Directory Table / Empty / Loading States */}
      {loading ? (
        <section className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-12 gap-4 items-center py-2">
              <div className="col-span-4 flex items-center gap-3">
                <Skeleton width={40} height={40} borderRadius={8} />
                <div className="flex-1 space-y-1">
                  <Skeleton width="70%" height={14} />
                  <Skeleton width="45%" height={12} />
                </div>
              </div>
              <div className="col-span-4">
                <Skeleton height={16} />
              </div>
              <div className="col-span-2">
                <Skeleton height={16} />
              </div>
              <div className="col-span-2">
                <Skeleton height={16} />
              </div>
            </div>
          ))}
        </section>
      ) : filteredMembers.length === 0 ? (
        <section className="amanah-card-violet border rounded-2xl p-8 text-center space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('emptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('emptyDesc')}
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
              {tCommon('resetFilters')}
            </button>
          )}
        </section>
      ) : (
        <section className="amanah-card-violet border rounded-2xl overflow-hidden shadow-xs">
          {/* Mobile Directory Tap Cards (< lg) */}
          <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredMembers.map((m) => {
              const photoBroken = brokenPhotos[m.id];
              return (
                <div
                  key={m.id}
                  className="p-3.5 space-y-3 odd:bg-white/85 even:bg-slate-100/75 dark:odd:bg-slate-900/35 dark:even:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {m.photoUrl && !photoBroken ? (
                        <img
                          src={m.photoUrl}
                          alt={m.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenPhotos((prev) => ({ ...prev, [m.id]: true }))
                          }
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{m.name}</span>
                          {m.id === user.id && (
                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              {t('youBadge')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{m.memberCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{translateRoleLabel(m.role, locale)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            <span>{t('verifiedBadge')}</span>
                          </span>
                        </div>
                        {(m.occupation || m.companyOrganization) && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                            {[m.occupation, m.companyOrganization].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 text-sm">
                        {formatMoney(m.totalContributed, ccy)}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {t('depositsCount', {
                          count: m.approvedContributionsCount,
                          label: m.approvedContributionsCount === 1 ? t('depositSingular') : t('depositPlural'),
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 text-xs bg-slate-50/75 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-lg p-2.5">
                    <a
                      href={`mailto:${m.email}`}
                      className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-mono truncate hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{m.email}</span>
                    </a>
                    <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                      <a
                        href={`tel:${m.mobile}`}
                        className="flex items-center gap-2 font-mono tabular-nums hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        <span>{m.mobile}</span>
                      </a>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {m.duration.label} · {formatShortDate(m.joinedAt)}
                      </span>
                    </div>
                    {m.presentAddress && (
                      <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <MapPin
                          className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span className="line-clamp-2">{m.presentAddress}</span>
                      </div>
                    )}
                  </div>

                  {onViewMemberProfile && (
                    <button
                      type="button"
                      onClick={() => onViewMemberProfile(m.id)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <UserIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('viewMemberProfile')}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">{t('colVerifiedMember')}</th>
                  <th className="py-3 px-4 font-medium">{t('colContactDetails')}</th>
                  <th className="py-3 px-4 font-medium">{t('colMembershipDuration')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('colTotalContributed')}</th>
                  {onViewMemberProfile && (
                    <th className="py-3 px-4 font-medium text-right">{t('colProfile')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMembers.map((m) => {
                  const photoBroken = brokenPhotos[m.id];
                  return (
                    <tr
                      key={m.id}
                      className="odd:bg-white/85 even:bg-slate-100/75 dark:odd:bg-slate-900/35 dark:even:bg-slate-800/50 hover:bg-emerald-50/55 dark:hover:bg-emerald-950/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-start gap-3">
                          {m.photoUrl && !photoBroken ? (
                            <img
                              src={m.photoUrl}
                              alt={m.name}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenPhotos((prev) => ({ ...prev, [m.id]: true }))
                              }
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
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
                                  {t('youBadge')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="font-mono">{m.memberCode}</span>
                              <span aria-hidden="true">·</span>
                              <span>{translateRoleLabel(m.role, locale)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                <span>{t('verifiedBadge')}</span>
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
                          {t('sinceDate', { date: formatShortDate(m.joinedAt) })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white text-sm">
                          {formatMoney(m.totalContributed, ccy)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {t('depositsCount', {
                            count: m.approvedContributionsCount,
                            label: m.approvedContributionsCount === 1 ? t('depositSingular') : t('depositPlural'),
                          })}
                        </div>
                      </td>

                      {onViewMemberProfile && (
                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onViewMemberProfile(m.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <UserIcon className="w-3 h-3" aria-hidden="true" />
                            <span>{t('viewProfile')}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </motion.div>
  );
}
