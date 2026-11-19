'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  FileSpreadsheet,
  HandCoins,
  History,
  Lock,
  MessageSquare,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Vote,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { translateRoleLabel } from '../i18n/messages.ts';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatMoney, formatShortDate } from '../utils/format.ts';
import { useBodyScrollLock } from '../utils/modalLock.ts';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
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
  const tCommon = useTranslations('Common');
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
                aria-label={tCommon('closeItem', { title })}
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

const MFS_TAP_SPRING = {
  type: 'spring' as const,
  stiffness: 540,
  damping: 28,
  mass: 0.6,
};

function MfsGridTileButton({
  tile,
  compact = false,
  labelWeight = 'medium',
  singleLine = false,
}: {
  tile: MfsIconTile;
  compact?: boolean;
  labelWeight?: 'medium' | 'semibold';
  singleLine?: boolean;
}) {
  const Icon = tile.Icon;
  return (
    <motion.button
      type="button"
      onClick={tile.onClick}
      whileTap={{ scale: 0.94, y: 1.5 }}
      transition={MFS_TAP_SPRING}
      className={`${
        compact ? 'mfs-tile-compact gap-1.5' : 'mfs-tile gap-2'
      } rounded-2xl bg-gradient-to-b from-white to-emerald-50/45 dark:from-slate-900 dark:to-slate-900/95 border ${
        compact
          ? 'border-emerald-200/75 dark:border-emerald-800/50'
          : 'border-emerald-200/85 dark:border-emerald-800/55'
      } hover:border-emerald-400 dark:hover:border-emerald-500/75 active:bg-emerald-50/60 dark:active:bg-slate-800/90 active:shadow-inner shadow-xs flex flex-col items-center justify-center transition-colors cursor-pointer`}
    >
      <span
        className={`mfs-tile-icon-box relative rounded-2xl border flex items-center justify-center shrink-0 ${tile.iconBgClass}`}
      >
        <Icon className={`mfs-tile-icon ${tile.iconColorClass}`} aria-hidden="true" />
        {typeof tile.badge === 'number' && tile.badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white font-mono text-[10px] font-bold tabular-nums flex items-center justify-center shadow-xs">
            {tile.badge > 99 ? '99+' : tile.badge}
          </span>
        )}
      </span>
      <span
        className={`mfs-tile-label ${
          labelWeight === 'semibold'
            ? 'font-semibold text-slate-800 dark:text-slate-100 leading-snug'
            : 'font-medium text-slate-700 dark:text-slate-200 leading-tight'
        } text-center ${singleLine ? 'line-clamp-1' : ''}`}
      >
        {tile.label}
      </span>
    </motion.button>
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
}: MobileMfsHomeProps) {
  const { locale } = useCoopSession();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const tDash = useTranslations('Dashboard');
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [activeSheet, setActiveSheet] = useState<MobileSheetId>(null);

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
            : `${tDash('mobile.monthlySavingsLabel')} · ${formatBillingMonth(c.billingMonth)}`,
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
          title: isAdmin
            ? `${l.borrowerName} · ${l.id}`
            : `${tDash('mobile.qardHasanLabel')} · ${l.id}`,
          subtitle: `${l.installmentMonths} ${tCommon('monthsShort')} · ${l.purpose}`,
          amount: l.amount,
          status: l.status,
          dateIso: l.approvedAt || l.requestedAt,
          target: isAdmin ? 'transaction-history' : 'quard-hasan',
        });
      });

    list.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    return list.slice(0, 5);
  }, [contributions, loans, isAdmin, user.id, user.memberCode, tDash, tCommon]);

  if (loading || !overview) {
    return (
      <div className="space-y-4">
        <Skeleton height={162} borderRadius={20} />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height={92} borderRadius={16} />
          ))}
        </div>
        <div className="mfs-icon-grid-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} height={96} borderRadius={16} />
          ))}
        </div>
        <div className="mfs-icon-grid-4">
          {Array.from({ length: 8 }).map((_, idx) => (
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
        ? tDash('mobile.waitingGuarantorNames', { names: pendingNames })
        : tDash('mobile.waitingGuarantor');
    } else if (loan.status === 'pending_manager_review') {
      progressPct = 35;
      stageCaption = tDash('mobile.queuedInDesk', {
        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
      });
    } else if (loan.status === 'pending_vote') {
      progressPct = 60;
      const cast = loan.totalVotesCast ?? loan.votes.length;
      stageCaption = tDash('mobile.secretBallotOpen', {
        cast,
        total: loan.totalEligibleVoters,
      });
    } else if (loan.status === 'approved_pending_disbursement') {
      progressPct = 85;
      stageCaption = tDash('mobile.quorumApprovedPayout');
      barColor = 'bg-teal-600 dark:bg-teal-500';
    } else if (loan.status === 'active') {
      progressPct =
        loan.amount > 0
          ? Math.min(100, Math.round((loan.totalRepaid / loan.amount) * 100))
          : 0;
      stageCaption = tDash('mobile.repaidOfTotal', {
        repaid: formatMoney(loan.totalRepaid, ccy),
        total: formatMoney(loan.amount, ccy),
      });
      barColor = 'bg-emerald-600';
    }
    return { loan, progressPct, stageCaption, barColor };
  })();

  // 1. Primary Services (3-col bKash-style primary icons)
  const coreActionTiles: MfsIconTile[] = isAdmin
    ? [
        {
          id: 'member-registry',
          label: tNav('usersAndRoles'),
          Icon: UserCheck,
          iconBgClass:
            'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
          iconColorClass: 'text-emerald-600 dark:text-emerald-300',
          badge: pendingBadgeCount('member-registry'),
          onClick: () => onNavigate('member-registry'),
        },
        {
          id: 'manager-desk',
          label: tNav('governanceDesk'),
          Icon: ClipboardCheck,
          iconBgClass:
            'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
          iconColorClass: 'text-amber-600 dark:text-amber-300',
          badge: pendingBadgeCount('manager-desk'),
          onClick: () => onNavigate('manager-desk'),
        },
        {
          id: 'site-settings',
          label: tNav('siteSettings'),
          Icon: Settings,
          iconBgClass:
            'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
          iconColorClass: 'text-indigo-600 dark:text-indigo-300',
          badge: pendingBadgeCount('site-settings'),
          onClick: () => onNavigate('site-settings'),
        },
        {
          id: 'community',
          label: tNav('community'),
          Icon: MessageSquare,
          iconBgClass:
            'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
          iconColorClass: 'text-teal-600 dark:text-teal-300',
          badge: pendingBadgeCount('community'),
          onClick: () => onNavigate('community'),
        },
        {
          id: 'members',
          label: tNav('members'),
          Icon: Users,
          iconBgClass:
            'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
          iconColorClass: 'text-sky-600 dark:text-sky-300',
          onClick: () => onNavigate('members'),
        },
        {
          id: 'voting',
          label: tNav('voting'),
          Icon: Vote,
          iconBgClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
          iconColorClass: 'text-violet-600 dark:text-violet-300',
          badge: pendingBadgeCount('ballot'),
          onClick: () => onNavigate('ballot'),
        },
      ]
    : [
        {
          id: 'pay-monthly-contribution',
          label: tNav('contributions'),
          Icon: CreditCard,
          iconBgClass:
            'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
          iconColorClass: 'text-emerald-600 dark:text-emerald-300',
          badge: isManager ? pendingBadgeCount('monthly-contribution') : 0,
          onClick: () => onNavigate('monthly-contribution'),
        },
        {
          id: 'apply-qard-hasan',
          label: tNav('requestLoan'),
          Icon: FilePlus2,
          iconBgClass:
            'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
          iconColorClass: 'text-teal-600 dark:text-teal-300',
          onClick: () => {
            if (onOpenLoanModal) {
              onOpenLoanModal();
            } else {
              onNavigate('quard-hasan');
            }
          },
        },
        {
          id: 'my-amanah',
          label: tNav('myAmanah'),
          Icon: Wallet,
          iconBgClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
          iconColorClass: 'text-violet-600 dark:text-violet-300',
          onClick: () => onNavigate('my-amanah'),
        },
        {
          id: 'community',
          label: tNav('community'),
          Icon: MessageSquare,
          iconBgClass:
            'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
          iconColorClass: 'text-indigo-600 dark:text-indigo-300',
          badge: pendingBadgeCount('community'),
          onClick: () => onNavigate('community'),
        },
        {
          id: 'members',
          label: tNav('members'),
          Icon: Users,
          iconBgClass:
            'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
          iconColorClass: 'text-sky-600 dark:text-sky-300',
          onClick: () => onNavigate('members'),
        },
        {
          id: 'voting',
          label: tNav('voting'),
          Icon: Vote,
          iconBgClass:
            'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
          iconColorClass: 'text-amber-600 dark:text-amber-300',
          badge: pendingBadgeCount('ballot'),
          onClick: () => onNavigate('ballot'),
        },
      ];

  // 2. Every Remaining Functional Page (4-col iconic grid so 100% of functional pages are on Home!)
  const functionalPageTiles: MfsIconTile[] = isAdmin
    ? [
        {
          id: 'transaction-history',
          label: tNav('transactions'),
          Icon: History,
          iconBgClass:
            'bg-cyan-100/90 dark:bg-cyan-500/20 border-cyan-300/85 dark:border-cyan-400/45',
          iconColorClass: 'text-cyan-700 dark:text-cyan-300',
          onClick: () => onNavigate('transaction-history'),
        },
        {
          id: 'statistics',
          label: tNav('statistics'),
          Icon: BarChart3,
          iconBgClass:
            'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
          iconColorClass: 'text-emerald-600 dark:text-emerald-300',
          onClick: () => onNavigate('statistics'),
        },
        {
          id: 'balance-sheet',
          label: tNav('balanceSheet'),
          Icon: FileSpreadsheet,
          iconBgClass:
            'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
          iconColorClass: 'text-teal-600 dark:text-teal-300',
          onClick: () => onNavigate('balance-sheet'),
        },
        {
          id: 'manager-cycle',
          label: tNav('managerCycle'),
          Icon: CalendarClock,
          iconBgClass:
            'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
          iconColorClass: 'text-amber-600 dark:text-amber-300',
          onClick: () => onNavigate('manager-cycle'),
        },
        {
          id: 'notification',
          label: tNav('notifications'),
          Icon: Bell,
          iconBgClass:
            'bg-orange-100/90 dark:bg-orange-500/20 border-orange-300/85 dark:border-orange-400/45',
          iconColorClass: 'text-orange-600 dark:text-orange-300',
          badge: pendingBadgeCount('notification'),
          onClick: () => onNavigate('notification'),
        },
        {
          id: 'site-activity',
          label: tNav('siteActivity'),
          Icon: Activity,
          iconBgClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
          iconColorClass: 'text-violet-600 dark:text-violet-300',
          onClick: () => onNavigate('site-activity'),
        },
        {
          id: 'my-profile',
          label: tNav('profile'),
          Icon: User,
          iconBgClass:
            'bg-rose-100/90 dark:bg-rose-500/20 border-rose-300/85 dark:border-rose-400/45',
          iconColorClass: 'text-rose-600 dark:text-rose-300',
          onClick: () => onNavigate('my-profile'),
        },
      ]
    : [
        {
          id: 'quard-hasan',
          label: tNav('qardHasan'),
          Icon: HandCoins,
          iconBgClass:
            'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
          iconColorClass: 'text-amber-600 dark:text-amber-300',
          onClick: () => onNavigate('quard-hasan'),
        },
        {
          id: 'transaction-history',
          label: tNav('transactions'),
          Icon: History,
          iconBgClass:
            'bg-cyan-100/90 dark:bg-cyan-500/20 border-cyan-300/85 dark:border-cyan-400/45',
          iconColorClass: 'text-cyan-700 dark:text-cyan-300',
          onClick: () => onNavigate('transaction-history'),
        },
        {
          id: 'statistics',
          label: tNav('statistics'),
          Icon: BarChart3,
          iconBgClass:
            'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
          iconColorClass: 'text-emerald-600 dark:text-emerald-300',
          onClick: () => onNavigate('statistics'),
        },
        {
          id: 'balance-sheet',
          label: tNav('balanceSheet'),
          Icon: FileSpreadsheet,
          iconBgClass:
            'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
          iconColorClass: 'text-teal-600 dark:text-teal-300',
          onClick: () => onNavigate('balance-sheet'),
        },
        {
          id: 'manager-cycle',
          label: tNav('managerCycle'),
          Icon: CalendarClock,
          iconBgClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
          iconColorClass: 'text-violet-600 dark:text-violet-300',
          onClick: () => onNavigate('manager-cycle'),
        },
        {
          id: 'notification',
          label: tNav('notifications'),
          Icon: Bell,
          iconBgClass:
            'bg-orange-100/90 dark:bg-orange-500/20 border-orange-300/85 dark:border-orange-400/45',
          iconColorClass: 'text-orange-600 dark:text-orange-300',
          badge: pendingBadgeCount('notification'),
          onClick: () => onNavigate('notification'),
        },
        {
          id: 'my-profile',
          label: tNav('profile'),
          Icon: User,
          iconBgClass:
            'bg-rose-100/90 dark:bg-rose-500/20 border-rose-300/85 dark:border-rose-400/45',
          iconColorClass: 'text-rose-600 dark:text-rose-300',
          onClick: () => onNavigate('my-profile'),
        },
        ...(isManager
          ? [
              {
                id: 'manager-desk',
                label: tNav('managerDesk'),
                Icon: ClipboardCheck,
                iconBgClass:
                  'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
                iconColorClass: 'text-amber-600 dark:text-amber-300',
                badge: pendingBadgeCount('manager-desk'),
                onClick: () => onNavigate('manager-desk'),
              },
              {
                id: 'member-registry',
                label: tNav('memberRegistry'),
                Icon: UserCheck,
                iconBgClass:
                  'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
                iconColorClass: 'text-sky-600 dark:text-sky-300',
                badge: pendingBadgeCount('member-registry'),
                onClick: () => onNavigate('member-registry'),
              },
            ]
          : []),
      ];

  return (
    <div className="space-y-4">
      {/* 1. MFS Wallet Card + Fund Phase & Maturity Context */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white p-4 shadow-lg shadow-emerald-600/25 border border-emerald-400/40 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/85">
          <span className="truncate font-medium">
            {phase === 'qard_hasan' ? tDash('phase1Short') : tDash('phase2Short')} ·{' '}
            {tDash('maturityLabel', { date: formatShortDate(config.maturityDate) })}
          </span>
          <span className="font-mono font-semibold tabular-nums shrink-0 text-amber-200">
            {tCommon('daysLeft', { days: daysUntilMaturity })}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AmanahLogo
              size="sm"
              decorative
              className="ring-1 ring-white/25 shadow-sm"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{config.fundName}</div>
              <div className="text-[11px] text-emerald-100/85 truncate mt-0.5">
                {user.name} · <span className="font-mono">{user.memberCode}</span> ·{' '}
                {translateRoleLabel(user.role, locale)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBalanceVisible((v) => !v)}
            aria-label={balanceVisible ? tDash('hideBalance') : tDash('tapForBalance')}
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
                <span>{tDash('tapForBalance')}</span>
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
              {isAdmin ? tDash('contributionsPool') : tDash('sheets.yourApprovedDeposits')}
            </div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 flex items-center gap-1">
              <span>
                {balanceVisible
                  ? formatMoney(
                      isAdmin
                        ? treasury.totalContributionsPool
                        : personal.totalContributed,
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
                ? tDash('activeMembers')
                : personal.activeLoanBalance > 0
                  ? tDash('activeLoanDue')
                  : tDash('quotaEligibility')}
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
                  · {personal.eligibility.eligible ? tCommon('eligible') : tCommon('hold')}
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
                    {tDash('alerts.guarantorPending', { count: myGuarantorRequests.length })}
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
                      ? tDash('alerts.overdueCoopInstallments', { count: treasury.overdueInstallmentsCount })
                      : tDash('alerts.overdueInstallments', { count: personal.eligibility.overdueCount ?? 0 })}
                  </div>
                  <div className="text-[11px] text-red-800 dark:text-red-300 truncate">
                    {isAdmin ? tDash('alerts.tapInspectBorrowers') : tDash('alerts.tapSettleLoan')}
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
                    {tDash('alerts.pendingMemberApprovals', { count: treasury.pendingMembersCount })}
                  </div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                    {tDash('alerts.tapReviewKyc')}
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
                      {loanProgress.loan.installmentMonths} {tCommon('monthsShort')}
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
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-semibold shadow-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>
                    {loanProgress.loan.status === 'pending_vote'
                      ? tDash('alerts.openVoting')
                      : tDash('alerts.openQardHasan')}
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

      {/* 3. Treasury Headline KPI Strip (2x2 clean grid) */}
      <section aria-label={tDash('fundOverview')} className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {tDash('fundOverview')}
          </h2>
          <div className="flex items-center gap-3 shrink-0">
            {totalQueueCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveSheet('queues')}
                className="text-[11px] font-medium text-violet-700 dark:text-violet-400 inline-flex items-center gap-1 cursor-pointer min-h-[32px] px-1"
              >
                <span>{tDash('approvalQueues')} ({totalQueueCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveSheet('pulse')}
              className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer min-h-[32px] px-1"
            >
              <span>{tDash('sheets.pulseTitle', { month: treasury.thisMonthKey })}</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <motion.button
            type="button"
            onClick={() => setActiveSheet('pulse')}
            whileTap={{ scale: 0.96, y: 1.5 }}
            transition={MFS_TAP_SPRING}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('fundHeight')}
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
                {tDash('kpi.membersMonthPct', {
                  count: treasury.contributingMembersCount,
                  pct: thisMonthContribPct,
                })}
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            whileTap={{ scale: 0.96, y: 1.5 }}
            transition={MFS_TAP_SPRING}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('kpi.currentBalance')}
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
                {tDash('kpi.liquidReserveTapLedger')}
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => setActiveSheet('borrowers')}
            whileTap={{ scale: 0.96, y: 1.5 }}
            transition={MFS_TAP_SPRING}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('kpi.currentQardHasan')}
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
                {tDash('kpi.activeBorrowersCount', {
                  count: treasury.activeBorrowers.length,
                  label:
                    treasury.activeBorrowers.length === 1
                      ? tDash('kpi.borrowerSingular')
                      : tDash('kpi.borrowerPlural'),
                })}
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => (isAdmin ? setActiveSheet('borrowers') : onNavigate('quard-hasan'))}
            whileTap={{ scale: 0.96, y: 1.5 }}
            transition={MFS_TAP_SPRING}
            className="min-h-[96px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('kpi.repaymentsReturned')}
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
                  ? tDash('kpi.restoredViewSchedule', { pct: repaymentRestorePct })
                  : tDash('kpi.revolvingPrincipalViewSchedule')}
              </div>
            </div>
          </motion.button>
        </div>
      </section>

      {/* 4. Core Services Grid */}
      <section aria-label={tDash('mobile.services')} className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          {tDash('mobile.services')}
        </h2>

        <div className="mfs-icon-grid-3">
          {coreActionTiles.map((tile) => (
            <MfsGridTileButton key={tile.id} tile={tile} labelWeight="semibold" />
          ))}
        </div>
      </section>

      {/* 5. All Functional Pages (4-col grid ensuring 100% of app pages have iconic buttons on Home) */}
      <section aria-label={tDash('mobile.allPagesAccount')} className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-0.5">
          {isAdmin
            ? tDash('mobile.governanceLedgerPages')
            : isManager
              ? tDash('mobile.managementLedgerPages')
              : tDash('mobile.allPagesAccount')}
        </h2>

        <div className="mfs-icon-grid-4">
          {functionalPageTiles.map((tile) => (
            <MfsGridTileButton key={tile.id} tile={tile} compact singleLine />
          ))}
        </div>
      </section>

      {/* 6. Recent Activity Tap-List */}
      <section aria-label={tDash('mobile.recentActivity')} className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {tDash('mobile.recentActivity')}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('transaction-history')}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer min-h-[44px] px-1.5"
          >
            <span>{tDash('mobile.seeAll')}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {recentActivity.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {tDash('mobile.noRecentActivity')}
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

      {/* ==================== DRILL-DOWN BOTTOM SHEETS ==================== */}

      {/* Sheet 1: Monthly Treasury Pulse & Clearance */}
      <MobileBottomSheet
        open={activeSheet === 'pulse'}
        onClose={() => setActiveSheet(null)}
        title={tDash('sheets.pulseTitle', { month: treasury.thisMonthKey })}
        subtitle={tDash('sheets.pulseSubtitle', {
          cleared: treasury.thisMonthClearanceClearedMembers,
          total: treasury.thisMonthClearanceTotalMembers,
          date: formatShortDate(config.maturityDate),
        })}
      >
        <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {phase === 'qard_hasan'
              ? tDash('phase1Title')
              : tDash('phase2Title')}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {config.halalInvestmentThesis}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>{tDash('sheets.thisMonthContribution')}</span>
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
              {tDash('sheets.thisMonthDue')}
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-violet-700 dark:text-violet-400">
              {formatMoney(treasury.thisMonthDueRemaining, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthDueTarget, ccy)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {treasury.thisMonthDueRemaining === 0
                ? tDash('sheets.allTargetsCollected')
                : tDash('sheets.pendingCollectionCycle')}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-1.5">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {tDash('sheets.thisMonthHasanInstallment')}
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthHasanInstallmentCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthHasanInstallmentNeed, ccy)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {treasury.thisMonthHasanInstallmentNeed > 0
                ? tDash('sheets.installmentsDueCollected')
                : tDash('sheets.noInstallmentsDue')}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>{tDash('sheets.thisMonthClearance')}</span>
              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.thisMonthClearanceClearedMembers}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {treasury.thisMonthClearanceTotalMembers} {tDash('sheets.clearedSuffix')}
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
              {tDash('sheets.thisMonthMemberClearance')}
            </h3>
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
              {treasury.thisMonthClearanceClearedMembers}/{treasury.thisMonthClearanceTotalMembers}
            </span>
          </div>

          {treasury.thisMonthMemberClearance.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {tDash('sheets.noActiveContributors')}
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
                      ? tDash('sheets.clearedBadge')
                      : entry.status === 'pending'
                        ? tDash('sheets.pendingReviewBadge')
                        : tDash('sheets.dueBadge')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </MobileBottomSheet>

      {/* Sheet 2: Active Governance & Approval Queues */}
      <MobileBottomSheet
        open={activeSheet === 'queues'}
        onClose={() => setActiveSheet(null)}
        title={tDash('sheets.queuesTitle')}
        subtitle={tDash('sheets.queuesSubtitle')}
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
                  {tDash('sheets.pendingLoanReviews')}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff
                    ? pendingGuarantorLoansCount > 0
                      ? tDash('sheets.initiateBallotGuarantor', { count: pendingGuarantorLoansCount })
                      : tDash('sheets.initiateBallotInDesk', {
                          desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                        })
                    : tDash('sheets.inspectLoanQueue')}
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
                  {tDash('sheets.openTwoThirdsBallots')}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {tDash('sheets.castSecretVote')}
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
                  {tDash('sheets.pendingDeposits')}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff
                    ? tDash('sheets.reviewInDesk', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tDash('sheets.viewContribStatus')}
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
                  {tDash('sheets.awaitingDisbursement')}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff
                    ? tDash('sheets.confirmPayoutInDesk', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tDash('sheets.multiSigRelease')}
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
                  {tDash('sheets.pendingRepayments')}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {isStaff
                    ? tDash('sheets.verifyInstallmentsInDesk', {
                        desk: isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
                      })
                    : tDash('sheets.inspectInstallmentReceipts')}
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
        title={tDash('sheets.activeBorrowersTitle')}
        subtitle={tDash('sheets.activeBorrowersSubtitle', {
          count: treasury.activeBorrowers.length,
          amount: formatMoney(treasury.totalLoansDisbursed, ccy),
        })}
      >
        {treasury.activeBorrowers.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            {tDash('sheets.noActiveBorrowers')}
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
                    {b.nextDueDate ? ` · ${tDash('sheets.duePrefix', { date: formatShortDate(b.nextDueDate) })}` : ''}
                    {b.missedInstallmentsCount > 0 && (
                      <span className="text-red-600 dark:text-red-400 ml-1">
                        · {tDash('sheets.overdueCount', { count: b.missedInstallmentsCount })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {formatMoney(b.dueAmount, ccy)}{' '}
                    <span className="text-[11px] font-normal text-amber-700 dark:text-amber-400">
                      {tDash('sheets.dueLower')}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    {tDash('sheets.repaidAmount', { amount: formatMoney(b.totalRepaid, ccy) })}
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
          <span>{isAdmin ? tDash('alerts.openVoting') : tDash('alerts.openQardHasan')}</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </MobileBottomSheet>

      {/* Sheet 4: Member Standing / Admin Oversight */}
      <MobileBottomSheet
        open={activeSheet === 'standing'}
        onClose={() => setActiveSheet(null)}
        title={isAdmin ? tDash('sheets.adminStandingTitle') : tDash('sheets.memberStandingTitle')}
        subtitle={`${user.name} · ${user.memberCode}`}
      >
        {isAdmin ? (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3.5 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{tDash('sheets.pendingProfileEdits')}</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.pendingProfileRequestsCount}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{tDash('sheets.openDecisionPolls')}</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.openDecisionPollsCount}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">{tDash('sheets.upcomingMeetings')}</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {treasury.upcomingMeetingsCount}
                </dd>
              </div>
            </dl>

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
                <span>{tNav('usersAndRoles')}</span>
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
                <span>{tNav('siteSettings')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3.5 text-xs">
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">{tDash('sheets.yourApprovedDeposits')}</dt>
                <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(personal.totalContributed, ccy)}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-2">
                <dt className="text-slate-600 dark:text-slate-400">
                  {personal.activeLoanBalance > 0
                    ? tDash('sheets.activeLoanBalance')
                    : myActiveOrPendingLoan
                      ? tDash('sheets.pendingQardRequest')
                      : tDash('sheets.activeLoanBalance')}
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
                <dt className="text-slate-600 dark:text-slate-400">{tDash('sheets.annualLoanQuota')}</dt>
                <dd className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {tDash('sheets.usedCount', {
                    used: personal.eligibility.loansUsedThisYear,
                    max: personal.eligibility.maxLoansPerYear,
                  })}
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {personal.eligibility.eligible ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {tDash('sheets.eligibleForLoan')}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">
                      {tDash('sheets.notEligibleForLoan')}
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
                  <span>{tNav('requestLoan')}</span>
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
                <span>{tDash('sheets.openMyAmanah')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </MobileBottomSheet>
    </div>
  );
}
