'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Eye,
  EyeOff,
  FilePlus2,
  HandCoins,
  History,
  MailWarning,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatMoney, formatShortDate } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

export interface MfsIconTile {
  id: string;
  label: string;
  subValue?: string;
  Icon: typeof CreditCard;
  iconBgClass: string;
  iconColorClass: string;
  badge?: number;
  onClick: () => void;
}

interface MobileMfsHomeProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  pendingBadgeCount: (sectionId: DashboardSectionId) => number;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenLoanModal?: () => void;
}

export function MobileMfsHome({
  overview,
  contributions,
  loans,
  user,
  loading,
  pendingBadgeCount,
  onNavigate,
  onOpenLoanModal,
}: MobileMfsHomeProps) {
  const [balanceVisible, setBalanceVisible] = useState(false);

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const ccy = overview?.config.currency || 'BDT';

  const recentActivity = useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'contribution' | 'loan';
      title: string;
      subtitle: string;
      amount: number;
      status: string;
      dateIso: string;
      target: DashboardSectionId;
    }> = [];

    contributions
      .filter((c) => (isAdmin ? true : c.userId === user.id))
      .slice(0, 8)
      .forEach((c) => {
        list.push({
          id: `c-${c.id}`,
          kind: 'contribution',
          title: isAdmin
            ? `${c.memberName} · ${formatBillingMonth(c.billingMonth)}`
            : `Monthly Savings · ${formatBillingMonth(c.billingMonth)}`,
          subtitle: `${c.channel.toUpperCase()} · ${c.providerName}`,
          amount: c.amount,
          status: c.status,
          dateIso: c.reviewedAt || c.submittedAt,
          target: isAdmin ? 'transaction-history' : 'monthly-contribution',
        });
      });

    loans
      .filter((l) =>
        isAdmin
          ? true
          : l.borrowerId === user.id ||
            (Boolean(user.memberCode) && l.borrowerCode === user.memberCode)
      )
      .slice(0, 6)
      .forEach((l) => {
        list.push({
          id: `l-${l.id}`,
          kind: 'loan',
          title: isAdmin ? `${l.borrowerName} · ${l.id}` : `Qard Hasan · ${l.id}`,
          subtitle: `${l.installmentMonths} mo · ${l.purpose}`,
          amount: l.amount,
          status: l.status,
          dateIso: l.approvedAt || l.requestedAt,
          target: isAdmin ? 'transaction-history' : 'quard-hasan',
        });
      });

    list.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    return list.slice(0, 4);
  }, [contributions, loans, isAdmin, user.id, user.memberCode]);

  if (loading || !overview) {
    return (
      <div className="space-y-4">
        <Skeleton height={132} borderRadius={20} />
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} height={106} borderRadius={16} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} height={96} borderRadius={16} />
          ))}
        </div>
        <Skeleton height={150} borderRadius={16} />
      </div>
    );
  }

  const { config, treasury, personal, phase, daysUntilMaturity } = overview;

  const myActiveOrPendingLoan = !isAdmin
    ? loans.find(
        (l) =>
          (l.borrowerId === user.id ||
            (Boolean(user.memberCode) && l.borrowerCode === user.memberCode)) &&
          [
            'pending_guarantor',
            'pending_manager_review',
            'pending_vote',
            'approved_pending_disbursement',
            'active',
          ].includes(l.status)
      ) || null
    : null;

  const myGuarantorRequests = !isAdmin
    ? loans.filter(
        (l) =>
          l.status === 'pending_guarantor' &&
          l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
      )
    : [];

  // bKash-style Treasury Metric Icon Cards
  const treasuryTiles: MfsIconTile[] = [
    {
      id: 'fund-height',
      label: 'Fund Height',
      subValue: formatMoney(treasury.amanahHeight, ccy),
      Icon: TrendingUp,
      iconBgClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/60',
      iconColorClass: 'text-emerald-700 dark:text-emerald-400',
      onClick: () => onNavigate('statistics'),
    },
    {
      id: 'current-balance',
      label: 'Current Balance',
      subValue: formatMoney(treasury.currentBalance, ccy),
      Icon: ShieldCheck,
      iconBgClass:
        'bg-violet-50 dark:bg-violet-950/50 border-violet-200/80 dark:border-violet-800/60',
      iconColorClass: 'text-violet-700 dark:text-violet-400',
      onClick: () => onNavigate('transaction-history'),
    },
    {
      id: 'current-qard-hasan',
      label: 'Current Qard Hasan',
      subValue: formatMoney(treasury.quardHasanTotalCurrent, ccy),
      Icon: HandCoins,
      iconBgClass:
        'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/60',
      iconColorClass: 'text-amber-700 dark:text-amber-400',
      onClick: () => onNavigate(isAdmin ? 'ballot' : 'quard-hasan'),
    },
  ];

  // bKash-style Core Action Icons (all requested main page icons & labels)
  const coreActionTiles: MfsIconTile[] = [
    {
      id: 'pay-monthly-contribution',
      label: 'Pay Monthly Contribution',
      Icon: CreditCard,
      iconBgClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/60',
      iconColorClass: 'text-emerald-700 dark:text-emerald-400',
      badge: isManager ? pendingBadgeCount('monthly-contribution') : 0,
      onClick: () => onNavigate(isAdmin ? 'manager-desk' : 'monthly-contribution'),
    },
    {
      id: 'apply-qard-hasan',
      label: 'Apply for Qard Hasan',
      Icon: FilePlus2,
      iconBgClass: 'bg-teal-50 dark:bg-teal-950/50 border-teal-200/80 dark:border-teal-800/60',
      iconColorClass: 'text-teal-700 dark:text-teal-400',
      onClick: () => {
        if (isAdmin) {
          onNavigate('ballot');
        } else if (onOpenLoanModal) {
          onOpenLoanModal();
        } else {
          onNavigate('quard-hasan');
        }
      },
    },
    {
      id: 'my-amanah',
      label: 'My Amanah',
      Icon: Wallet,
      iconBgClass:
        'bg-violet-50 dark:bg-violet-950/50 border-violet-200/80 dark:border-violet-800/60',
      iconColorClass: 'text-violet-700 dark:text-violet-400',
      onClick: () => onNavigate(isAdmin ? 'my-profile' : 'my-amanah'),
    },
    {
      id: 'community',
      label: 'Community',
      Icon: MessageSquare,
      iconBgClass:
        'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200/80 dark:border-indigo-800/60',
      iconColorClass: 'text-indigo-700 dark:text-indigo-400',
      badge: pendingBadgeCount('community'),
      onClick: () => onNavigate('community'),
    },
    {
      id: 'members',
      label: 'Members',
      Icon: Users,
      iconBgClass: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200/80 dark:border-sky-800/60',
      iconColorClass: 'text-sky-700 dark:text-sky-400',
      badge: isAdmin ? pendingBadgeCount('member-registry') : 0,
      onClick: () => onNavigate('members'),
    },
    {
      id: 'voting',
      label: 'Voting',
      Icon: Vote,
      iconBgClass:
        'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/60',
      iconColorClass: 'text-amber-700 dark:text-amber-400',
      badge: pendingBadgeCount('ballot'),
      onClick: () => onNavigate('ballot'),
    },
  ];

  // Secondary Icons Grid (remaining dashboard features by role)
  const secondaryTiles: MfsIconTile[] = isAdmin
    ? [
        {
          id: 'member-registry',
          label: 'Users',
          Icon: UserCheck,
          iconBgClass:
            'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60',
          iconColorClass: 'text-emerald-700 dark:text-emerald-400',
          badge: pendingBadgeCount('member-registry'),
          onClick: () => onNavigate('member-registry'),
        },
        {
          id: 'manager-desk',
          label: 'Gov. Desk',
          Icon: ClipboardCheck,
          iconBgClass:
            'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
          iconColorClass: 'text-amber-700 dark:text-amber-400',
          badge: pendingBadgeCount('manager-desk'),
          onClick: () => onNavigate('manager-desk'),
        },
        {
          id: 'site-settings',
          label: 'Settings',
          Icon: Settings,
          iconBgClass:
            'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-800/60',
          iconColorClass: 'text-indigo-700 dark:text-indigo-400',
          onClick: () => onNavigate('site-settings'),
        },
        {
          id: 'system-audit-logs',
          label: 'Audit Logs',
          Icon: Shield,
          iconBgClass:
            'bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/60',
          iconColorClass: 'text-rose-700 dark:text-rose-400',
          onClick: () => onNavigate('system-audit-logs'),
        },
        {
          id: 'transaction-history',
          label: 'Ledger',
          Icon: History,
          iconBgClass:
            'bg-slate-100 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/70',
          iconColorClass: 'text-slate-700 dark:text-slate-200',
          onClick: () => onNavigate('transaction-history'),
        },
        {
          id: 'notification',
          label: 'Alerts',
          Icon: Bell,
          iconBgClass:
            'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
          iconColorClass: 'text-amber-700 dark:text-amber-400',
          badge: pendingBadgeCount('notification'),
          onClick: () => onNavigate('notification'),
        },
        {
          id: 'email-queue',
          label: 'Mail Queue',
          Icon: MailWarning,
          iconBgClass:
            'bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/60',
          iconColorClass: 'text-rose-700 dark:text-rose-400',
          badge: pendingBadgeCount('email-queue'),
          onClick: () => onNavigate('email-queue'),
        },
        {
          id: 'site-activity',
          label: 'Activity',
          Icon: Activity,
          iconBgClass:
            'bg-teal-50 dark:bg-teal-950/40 border-teal-200/70 dark:border-teal-800/60',
          iconColorClass: 'text-teal-700 dark:text-teal-400',
          onClick: () => onNavigate('site-activity'),
        },
      ]
    : [
        ...(isManager
          ? [
              {
                id: 'manager-desk',
                label: 'Mgr Desk',
                Icon: ClipboardCheck,
                iconBgClass:
                  'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/60',
                iconColorClass: 'text-amber-700 dark:text-amber-400',
                badge: pendingBadgeCount('manager-desk'),
                onClick: () => onNavigate('manager-desk'),
              },
              {
                id: 'member-registry',
                label: 'Registry',
                Icon: UserCheck,
                iconBgClass:
                  'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/60',
                iconColorClass: 'text-emerald-700 dark:text-emerald-400',
                badge: pendingBadgeCount('member-registry'),
                onClick: () => onNavigate('member-registry'),
              },
            ]
          : []),
        {
          id: 'transaction-history',
          label: 'Ledger',
          Icon: History,
          iconBgClass:
            'bg-slate-100 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/70',
          iconColorClass: 'text-slate-700 dark:text-slate-200',
          onClick: () => onNavigate('transaction-history'),
        },
        {
          id: 'statistics',
          label: 'Stats',
          Icon: BarChart3,
          iconBgClass:
            'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60',
          iconColorClass: 'text-emerald-700 dark:text-emerald-400',
          onClick: () => onNavigate('statistics'),
        },
        {
          id: 'manager-cycle',
          label: 'Cycle',
          Icon: CalendarClock,
          iconBgClass:
            'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
          iconColorClass: 'text-amber-700 dark:text-amber-400',
          onClick: () => onNavigate('manager-cycle'),
        },
        {
          id: 'notification',
          label: 'Alerts',
          Icon: Bell,
          iconBgClass:
            'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
          iconColorClass: 'text-amber-700 dark:text-amber-400',
          badge: pendingBadgeCount('notification'),
          onClick: () => onNavigate('notification'),
        },
        {
          id: 'my-profile',
          label: 'Profile',
          Icon: User,
          iconBgClass:
            'bg-slate-100 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/70',
          iconColorClass: 'text-slate-700 dark:text-slate-200',
          onClick: () => onNavigate('my-profile'),
        },
      ];

  return (
    <div className="space-y-4">
      {/* MFS Wallet Balance Card (Tap-for-Balance like bKash) */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-emerald-100/90 truncate">
              {user.name} · <span className="font-mono">{user.memberCode}</span>
            </div>
            <div className="text-[11px] text-emerald-100/75 capitalize mt-0.5">
              {user.role} ·{' '}
              {phase === 'qard_hasan' ? 'Phase 1 Qard Hasan' : 'Phase 2 Halal Equity'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBalanceVisible((v) => !v)}
            aria-label={balanceVisible ? 'Hide balance' : 'Tap for balance'}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-white/95 text-emerald-900 text-xs font-semibold shadow-xs active:scale-95 transition-transform inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {balanceVisible ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  {formatMoney(
                    isAdmin ? treasury.currentBalance : personal.totalContributed,
                    ccy
                  )}
                </span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>Tap for Balance</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-2.5 border-t border-white/15 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[11px] text-emerald-100/75">
              {isAdmin ? 'Total Contributions' : 'Pool Available'}
            </div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {balanceVisible
                ? formatMoney(
                    isAdmin ? treasury.totalContributionsPool : treasury.availableLiquidity,
                    ccy
                  )
                : '••••••'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-emerald-100/75">
              {isAdmin
                ? 'Active Members'
                : personal.activeLoanBalance > 0
                  ? 'Active Loan Due'
                  : 'Maturity Countdown'}
            </div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {isAdmin
                ? config.maxMembersCap
                  ? `${treasury.activeMembersCount}/${config.maxMembersCap}`
                  : `${treasury.activeMembersCount}`
                : personal.activeLoanBalance > 0
                  ? balanceVisible
                    ? formatMoney(personal.activeLoanBalance, ccy)
                    : '••••••'
                  : `${daysUntilMaturity}d`}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Actionable Alerts Strip */}
      {(myGuarantorRequests.length > 0 ||
        (!isAdmin && !personal.eligibility.noOverdueInstallments) ||
        (isAdmin && treasury.pendingMembersCount > 0) ||
        myActiveOrPendingLoan) && (
        <div className="space-y-2">
          {myGuarantorRequests.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
                    {myGuarantorRequests.length} Guarantor Co-Sign Request
                  </div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                    {myGuarantorRequests[0].borrowerName} ·{' '}
                    {formatMoney(myGuarantorRequests[0].amount, ccy)}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            </button>
          )}

          {!isAdmin && !personal.eligibility.noOverdueInstallments && (
            <button
              type="button"
              onClick={() => onNavigate('quard-hasan')}
              className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/35 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-red-900 dark:text-red-200 truncate">
                    {personal.eligibility.overdueCount} Overdue Installment(s)
                  </div>
                  <div className="text-[11px] text-red-800 dark:text-red-300 truncate">
                    Tap to settle in Qard Hasan
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            </button>
          )}

          {isAdmin && treasury.pendingMembersCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('member-registry')}
              className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
                    {treasury.pendingMembersCount} Pending Member Approval
                  </div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                    Tap to review KYC in Users &amp; Roles
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            </button>
          )}

          {myActiveOrPendingLoan && (
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  myActiveOrPendingLoan.status === 'pending_vote' ? 'ballot' : 'quard-hasan'
                )
              }
              className="w-full min-h-[56px] px-3.5 py-2.5 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/30 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <span className="font-mono">{myActiveOrPendingLoan.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(myActiveOrPendingLoan.amount, ccy)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                    <StatusText status={myActiveOrPendingLoan.status} />
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* Treasury Snapshot Icons: Fund Height, Current Balance, Current Qard Hasan */}
      <section aria-label="Treasury Snapshot" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          Fund Overview
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {treasuryTiles.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={tile.onClick}
                className="min-h-[104px] px-2 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer text-center"
              >
                <span
                  className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${tile.iconBgClass}`}
                >
                  <Icon className={`w-5 h-5 ${tile.iconColorClass}`} aria-hidden="true" />
                </span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                  {tile.label}
                </span>
                {tile.subValue && (
                  <span className="font-mono text-[11px] font-bold tabular-nums text-slate-900 dark:text-white leading-tight">
                    {tile.subValue}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Core bKash-Style Services Icon Grid */}
      <section aria-label="Services" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Services
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Tap any icon
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {coreActionTiles.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={tile.onClick}
                className="min-h-[96px] px-2 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer"
              >
                <span
                  className={`relative w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${tile.iconBgClass}`}
                >
                  <Icon className={`w-5 h-5 ${tile.iconColorClass}`} aria-hidden="true" />
                  {typeof tile.badge === 'number' && tile.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white font-mono text-[10px] font-bold tabular-nums flex items-center justify-center shadow-xs">
                      {tile.badge > 99 ? '99+' : tile.badge}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 leading-snug text-center">
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Secondary Quick Icons */}
      <section aria-label="More Tools" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          {isAdmin ? 'Governance & System' : isManager ? 'Shura & Account' : 'More Services'}
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {secondaryTiles.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={tile.onClick}
                className="min-h-[78px] px-1.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/75 dark:border-slate-800/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
              >
                <span
                  className={`relative w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${tile.iconBgClass}`}
                >
                  <Icon className={`w-4.5 h-4.5 ${tile.iconColorClass}`} aria-hidden="true" />
                  {typeof tile.badge === 'number' && tile.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white font-mono text-[10px] font-bold tabular-nums flex items-center justify-center shadow-xs">
                      {tile.badge > 99 ? '99+' : tile.badge}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 leading-tight text-center line-clamp-1">
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Activity Tap-List */}
      <section aria-label="Recent Activity" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Recent Activity
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer min-h-[44px] px-1.5"
          >
            <span>See All</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {recentActivity.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No recent contributions or loan activity yet.
            </div>
          ) : (
            recentActivity.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.target)}
                className="w-full min-h-[60px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      item.kind === 'contribution'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {item.kind === 'contribution' ? (
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <HandCoins className="w-4 h-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {formatShortDate(item.dateIso)} · {item.subtitle}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(item.amount, ccy)}
                  </div>
                  <div className="text-[10px] mt-0.5 flex justify-end">
                    <StatusText status={item.status} />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
