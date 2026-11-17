'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FilePlus2,
  HandCoins,
  History,
  Lock,
  MailWarning,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Users,
  Vote,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatBillingMonth, formatMoney, formatShortDate } from '../utils/format.ts';
import { useBodyScrollLock } from '../utils/modalLock.ts';
import { ActionModal } from './ActionModal.tsx';
import { ContributionLeaderboard } from './ContributionLeaderboard.tsx';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
import { RepaymentSchedule } from './RepaymentSchedule.tsx';
import { StatusText } from './StatusText.tsx';

export interface MfsIconTile {
  id: string;
  label: string;
  Icon: typeof CreditCard;
  iconBgClass: string;
  iconColorClass: string;
  badge?: number;
  onClick: () => void;
}

type MobileSheetId =
  | 'pulse'
  | 'queues'
  | 'borrowers'
  | 'repayments'
  | 'leaderboard'
  | 'standing'
  | null;

interface MobileMfsHomeProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  pendingBadgeCount: (sectionId: DashboardSectionId) => number;
  onNavigate: (section: DashboardSectionId) => void;
  onOpenManagerDeskTab?: (tab: ManagerDeskTab) => void;
  onOpenLoanModal?: () => void;
  onViewMemberProfile?: (userId: string) => void;
  onRefresh: () => Promise<void>;
}

function MobileBottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
            aria-hidden="true"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-h-[88dvh] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="pt-2.5 pb-1 shrink-0">
              <div
                className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto"
                aria-hidden="true"
              />
            </div>

            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="min-w-[44px] min-h-[44px] -mr-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-4 pb-8 space-y-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function MobileMfsHome({
  overview,
  contributions,
  loans,
  user,
  loading,
  pendingBadgeCount,
  onNavigate,
  onOpenManagerDeskTab,
  onOpenLoanModal,
  onViewMemberProfile,
  onRefresh,
}: MobileMfsHomeProps) {
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [activeSheet, setActiveSheet] = useState<MobileSheetId>(null);

  const [quotaInput, setQuotaInput] = useState(
    String(overview?.config.maxLoansPerYear ?? 3)
  );
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaNotice, setQuotaNotice] = useState<{
    tone: 'emerald' | 'red';
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (overview?.config.maxLoansPerYear !== undefined) {
      setQuotaInput(String(overview.config.maxLoansPerYear));
    }
  }, [overview?.config.maxLoansPerYear]);

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const isStaff = isAdmin || isManager;
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
    return list.slice(0, 5);
  }, [contributions, loans, isAdmin, user.id, user.memberCode]);

  async function handleQuickQuotaSave(e: FormEvent) {
    e.preventDefault();
    setSavingQuota(true);
    setQuotaNotice(null);
    try {
      const nextLimit = Number(quotaInput);
      await api.updateConfig({ maxLoansPerYear: nextLimit });
      await onRefresh();
      setQuotaNotice({
        tone: 'emerald',
        title: 'Annual Loan Quota Updated',
        description: `Saved: ${nextLimit} Qard Hasan loans per member per year.`,
      });
    } catch (err) {
      setQuotaNotice({
        tone: 'red',
        title: 'Quota Update Failed',
        description:
          err instanceof Error ? err.message : 'Could not update annual loan limit.',
      });
    } finally {
      setSavingQuota(false);
    }
  }

  if (loading || !overview) {
    return (
      <div className="space-y-4">
        <Skeleton height={162} borderRadius={20} />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height={92} borderRadius={16} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} height={96} borderRadius={16} />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height={82} borderRadius={16} />
          ))}
        </div>
        <Skeleton height={160} borderRadius={16} />
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
      ) ||
      (personal.eligibility?.activeLoanId
        ? loans.find(
            (l) =>
              l.id === personal.eligibility.activeLoanId &&
              l.status !== 'rejected' &&
              l.status !== 'repaid'
          ) || null
        : null)
    : null;

  const myGuarantorRequests = !isAdmin
    ? loans.filter(
        (l) =>
          l.status === 'pending_guarantor' &&
          l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
      )
    : [];

  const pendingGuarantorLoansCount = loans.filter(
    (l) => l.status === 'pending_guarantor'
  ).length;

  const totalQueueCount =
    treasury.pendingLoansReviewCount +
    treasury.pendingVotesCount +
    treasury.pendingContributionsCount +
    treasury.pendingDisbursementsCount +
    treasury.pendingRepaymentsCount;

  const repaymentRestorePct =
    treasury.approvedLoansDeducted > 0
      ? Math.round((treasury.totalRepaid / treasury.approvedLoansDeducted) * 100)
      : 100;

  const thisMonthContribPct =
    treasury.thisMonthContributionTarget > 0
      ? Math.min(
          100,
          Math.round(
            (treasury.thisMonthContributionCollected /
              treasury.thisMonthContributionTarget) *
              100
          )
        )
      : 0;

  const thisMonthClearancePct =
    treasury.thisMonthClearanceTotalMembers > 0
      ? Math.round(
          (treasury.thisMonthClearanceClearedMembers /
            treasury.thisMonthClearanceTotalMembers) *
            100
        )
      : 0;

  // Compute active loan progress tracker metadata
  const loanProgress = (() => {
    if (!myActiveOrPendingLoan) return null;
    const loan = myActiveOrPendingLoan;
    let progressPct = 20;
    let stageCaption = '';
    let barColor = 'bg-amber-500';
    if (loan.status === 'pending_guarantor') {
      progressPct = 15;
      const pendingNames = (loan.guarantors || [])
        .filter((g) => g.status === 'pending')
        .map((g) => g.memberName)
        .join(', ');
      stageCaption = pendingNames
        ? `Waiting for guarantor co-sign from ${pendingNames}`
        : 'Waiting for guarantor co-signature before Manager review';
    } else if (loan.status === 'pending_manager_review') {
      progressPct = 35;
      stageCaption = 'Queued in Manager Desk to initiate the 2/3 Opinion Ballot';
    } else if (loan.status === 'pending_vote') {
      progressPct = 60;
      const cast = loan.totalVotesCast ?? loan.votes.length;
      stageCaption = `Secret 2/3 Opinion Ballot open (${cast} / ${loan.totalEligibleVoters} ballots)`;
    } else if (loan.status === 'approved_pending_disbursement') {
      progressPct = 85;
      stageCaption = '2/3 quorum approved · Awaiting Manager payout release';
      barColor = 'bg-teal-600 dark:bg-teal-500';
    } else if (loan.status === 'active') {
      progressPct =
        loan.amount > 0
          ? Math.min(100, Math.round((loan.totalRepaid / loan.amount) * 100))
          : 0;
      stageCaption = `Repaid ${formatMoney(loan.totalRepaid, ccy)} of ${formatMoney(loan.amount, ccy)}`;
      barColor = 'bg-emerald-600';
    }
    return { loan, progressPct, stageCaption, barColor };
  })();

  // Core bKash-style Services Grid (exact requested icons + full desktop entry points)
  const coreActionTiles: MfsIconTile[] = [
    {
      id: 'pay-monthly-contribution',
      label: 'Pay Monthly Contribution',
      Icon: CreditCard,
      iconBgClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/60',
      iconColorClass: 'text-emerald-700 dark:text-emerald-400',
      badge: isManager ? pendingBadgeCount('monthly-contribution') : 0,
      onClick: () => {
        if (isAdmin) {
          if (onOpenManagerDeskTab) onOpenManagerDeskTab('contributions');
          else onNavigate('manager-desk');
        } else {
          onNavigate('monthly-contribution');
        }
      },
    },
    {
      id: 'apply-qard-hasan',
      label: 'Apply for Qard Hasan',
      Icon: FilePlus2,
      iconBgClass:
        'bg-teal-50 dark:bg-teal-950/50 border-teal-200/80 dark:border-teal-800/60',
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
      onClick: () => {
        if (isAdmin) {
          setActiveSheet('standing');
        } else {
          onNavigate('my-amanah');
        }
      },
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
      iconBgClass:
        'bg-sky-50 dark:bg-sky-950/50 border-sky-200/80 dark:border-sky-800/60',
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

  // Desktop-parity Analytical & Operational Sheet Launchers
  const insightTiles: MfsIconTile[] = [
    {
      id: 'monthly-pulse',
      label: 'Monthly Pulse',
      Icon: CalendarCheck,
      iconBgClass:
        'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60',
      iconColorClass: 'text-emerald-700 dark:text-emerald-400',
      onClick: () => setActiveSheet('pulse'),
    },
    {
      id: 'approval-queues',
      label: 'Queues',
      Icon: ClipboardCheck,
      iconBgClass:
        'bg-violet-50 dark:bg-violet-950/40 border-violet-200/70 dark:border-violet-800/60',
      iconColorClass: 'text-violet-700 dark:text-violet-400',
      badge: totalQueueCount,
      onClick: () => setActiveSheet('queues'),
    },
    {
      id: 'active-borrowers',
      label: 'Borrowers',
      Icon: HandCoins,
      iconBgClass:
        'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
      iconColorClass: 'text-amber-700 dark:text-amber-400',
      badge: treasury.activeBorrowers.length,
      onClick: () => setActiveSheet('borrowers'),
    },
    {
      id: 'repayment-schedule',
      label: 'Schedule',
      Icon: CalendarClock,
      iconBgClass:
        'bg-teal-50 dark:bg-teal-950/40 border-teal-200/70 dark:border-teal-800/60',
      iconColorClass: 'text-teal-700 dark:text-teal-400',
      onClick: () => setActiveSheet('repayments'),
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      Icon: Trophy,
      iconBgClass:
        'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60',
      iconColorClass: 'text-amber-700 dark:text-amber-400',
      onClick: () => setActiveSheet('leaderboard'),
    },
    {
      id: 'standing-quota',
      label: isAdmin ? 'Loan Quota' : 'Standing',
      Icon: ShieldCheck,
      iconBgClass:
        'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60',
      iconColorClass: 'text-emerald-700 dark:text-emerald-400',
      onClick: () => setActiveSheet('standing'),
    },
    {
      id: 'qard-hasan-page',
      label: isAdmin ? 'Ballots' : 'My Loans',
      Icon: HandCoins,
      iconBgClass:
        'bg-sky-50 dark:bg-sky-950/40 border-sky-200/70 dark:border-sky-800/60',
      iconColorClass: 'text-sky-700 dark:text-sky-400',
      onClick: () => onNavigate(isAdmin ? 'ballot' : 'quard-hasan'),
    },
    {
      id: 'statistics',
      label: 'Statistics',
      Icon: BarChart3,
      iconBgClass:
        'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-800/60',
      iconColorClass: 'text-indigo-700 dark:text-indigo-400',
      onClick: () => onNavigate('statistics'),
    },
  ];

  // Role-specific Governance & Account Tools
  const toolTiles: MfsIconTile[] = isAdmin
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
        {
          id: 'my-profile',
          label: 'Profile',
          Icon: User,
          iconBgClass:
            'bg-slate-100 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/70',
          iconColorClass: 'text-slate-700 dark:text-slate-200',
          onClick: () => onNavigate('my-profile'),
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
      {/* 1. MFS Wallet Card + Fund Phase & Maturity Context */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/85">
          <span className="truncate font-medium">
            {phase === 'qard_hasan' ? 'Phase 1 · Qard Hasan' : 'Phase 2 · Halal Equity'} · Maturity{' '}
            {formatShortDate(config.maturityDate)}
          </span>
          <span className="font-mono font-semibold tabular-nums shrink-0 text-amber-200">
            {daysUntilMaturity}d left
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{config.fundName}</div>
            <div className="text-[11px] text-emerald-100/85 truncate mt-0.5 capitalize">
              {user.name} · <span className="font-mono">{user.memberCode}</span> · {user.role}
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
          <button
            type="button"
            onClick={() => setActiveSheet('standing')}
            className="text-left min-h-[44px] flex flex-col justify-center cursor-pointer"
          >
            <div className="text-[11px] text-emerald-100/75">
              {isAdmin ? 'Contributions Pool' : 'Cooperative Equity'}
            </div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 flex items-center gap-1">
              <span>
                {balanceVisible
                  ? formatMoney(
                      isAdmin
                        ? treasury.totalContributionsPool
                        : personal.cooperativeEquity,
                      ccy
                    )
                  : '••••••'}
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-75 shrink-0" aria-hidden="true" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheet('standing')}
            className="text-right min-h-[44px] flex flex-col justify-center items-end cursor-pointer"
          >
            <div className="text-[11px] text-emerald-100/75">
              {isAdmin
                ? 'Active Members'
                : personal.activeLoanBalance > 0
                  ? 'Active Loan Due'
                  : 'Quota & Eligibility'}
            </div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 flex items-center gap-1">
              {isAdmin ? (
                <span>
                  {config.maxMembersCap
                    ? `${treasury.activeMembersCount}/${config.maxMembersCap}`
                    : `${treasury.activeMembersCount}`}
                </span>
              ) : personal.activeLoanBalance > 0 ? (
                <span>
                  {balanceVisible ? formatMoney(personal.activeLoanBalance, ccy) : '••••••'}
                </span>
              ) : (
                <span>
                  {personal.eligibility.loansUsedThisYear}/{personal.eligibility.maxLoansPerYear}{' '}
                  · {personal.eligibility.eligible ? 'Eligible' : 'Hold'}
                </span>
              )}
              <ChevronRight className="w-3.5 h-3.5 opacity-75 shrink-0" aria-hidden="true" />
            </div>
          </button>
        </div>
      </motion.section>

      {/* 2. Actionable Alerts & Active Loan Stage Tracker */}
      {(myGuarantorRequests.length > 0 ||
        (!isAdmin && !personal.eligibility.noOverdueInstallments) ||
        (isAdmin && treasury.overdueInstallmentsCount > 0) ||
        (isAdmin && treasury.pendingMembersCount > 0) ||
        loanProgress) && (
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

          {((!isAdmin && !personal.eligibility.noOverdueInstallments) ||
            (isAdmin && treasury.overdueInstallmentsCount > 0)) && (
            <button
              type="button"
              onClick={() =>
                isAdmin ? setActiveSheet('borrowers') : onNavigate('quard-hasan')
              }
              className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/35 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-red-900 dark:text-red-200 truncate">
                    {isAdmin
                      ? `${treasury.overdueInstallmentsCount} Overdue Cooperative Installment(s)`
                      : `${personal.eligibility.overdueCount} Overdue Installment(s)`}
                  </div>
                  <div className="text-[11px] text-red-800 dark:text-red-300 truncate">
                    {isAdmin ? 'Tap to inspect active borrowers' : 'Tap to settle in Qard Hasan'}
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

          {loanProgress && (
            <div className="rounded-2xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/25 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <HandCoins className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span className="font-mono">{loanProgress.loan.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatMoney(loanProgress.loan.amount, ccy)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <StatusText status={loanProgress.loan.status} />
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {loanProgress.loan.installmentMonths} mo
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      loanProgress.loan.status === 'pending_vote' ? 'ballot' : 'quard-hasan'
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>
                    {loanProgress.loan.status === 'pending_vote' ? 'Open Ballot' : 'Details'}
                  </span>
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${loanProgress.barColor}`}
                    style={{ width: `${loanProgress.progressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="truncate">{loanProgress.stageCaption}</span>
                  <span className="font-mono tabular-nums shrink-0 font-semibold">
                    {loanProgress.progressPct}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Treasury Headline KPI Strip (2x2 clean grid, zero truncation at 375px) */}
      <section aria-label="Fund Overview" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Fund Overview
          </h2>
          <button
            type="button"
            onClick={() => setActiveSheet('pulse')}
            className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer min-h-[32px] px-1"
          >
            <span>Monthly Pulse ({treasury.thisMonthKey})</span>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setActiveSheet('pulse')}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between text-left active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Fund Height
              </span>
              <span className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              </span>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(treasury.amanahHeight, ccy)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                {treasury.contributingMembersCount} members · Month {thisMonthContribPct}%
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between text-left active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Current Balance
              </span>
              <span className="w-7 h-7 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200/80 dark:border-violet-800/60 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-700 dark:text-violet-400" />
              </span>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMoney(treasury.currentBalance, ccy)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                Liquid reserve · Tap ledger
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheet('borrowers')}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between text-left active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Current Qard Hasan
              </span>
              <span className="w-7 h-7 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-center shrink-0">
                <HandCoins className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              </span>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMoney(treasury.quardHasanTotalCurrent, ccy)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                {treasury.activeBorrowers.length} active{' '}
                {treasury.activeBorrowers.length === 1 ? 'borrower' : 'borrowers'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheet('repayments')}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between text-left active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Repayments Returned
              </span>
              <span className="w-7 h-7 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              </span>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMoney(treasury.totalRepaid, ccy)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                {treasury.approvedLoansDeducted > 0
                  ? `${repaymentRestorePct}% restored · View schedule`
                  : 'Revolving principal · View schedule'}
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* 4. Core bKash-Style Services Icon Grid */}
      <section aria-label="Services" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          Services
        </h2>

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

      {/* 5. Insights, Queues & Analytics Iconic Menu (Desktop Overview Parity) */}
      <section aria-label="Treasury Insights and Queues" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          Insights &amp; Queues
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {insightTiles.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={tile.onClick}
                className="min-h-[80px] px-1.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/75 dark:border-slate-800/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
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

      {/* 6. Role-Specific Governance & Account Tools */}
      <section aria-label="Tools and Governance" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          {isAdmin ? 'Governance & System' : isManager ? 'Shura & Account' : 'Account & Ledger'}
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {toolTiles.map((tile) => {
            const Icon = tile.Icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={tile.onClick}
                className="min-h-[80px] px-1.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/75 dark:border-slate-800/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
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

      {/* 7. Recent Activity Tap-List */}
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

      {/* ==================== DRILL-DOWN BOTTOM SHEETS (Full Desktop Parity) ==================== */}

      {/* Sheet 1: Monthly Treasury Pulse & Clearance */}
      <MobileBottomSheet
        open={activeSheet === 'pulse'}
        onClose={() => setActiveSheet(null)}
        title={`Monthly Pulse (${treasury.thisMonthKey})`}
        subtitle={`${treasury.thisMonthClearanceClearedMembers}/${treasury.thisMonthClearanceTotalMembers} members cleared · Maturity ${formatShortDate(config.maturityDate)}`}
      >
        <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {phase === 'qard_hasan'
              ? 'Phase 1 · Active Qard Hasan Lending'
              : 'Phase 2 · Post-Maturity Halal Investment'}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {config.halalInvestmentThesis}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>This Month Contribution</span>
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthContributionCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthContributionTarget, ccy)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${thisMonthContribPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-1.5">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              This Month Due (Remaining / Target)
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-violet-700 dark:text-violet-400">
              {formatMoney(treasury.thisMonthDueRemaining, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthDueTarget, ccy)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {treasury.thisMonthDueRemaining === 0
                ? 'All monthly contribution targets collected'
                : 'Pending collection from members this cycle'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-1.5">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              This Month Hasan Installment
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthHasanInstallmentCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthHasanInstallmentNeed, ccy)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {treasury.thisMonthHasanInstallmentNeed > 0
                ? 'Installments due & collected this month'
                : 'No installments due this month'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>This Month Clearance</span>
              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.thisMonthClearanceClearedMembers}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {treasury.thisMonthClearanceTotalMembers} cleared
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${thisMonthClearancePct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              This Month Member Clearance
            </h3>
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
              {treasury.thisMonthClearanceClearedMembers}/{treasury.thisMonthClearanceTotalMembers}
            </span>
          </div>

          {treasury.thisMonthMemberClearance.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No active contributing members found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
              {treasury.thisMonthMemberClearance.map((entry) => (
                <button
                  key={entry.userId}
                  type="button"
                  onClick={() => {
                    if (onViewMemberProfile) {
                      setActiveSheet(null);
                      onViewMemberProfile(entry.userId);
                    }
                  }}
                  className="w-full min-h-[54px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                      {entry.memberName}{' '}
                      <span className="font-mono text-slate-500 dark:text-slate-400 font-normal">
                        ({entry.memberCode})
                      </span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatMoney(entry.contributedAmount, ccy)} /{' '}
                      {formatMoney(entry.targetAmount, ccy)}
                    </div>
                  </div>

                  <span
                    className={`font-semibold text-[11px] uppercase tracking-wide shrink-0 ${
                      entry.status === 'cleared'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : entry.status === 'pending'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {entry.status === 'cleared'
                      ? 'Cleared'
                      : entry.status === 'pending'
                        ? 'Pending Review'
                        : 'Due'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </MobileBottomSheet>

      {/* Sheet 2: Active Governance & Approval Queues (5 Desktop Queues) */}
      <MobileBottomSheet
        open={activeSheet === 'queues'}
        onClose={() => setActiveSheet(null)}
        title="Governance & Approval Queues"
        subtitle="2/3 anonymized ballots · AES-256-GCM encrypted records"
      >
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              if (isStaff && onOpenManagerDeskTab) onOpenManagerDeskTab('qard-hasan');
              else onNavigate(isStaff ? 'manager-desk' : 'quard-hasan');
            }}
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Pending Loan Reviews
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff
                    ? pendingGuarantorLoansCount > 0
                      ? `Initiate 2/3 ballot (+${pendingGuarantorLoansCount} awaiting guarantor)`
                      : 'Initiate 2/3 ballot in Manager Desk'
                    : 'Inspect Qard Hasan queue'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {treasury.pendingLoansReviewCount}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              onNavigate('ballot');
            }}
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-violet-200/80 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Vote className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Open 2/3 Ballots
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  Cast anonymized secret vote
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {treasury.pendingVotesCount}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              if (isStaff && onOpenManagerDeskTab) onOpenManagerDeskTab('contributions');
              else
                onNavigate(
                  isManager
                    ? 'manager-desk'
                    : isAdmin
                      ? 'transaction-history'
                      : 'monthly-contribution'
                );
            }}
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Pending Deposits
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff ? 'Review in Manager Desk' : 'View contribution submission status'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {treasury.pendingContributionsCount}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              if (isStaff && onOpenManagerDeskTab) onOpenManagerDeskTab('qard-hasan');
              else onNavigate(isStaff ? 'manager-desk' : 'ballot');
            }}
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Awaiting Disbursement
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff ? 'Confirm payout in Manager Desk' : 'Multi-sig treasury release'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {treasury.pendingDisbursementsCount}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              if (isStaff && onOpenManagerDeskTab) onOpenManagerDeskTab('installments');
              else
                onNavigate(
                  isManager
                    ? 'manager-desk'
                    : isAdmin
                      ? 'transaction-history'
                      : 'quard-hasan'
                );
            }}
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Pending Repayments
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff ? 'Verify installments in Manager Desk' : 'Inspect installment receipts'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {treasury.pendingRepaymentsCount}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        </div>
      </MobileBottomSheet>

      {/* Sheet 3: Active Qard Hasan Borrowers */}
      <MobileBottomSheet
        open={activeSheet === 'borrowers'}
        onClose={() => setActiveSheet(null)}
        title="Active Qard Hasan Borrowers"
        subtitle={`${treasury.activeBorrowers.length} active · Disbursed ${formatMoney(treasury.totalLoansDisbursed, ccy)}`}
      >
        {treasury.activeBorrowers.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No active Qard Hasan loans are currently outstanding.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
            {treasury.activeBorrowers.map((b) => (
              <button
                key={b.loanId}
                type="button"
                onClick={() => {
                  if (onViewMemberProfile) {
                    setActiveSheet(null);
                    onViewMemberProfile(b.borrowerId);
                  }
                }}
                className="w-full min-h-[64px] px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {b.borrowerName}{' '}
                    <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                      ({b.borrowerCode})
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {b.loanId}
                    {b.nextDueDate ? ` · Due ${formatShortDate(b.nextDueDate)}` : ''}
                    {b.missedInstallmentsCount > 0 && (
                      <span className="text-red-600 dark:text-red-400 ml-1">
                        · {b.missedInstallmentsCount} overdue
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {formatMoney(b.dueAmount, ccy)}{' '}
                    <span className="text-[11px] font-normal text-amber-700 dark:text-amber-400">
                      due
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Repaid {formatMoney(b.totalRepaid, ccy)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setActiveSheet(null);
            onNavigate(isAdmin ? 'ballot' : 'quard-hasan');
          }}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>{isAdmin ? 'Open Voting & Ballots' : 'Open Qard Hasan Workspace'}</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </MobileBottomSheet>

      {/* Sheet 4: Full Repayment Schedule */}
      <MobileBottomSheet
        open={activeSheet === 'repayments'}
        onClose={() => setActiveSheet(null)}
        title="Repayment Schedule"
        subtitle="0% interest revolving installments"
      >
        <RepaymentSchedule
          loans={loans}
          config={config}
          user={user}
          loading={loading}
          onNavigate={(sec) => {
            setActiveSheet(null);
            onNavigate(sec);
          }}
          onOpenLoanModal={
            onOpenLoanModal
              ? () => {
                  setActiveSheet(null);
                  onOpenLoanModal();
                }
              : undefined
          }
        />
      </MobileBottomSheet>

      {/* Sheet 5: Full Contribution Leaderboard */}
      <MobileBottomSheet
        open={activeSheet === 'leaderboard'}
        onClose={() => setActiveSheet(null)}
        title="Contribution Leaderboard"
        subtitle="Top contributors & consistent payers"
      >
        <ContributionLeaderboard
          entries={overview.leaderboard || []}
          config={config}
          loading={loading}
          onNavigate={(sec) => {
            setActiveSheet(null);
            onNavigate(sec);
          }}
          onViewMemberProfile={
            onViewMemberProfile
              ? (memberId) => {
                  setActiveSheet(null);
                  onViewMemberProfile(memberId);
                }
              : undefined
          }
        />
      </MobileBottomSheet>

      {/* Sheet 6: Member Standing / Admin Oversight & Quota Control */}
      <MobileBottomSheet
        open={activeSheet === 'standing'}
        onClose={() => setActiveSheet(null)}
        title={isAdmin ? 'Oversight & Annual Loan Quota' : 'Your Member Standing'}
        subtitle={`${user.name} · ${user.memberCode}`}
      >
        {isAdmin ? (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3.5 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Pending Profile Edits</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingProfileRequestsCount}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Open Decision Polls</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.openDecisionPollsCount}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Upcoming Meetings</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.upcomingMeetingsCount}
                </dd>
              </div>
            </dl>

            <form
              onSubmit={handleQuickQuotaSave}
              className="rounded-xl border border-violet-200/80 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 p-3.5 space-y-3"
            >
              <div>
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Administrator Quota Control
                </div>
                <label
                  htmlFor="mobile-admin-annual-loan-limit"
                  className="block text-xs font-semibold text-slate-900 dark:text-white mt-0.5"
                >
                  Max Qard Hasan Loans Per Member / Year
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="mobile-admin-annual-loan-limit"
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                  className="w-24 min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  disabled={savingQuota}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingQuota ? 'Saving…' : 'Update Annual Limit'}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveSheet(null);
                  onNavigate('member-registry');
                }}
                className="min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>Users &amp; Roles</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSheet(null);
                  onNavigate('site-settings');
                }}
                className="min-h-[44px] py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>Site Settings</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3.5 text-xs">
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">Your Approved Deposits</dt>
                <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(personal.totalContributed, ccy)}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">
                  {personal.activeLoanBalance > 0
                    ? 'Active Loan Balance'
                    : myActiveOrPendingLoan
                      ? 'Pending Qard Hasan Request'
                      : 'Active Loan Balance'}
                </dt>
                <dd className="text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {personal.activeLoanBalance > 0
                    ? formatMoney(personal.activeLoanBalance, ccy)
                    : myActiveOrPendingLoan
                      ? formatMoney(myActiveOrPendingLoan.amount, ccy)
                      : formatMoney(0, ccy)}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">Cooperative Net Equity</dt>
                <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(personal.cooperativeEquity, ccy)}
                  {personal.totalProfitDistributed > 0 && (
                    <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 ml-1">
                      (+{formatMoney(personal.totalProfitDistributed, ccy)})
                    </span>
                  )}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">Annual Loan Quota</dt>
                <dd className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {personal.eligibility.loansUsedThisYear} /{' '}
                  {personal.eligibility.maxLoansPerYear} used
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {personal.eligibility.eligible ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Eligible for Qard Hasan Request
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">
                      Not Eligible for Qard Hasan
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {personal.eligibility.reasons[0]}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {onOpenLoanModal && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSheet(null);
                    onOpenLoanModal();
                  }}
                  className="min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  <span>Request Qard Hasan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveSheet(null);
                  onNavigate('my-amanah');
                }}
                className="min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Open My Amanah</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </MobileBottomSheet>

      <ActionModal
        open={quotaNotice !== null}
        mode="notice"
        tone={quotaNotice?.tone || 'emerald'}
        title={quotaNotice?.title || ''}
        description={quotaNotice?.description || ''}
        onClose={() => setQuotaNotice(null)}
      />
    </div>
  );
}
