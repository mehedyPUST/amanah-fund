'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel, translateStatusLabel } from '../i18n/messages.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import type {
  FundConfig,
  MemberPublicProfile,
  MonthlySheetMemberRow,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';

export interface BalanceSheetMemberModalProps {
  row: MonthlySheetMemberRow | null;
  rowIndex: number;
  totalRows: number;
  currency: FundConfig['currency'];
  fullMonthLabel: string;
  shortMonthLabel: string;
  prevMonthLabel: string;
  nextMonthLabel: string;
  onClose: () => void;
  onNavigateRow?: (nextIndex: number) => void;
  onViewMemberProfile?: (userId: string) => void;
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function formatTenureShort(joinedAtIso: string): string {
  const joined = new Date(joinedAtIso);
  if (Number.isNaN(joined.getTime())) return 'Active member';
  const now = new Date();
  const diffDays = Math.max(
    0,
    Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24))
  );
  let totalMonths =
    (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (now.getDate() < joined.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);

  if (diffDays < 1) return 'Joined today';
  if (diffDays < 30) return `${diffDays}d tenure`;
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  if (years > 0 && remMonths > 0) return `${years}y ${remMonths}m tenure`;
  if (years > 0) return `${years}y tenure`;
  return `${Math.max(1, totalMonths)}m tenure`;
}

function formatSignedMoney(amount: number, currency: FundConfig['currency']): string {
  const rounded = round2(amount);
  if (rounded === 0) return '—';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${formatMoney(Math.abs(rounded), currency)}`;
}

export function BalanceSheetMemberModal({
  row,
  rowIndex,
  totalRows,
  currency,
  fullMonthLabel,
  shortMonthLabel,
  prevMonthLabel,
  nextMonthLabel,
  onClose,
  onNavigateRow,
  onViewMemberProfile,
}: BalanceSheetMemberModalProps) {
  const tSheet = useTranslations('MonthlySheet');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;

  const [mounted, setMounted] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const open = Boolean(row);
  const memberId = row?.userId ?? '';

  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('BalanceSheetMemberModal');
  }

  const onCloseRef = useRef(onClose);
  const onNavigateRef = useRef(onNavigateRow);
  const rowIndexRef = useRef(rowIndex);
  const totalRowsRef = useRef(totalRows);
  onCloseRef.current = onClose;
  onNavigateRef.current = onNavigateRow;
  rowIndexRef.current = rowIndex;
  totalRowsRef.current = totalRows;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPhotoBroken(false);
    setCopiedKey(null);
  }, [memberId]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    const token = modalTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopModal(token)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'ArrowLeft' && onNavigateRef.current && rowIndexRef.current > 0) {
        e.preventDefault();
        e.stopPropagation();
        onNavigateRef.current(rowIndexRef.current - 1);
      } else if (
        e.key === 'ArrowRight' &&
        onNavigateRef.current &&
        rowIndexRef.current >= 0 &&
        rowIndexRef.current < totalRowsRef.current - 1
      ) {
        e.preventDefault();
        e.stopPropagation();
        onNavigateRef.current(rowIndexRef.current + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const profileQuery = useQuery({
    queryKey: queryKeys.members.profile(memberId),
    queryFn: async (): Promise<MemberPublicProfile> => {
      const res = await api.getMemberProfile(memberId);
      return res.profile;
    },
    enabled: Boolean(memberId),
    staleTime: 60_000,
    retry: 1,
  });

  const profile = profileQuery.data ?? null;

  const handleCopy = async (key: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const renderStatusText = (status: MonthlySheetMemberRow['contributionStatus']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{tSheet('statusPaid')}</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{tSheet('statusPartial')}</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{tSheet('statusPending')}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{tSheet('statusDue')}</span>
          </span>
        );
    }
  };

  if (!mounted) return null;

  const netEquity = row
    ? round2(row.thisMonthSummary.contributionAmount - row.thisMonthSummary.dueHasanaAmount)
    : 0;
  const dueNetChange = row
    ? round2(row.thisMonth.qardHasanAmount - row.thisMonth.repaidAmount)
    : 0;
  const targetPct =
    row && row.contributionTarget > 0
      ? Math.min(100, Math.round((row.thisMonth.contributionAmount / row.contributionTarget) * 100))
      : 0;

  const initials = row
    ? row.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || row.memberCode.slice(0, 2)
    : '';

  const canGoPrev = Boolean(onNavigateRow && rowIndex > 0);
  const canGoNext = Boolean(onNavigateRow && rowIndex >= 0 && rowIndex < totalRows - 1);

  return createPortal(
    <AnimatePresence>
      {row && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="balance-sheet-member-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => onCloseRef.current()}
            className="fixed inset-0 bg-slate-950/55 dark:bg-slate-950/75 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          {/* Modal Surface */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.38)] dark:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden my-auto flex flex-col max-h-[88vh]"
          >
            {/* Header */}
            <header className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200/90 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0 bg-slate-50/70 dark:bg-slate-950/50">
              <div className="flex items-start gap-3.5 min-w-0">
                {profile?.photoUrl && !photoBroken ? (
                  <img
                    src={profile.photoUrl}
                    alt={`${row.name} portrait`}
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoBroken(true)}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-900/60 flex items-center justify-center text-sm sm:text-base font-bold text-emerald-800 dark:text-emerald-300 shrink-0 select-none">
                    {initials}
                  </div>
                )}

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.memberCode}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{translateRoleLabel(row.role, locale)}</span>
                    <span aria-hidden="true">·</span>
                    {renderStatusText(row.contributionStatus)}
                    {profile?.status && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{translateStatusLabel(profile.status, locale)}</span>
                      </>
                    )}
                  </div>

                  <h2
                    id="balance-sheet-member-modal-title"
                    className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate"
                  >
                    {row.name}
                  </h2>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>Row #{row.serialNo}</span>
                    <span aria-hidden="true">·</span>
                    <span>Period: {fullMonthLabel}</span>
                    {profile?.joinedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Joined {formatShortDate(profile.joinedAt)} ({formatTenureShort(profile.joinedAt)})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCloseRef.current()}
                aria-label={tCommon('closeDialog')}
                className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
              {/* 1. Member Contact & Identity Details */}
              <section aria-label="Member identity and contact details" className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Member Information
                </h3>

                <dl className="grid grid-cols-1 sm:grid-cols-2 border-t border-b border-slate-200/90 dark:border-slate-800 divide-y sm:divide-y-0 text-xs">
                  {/* Member ID */}
                  <div className="py-2.5 sm:pr-4 sm:border-r sm:border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Member ID</dt>
                    <dd className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {row.memberCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy('memberCode', row.memberCode)}
                        aria-label="Copy member ID"
                        title="Copy member ID"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        {copiedKey === 'memberCode' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </dd>
                  </div>

                  {/* Phone Number */}
                  <div className="py-2.5 sm:pl-4 sm:border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Phone</dt>
                    <dd className="flex items-center gap-1.5 min-w-0">
                      <a
                        href={`tel:${row.mobile}`}
                        className="font-mono tabular-nums font-medium text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors truncate"
                      >
                        {row.mobile || '—'}
                      </a>
                      {row.mobile && (
                        <button
                          type="button"
                          onClick={() => void handleCopy('mobile', row.mobile)}
                          aria-label="Copy phone number"
                          title="Copy phone number"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          {copiedKey === 'mobile' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </dd>
                  </div>

                  {/* Email */}
                  <div className="py-2.5 sm:pr-4 sm:border-r sm:border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Email</dt>
                    <dd className="flex items-center gap-1.5 min-w-0">
                      <a
                        href={`mailto:${row.email}`}
                        className="font-mono text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors truncate"
                      >
                        {row.email || '—'}
                      </a>
                      {row.email && (
                        <button
                          type="button"
                          onClick={() => void handleCopy('email', row.email)}
                          aria-label="Copy email address"
                          title="Copy email address"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                        >
                          {copiedKey === 'email' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </dd>
                  </div>

                  {/* Occupation / Organization */}
                  <div className="py-2.5 sm:pl-4 sm:border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Occupation</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right truncate">
                      {profileQuery.isLoading ? (
                        <Skeleton width={110} height={14} />
                      ) : profile?.about.occupation || profile?.about.companyOrganization ? (
                        [profile.about.occupation, profile.about.companyOrganization]
                          .filter(Boolean)
                          .join(' · ')
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 font-normal">
                          Not provided
                        </span>
                      )}
                    </dd>
                  </div>

                  {/* Present Address */}
                  <div className="py-2.5 sm:pr-4 sm:border-r border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Address</dt>
                    <dd className="text-slate-900 dark:text-white text-right leading-relaxed">
                      {profileQuery.isLoading ? (
                        <Skeleton width={130} height={14} />
                      ) : profile?.about.presentAddress ? (
                        profile.about.presentAddress
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Not provided</span>
                      )}
                    </dd>
                  </div>

                  {/* Referred By */}
                  <div className="py-2.5 sm:pl-4 flex items-center justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Referred By</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right truncate">
                      {profileQuery.isLoading ? (
                        <Skeleton width={100} height={14} />
                      ) : profile?.about.referenceMemberName ? (
                        profile.about.referenceMemberName
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* 2. Balance Sheet Period Breakdown */}
              <section aria-label="Balance sheet period breakdown" className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Balance Sheet Ledger — {fullMonthLabel}
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Target {formatMoney(row.contributionTarget, currency)} · {targetPct}% met
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200/90 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/70 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-2 px-3 text-left font-semibold">Variable</th>
                        <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                          Previous ({prevMonthLabel})
                        </th>
                        <th className="py-2 px-3 text-right font-semibold whitespace-nowrap text-emerald-800 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/25">
                          Current ({shortMonthLabel})
                        </th>
                        <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                          Closing (→ {nextMonthLabel})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      <tr>
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          Contribution
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.previousSummary.contributionAmount > 0
                            ? formatMoney(row.previousSummary.contributionAmount, currency)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap bg-emerald-50/20 dark:bg-emerald-950/15">
                          {row.thisMonth.contributionAmount > 0 ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              +{formatMoney(row.thisMonth.contributionAmount, currency)}
                            </span>
                          ) : row.contributionPendingAmount > 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              {formatMoney(row.contributionPendingAmount, currency)} pending
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatMoney(row.thisMonthSummary.contributionAmount, currency)}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          Qard Hasan Issued
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.previousSummary.qardHasanAmount > 0
                            ? formatMoney(row.previousSummary.qardHasanAmount, currency)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap bg-emerald-50/20 dark:bg-emerald-950/15">
                          {row.thisMonth.qardHasanAmount > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              +{formatMoney(row.thisMonth.qardHasanAmount, currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {row.thisMonthSummary.qardHasanAmount > 0
                            ? formatMoney(row.thisMonthSummary.qardHasanAmount, currency)
                            : '—'}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          Refund Qard Hasan
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 dark:text-slate-600">
                          —
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap bg-emerald-50/20 dark:bg-emerald-950/15">
                          {row.thisMonth.repaidAmount > 0 ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              +{formatMoney(row.thisMonth.repaidAmount, currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 dark:text-slate-600">
                          —
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          Qard Due Balance
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          {row.previousSummary.dueHasanaAmount > 0
                            ? formatMoney(row.previousSummary.dueHasanaAmount, currency)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap bg-emerald-50/20 dark:bg-emerald-950/15 text-slate-700 dark:text-slate-300">
                          {formatSignedMoney(dueNetChange, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                          {row.thisMonthSummary.dueHasanaAmount > 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              {formatMoney(row.thisMonthSummary.dueHasanaAmount, currency)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {formatMoney(0, currency)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Net Equity & Scheduled Installment Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 border border-slate-200/90 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Closing Net Equity
                    </span>
                    <span
                      className={`font-mono tabular-nums text-sm font-bold ${
                        netEquity >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatMoney(netEquity, currency)}
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Scheduled Installment Due
                    </span>
                    <span
                      className={`font-mono tabular-nums text-sm font-bold ${
                        row.installmentDueThisMonth > 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {row.installmentDueThisMonth > 0
                        ? formatMoney(row.installmentDueThisMonth, currency)
                        : 'None'}
                    </span>
                  </div>
                </div>
              </section>

              {/* 3. Cooperative Standing & Recent Approved Deposits */}
              <section aria-label="Cooperative standing and recent deposits" className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  All-Time Cooperative Standing
                </h3>

                {profileQuery.isLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((k) => (
                      <Skeleton key={k} height={54} />
                    ))}
                  </div>
                ) : profile ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200/90 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800">
                      <div className="p-3">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Total Contributed
                        </div>
                        <div className="mt-1 font-mono tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {formatMoney(profile.fundSummary.totalContributed, profile.fundSummary.currency)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {profile.fundSummary.fundSharePct}% pool share
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Cooperative Equity
                        </div>
                        <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                          {formatMoney(
                            profile.fundSummary.cooperativeEquity,
                            profile.fundSummary.currency
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Profit: {formatMoney(profile.fundSummary.totalProfitDistributed, profile.fundSummary.currency)}
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Consistency
                        </div>
                        <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                          {profile.fundSummary.consistencyScore}%
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {profile.fundSummary.approvedMonthsCount} mos ·{' '}
                          {profile.fundSummary.currentStreakMonths}m streak
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Qard History
                        </div>
                        <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                          {profile.fundSummary.loansRepaidCount}/{profile.fundSummary.totalLoansTakenCount} repaid
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {profile.fundSummary.guarantorCount} co-signs
                        </div>
                      </div>
                    </div>

                    {/* Recent Approved Deposits */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Recent Approved Deposits
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                          {profile.fundSummary.approvedContributionsCount} verified
                          {profile.fundSummary.pendingContributionsCount > 0
                            ? ` · ${profile.fundSummary.pendingContributionsCount} pending`
                            : ''}
                        </span>
                      </div>

                      {profile.fundSummary.recentContributions.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                          No approved contribution deposits recorded yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200/90 dark:border-slate-800 rounded-xl">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-950/70 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                <th className="py-1.5 px-3 text-left font-semibold">Billing Month</th>
                                <th className="py-1.5 px-3 text-left font-semibold">Channel</th>
                                <th className="py-1.5 px-3 text-left font-semibold">Submitted</th>
                                <th className="py-1.5 px-3 text-right font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                              {profile.fundSummary.recentContributions.slice(0, 5).map((item) => (
                                <tr key={item.id}>
                                  <td className="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                                    {item.billingMonth}
                                  </td>
                                  <td className="py-2 px-3 font-mono uppercase text-slate-600 dark:text-slate-300">
                                    {item.channel}
                                  </td>
                                  <td className="py-2 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                    {formatShortDate(item.submittedAt)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                                    {formatMoney(item.amount, profile.fundSummary.currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Extended profile metrics are currently unavailable. Balance Sheet figures above
                    reflect the latest verified ledger.
                  </p>
                )}
              </section>
            </div>

            {/* Footer */}
            <footer className="px-5 sm:px-6 py-3.5 border-t border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Row-by-row Member Stepper */}
              <div className="flex items-center gap-1.5">
                {onNavigateRow && totalRows > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={!canGoPrev}
                      onClick={() => canGoPrev && onNavigateRow(rowIndex - 1)}
                      aria-label="Previous member"
                      className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Prev</span>
                    </button>
                    <span className="px-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {rowIndex + 1} / {totalRows}
                    </span>
                    <button
                      type="button"
                      disabled={!canGoNext}
                      onClick={() => canGoNext && onNavigateRow(rowIndex + 1)}
                      aria-label="Next member"
                      className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onViewMemberProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = row.userId;
                      onCloseRef.current();
                      onViewMemberProfile(targetId);
                    }}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open Full Profile</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onCloseRef.current()}
                  className="h-9 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Close
                </button>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
