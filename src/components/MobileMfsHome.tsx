'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type {
  Contribution,
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  MobileMemberOverviewIconsConfig,
  MobileMemberTileId,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatBillingMonth, formatMoney, formatShortDate } from '../utils/format.ts';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import {
  MOBILE_MEMBER_TILE_MAP,
  areMobileOverviewConfigsEqual,
  resolveMemberMobileOverviewIcons,
} from '../utils/mobileOverviewTiles.ts';
import { useBodyScrollLock } from '../utils/modalLock.ts';
import { useCoopSession } from './AppProviders.tsx';
import type { ManagerDeskTab } from './ManagerDeskView.tsx';
import { MobileDashboardBanner } from './MobileDashboardBanner.tsx';
import {
  MOBILE_MEMBER_TILE_ICONS,
  MobileOverviewIconEditor,
} from './MobileOverviewIconCustomizer.tsx';
import {
  AboutSecurityIcon,
  ActiveBorrowersIcon,
  AlertNoticeIcon,
  ClockQueueIcon,
  ContributionIcon,
  MemberRegistryIcon,
  MembersIcon,
  MonthlyPulseIcon,
  QardHasanIcon,
  SiteSettingsIcon,
  VerifiedCheckIcon,
  VotingIcon,
  type TileIconComponent,
} from './MobileTileIcons.tsx';
import { StatusText } from './StatusText.tsx';

export interface MfsIconTile {
  id: string;
  label: string;
  Icon: TileIconComponent;
  iconBgClass: string;
  iconColorClass: string;
  badge?: number;
  badgeBlink?: 'amber' | 'red';
  onClick: () => void;
}

type MobileSheetId =
  | 'pulse'
  | 'queues'
  | 'borrowers'
  | 'customize-icons'
  | null;

interface MobileMfsHomeProps {
  overview: DashboardOverview | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  user: PublicUser;
  loading: boolean;
  pendingBadgeCount: (sectionId: DashboardSectionId) => number;
  hasUnreadPriorityNotification?: boolean;
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
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
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
            className="relative z-10 w-full max-h-[88dvh] bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-t-3xl border-t border-slate-200/90 dark:border-slate-800/90 ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-2xl flex flex-col overflow-hidden"
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

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-4 pb-6 space-y-4">
              {children}
            </div>

            {footer && (
              <div className="px-4 py-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
                {footer}
              </div>
            )}
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

const TILE_SURFACE_CLASS =
  'border-slate-200/85 dark:border-[#163948] bg-white/95 dark:bg-[#02202D]/95 hover:border-emerald-300/80 dark:hover:border-[#00ED64]/45';

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
      className={`group relative ${
        compact ? 'mfs-tile-compact gap-1.5 rounded-2xl' : 'mfs-tile gap-2 rounded-2xl'
      } border ring-1 ring-inset ring-white/95 dark:ring-white/[0.05] shadow-[0_3px_12px_-6px_rgba(15,23,42,0.09)] dark:shadow-[0_6px_18px_-8px_rgba(0,0,0,0.52)] hover:shadow-[0_8px_18px_-8px_rgba(15,23,42,0.14)] flex flex-col items-center justify-center transition-all cursor-pointer ${TILE_SURFACE_CLASS}`}
    >
      {typeof tile.badge === 'number' && tile.badge > 0 && (
        <span className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center">
          {tile.badgeBlink && (
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-full pointer-events-none ${
                tile.badgeBlink === 'red'
                  ? 'bg-red-500 amanah-blink-ring-urgent'
                  : 'bg-amber-500 amanah-blink-ring'
              }`}
            />
          )}
          <span
            className={`relative min-w-[17px] h-[17px] px-1 rounded-full ring-2 ring-white dark:ring-slate-900 font-mono text-[9.5px] font-bold tabular-nums flex items-center justify-center shadow-xs ${
              tile.badgeBlink === 'red'
                ? 'bg-red-600 dark:bg-red-500 text-white'
                : 'bg-amber-600 text-white'
            }`}
          >
            {tile.badge > 99 ? '99+' : tile.badge}
          </span>
        </span>
      )}

      <span
        className={`mfs-tile-icon-box border flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5 ${tile.iconBgClass}`}
      >
        <Icon
          className={`mfs-tile-icon ${tile.iconColorClass}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>

      <span
        className={`mfs-tile-label w-full px-0.5 ${
          labelWeight === 'semibold'
            ? 'font-semibold text-slate-800 dark:text-slate-100 leading-snug'
            : 'font-medium text-slate-700 dark:text-slate-200 leading-tight'
        } text-center ${singleLine ? 'line-clamp-1' : 'line-clamp-2'}`}
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
  hasUnreadPriorityNotification = false,
  onNavigate,
  onOpenManagerDeskTab,
  onOpenLoanModal,
  onViewMemberProfile,
}: MobileMfsHomeProps) {
  const router = useRouter();
  const { setUser } = useCoopSession();
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const tDash = useTranslations('Dashboard');
  const tIconEditor = useTranslations('MobileIconEditor');
  const [activeSheet, setActiveSheet] = useState<MobileSheetId>(null);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [iconDraft, setIconDraft] = useState<MobileMemberOverviewIconsConfig>(() =>
    resolveMemberMobileOverviewIcons({
      userIcons: user.mobileOverviewIcons,
      coopIcons: overview?.config.mobileMemberOverviewIcons,
      isManager: user.role === 'manager',
      isAdmin: user.role === 'admin',
    })
  );
  const [iconsSaving, setIconsSaving] = useState(false);
  const [iconsError, setIconsError] = useState<string | null>(null);

  const openPublicRoute = (path: string) => {
    setMobileBrowseMode(true);
    router.push(path);
  };
  const openCharterPage = () => openPublicRoute('/rules');

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
        <Skeleton height={118} borderRadius={16} />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 2 }).map((_, idx) => (
            <Skeleton key={idx} height={92} borderRadius={16} />
          ))}
        </div>
        <div className="mfs-icon-grid-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} height={84} borderRadius={16} />
          ))}
        </div>
        <Skeleton height={44} borderRadius={16} />
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

  const resolvedMemberIcons = resolveMemberMobileOverviewIcons({
    userIcons: user.mobileOverviewIcons,
    coopIcons: config.mobileMemberOverviewIcons,
    isManager,
    isAdmin,
  });

  const coopOrBuiltinDefaultIcons = resolveMemberMobileOverviewIcons({
    userIcons: null,
    coopIcons: config.mobileMemberOverviewIcons,
    isManager,
    isAdmin,
  });

  const openCustomizeSheet = () => {
    setIconDraft(resolvedMemberIcons);
    setIconsError(null);
    setActiveSheet('customize-icons');
  };

  const handleSaveMemberIcons = async () => {
    setIconsSaving(true);
    setIconsError(null);
    try {
      const res = await api.updatePreferences({ mobileOverviewIcons: iconDraft });
      setUser(res.user);
      setActiveSheet(null);
    } catch (err) {
      setIconsError(
        err instanceof Error ? err.message : tDash('sheets.saveIconsError')
      );
    } finally {
      setIconsSaving(false);
    }
  };

  const handleResetMemberIcons = async () => {
    if (!user.mobileOverviewIcons) {
      setIconDraft(coopOrBuiltinDefaultIcons);
      return;
    }
    setIconsSaving(true);
    setIconsError(null);
    try {
      const res = await api.updatePreferences({ mobileOverviewIcons: null });
      setUser(res.user);
      setIconDraft(coopOrBuiltinDefaultIcons);
      setActiveSheet(null);
    } catch (err) {
      setIconsError(
        err instanceof Error ? err.message : tDash('sheets.saveIconsError')
      );
    } finally {
      setIconsSaving(false);
    }
  };

  const notifBadgeCount = pendingBadgeCount('notification');

  const makeTile = (
    id: MobileMemberTileId,
    label: string,
    onClick: () => void,
    extras?: { badge?: number; badgeBlink?: 'amber' | 'red' }
  ): MfsIconTile => {
    const meta = MOBILE_MEMBER_TILE_MAP[id];
    return {
      id,
      label,
      Icon: MOBILE_MEMBER_TILE_ICONS[id],
      iconBgClass: meta.iconBgClass,
      iconColorClass: meta.iconColorClass,
      badge: extras?.badge,
      badgeBlink: extras?.badgeBlink,
      onClick,
    };
  };

  const memberTileById: Record<MobileMemberTileId, MfsIconTile> = {
    'pay-monthly-contribution': makeTile(
      'pay-monthly-contribution',
      tNav('contributions'),
      () => onNavigate('monthly-contribution'),
      { badge: isManager ? pendingBadgeCount('monthly-contribution') : 0 }
    ),
    'quard-hasan': makeTile('quard-hasan', tNav('qardHasan'), () =>
      onNavigate('quard-hasan')
    ),
    'request-loan': makeTile('request-loan', tNav('requestLoan'), () =>
      onOpenLoanModal ? onOpenLoanModal() : onNavigate('quard-hasan')
    ),
    'my-amanah': makeTile('my-amanah', tNav('myAmanah'), () => onNavigate('my-amanah')),
    members: makeTile('members', tNav('members'), () => onNavigate('members')),
    community: makeTile(
      'community',
      tNav('community'),
      () => onNavigate('community'),
      { badge: pendingBadgeCount('community') }
    ),
    'balance-sheet': makeTile('balance-sheet', tNav('balanceSheet'), () =>
      onNavigate('balance-sheet')
    ),
    'transaction-history': makeTile('transaction-history', tNav('transactions'), () =>
      onNavigate('transaction-history')
    ),
    statistics: makeTile('statistics', tNav('statistics'), () => onNavigate('statistics')),
    'manager-cycle': makeTile('manager-cycle', tNav('managerCycle'), () =>
      onNavigate('manager-cycle')
    ),
    voting: makeTile('voting', tNav('voting'), () => onNavigate('ballot'), {
      badge: pendingBadgeCount('ballot'),
    }),
    'monthly-pulse': makeTile('monthly-pulse', tIconEditor('tiles.monthlyPulse'), () =>
      setActiveSheet('pulse')
    ),
    'active-borrowers': makeTile(
      'active-borrowers',
      tIconEditor('tiles.activeBorrowers'),
      () => setActiveSheet('borrowers'),
      { badge: treasury.activeBorrowers.length }
    ),
    'approval-queues': makeTile(
      'approval-queues',
      tIconEditor('tiles.approvalQueues'),
      () => setActiveSheet('queues'),
      { badge: totalQueueCount }
    ),
    charter: makeTile('charter', tNav('charter'), openCharterPage),
    'how-it-works': makeTile('how-it-works', tNav('howItWorks'), () =>
      openPublicRoute('/how-it-works')
    ),
    about: makeTile('about', tNav('about'), () => openPublicRoute('/about')),
    faq: makeTile('faq', tNav('faq'), () => openPublicRoute('/#faq')),
    'public-website': makeTile('public-website', tNav('publicWebsite'), () =>
      openPublicRoute('/')
    ),
    notification: makeTile(
      'notification',
      tNav('notifications'),
      () => onNavigate('notification'),
      {
        badge: notifBadgeCount,
        badgeBlink:
          notifBadgeCount > 0
            ? hasUnreadPriorityNotification
              ? 'red'
              : 'amber'
            : undefined,
      }
    ),
    'my-profile': makeTile('my-profile', tNav('profile'), () =>
      onNavigate('my-profile')
    ),
    'manager-desk': makeTile(
      'manager-desk',
      isAdmin ? tNav('governanceDesk') : tNav('managerDesk'),
      () => onNavigate('manager-desk'),
      { badge: pendingBadgeCount('manager-desk') }
    ),
    'member-registry': makeTile(
      'member-registry',
      isAdmin ? tNav('usersAndRoles') : tNav('memberRegistry'),
      () => onNavigate('member-registry'),
      { badge: pendingBadgeCount('member-registry') }
    ),
    'manager-contributions': makeTile(
      'manager-contributions',
      tIconEditor('tiles.managerContributions'),
      () =>
        onOpenManagerDeskTab
          ? onOpenManagerDeskTab('contributions')
          : onNavigate('manager-desk'),
      { badge: treasury.pendingContributionsCount }
    ),
    'manager-loans': makeTile(
      'manager-loans',
      tIconEditor('tiles.managerLoans'),
      () =>
        onOpenManagerDeskTab
          ? onOpenManagerDeskTab('qard-hasan')
          : onNavigate('manager-desk'),
      { badge: treasury.pendingLoansReviewCount + treasury.pendingDisbursementsCount }
    ),
    'manager-installments': makeTile(
      'manager-installments',
      tIconEditor('tiles.managerInstallments'),
      () =>
        onOpenManagerDeskTab
          ? onOpenManagerDeskTab('installments')
          : onNavigate('manager-desk'),
      { badge: treasury.pendingRepaymentsCount }
    ),
    'site-settings': makeTile('site-settings', tNav('siteSettings'), () =>
      onNavigate('site-settings'),
      { badge: pendingBadgeCount('site-settings') }
    ),
    'site-activity': makeTile('site-activity', tNav('siteActivity'), () =>
      onNavigate('site-activity')
    ),
  };

  // 1. Primary Services (4-col bKash-style primary icons)
  const coreActionTiles: MfsIconTile[] = resolvedMemberIcons.services
    .map((id) => memberTileById[id])
    .filter(Boolean);

  // 2. More Section (4-col iconic grid)
  const functionalPageTiles: MfsIconTile[] = resolvedMemberIcons.more
    .map((id) => memberTileById[id])
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Sliding Cooperative Highlights & Intelligence Banner */}
      <MobileDashboardBanner
        config={config}
        treasury={treasury}
        personal={personal}
        phase={phase}
        daysUntilMaturity={daysUntilMaturity}
        user={user}
        totalQueueCount={totalQueueCount}
        thisMonthContribPct={thisMonthContribPct}
        loanProgress={loanProgress}
        onOpenSheet={(sheet) => setActiveSheet(sheet)}
        onNavigate={onNavigate}
      />

      {/* 1. Actionable Alerts & Active Loan Stage Tracker */}
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
                <span className="w-9 h-9 rounded-xl border border-amber-200/90 dark:border-[#FFC010]/38 bg-gradient-to-br from-amber-50 via-amber-50/90 to-orange-100/85 dark:from-[#2C2812] dark:via-[#08242E] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                  <MemberRegistryIcon className="w-[18px] h-[18px] text-amber-700 mdb-icon-gold" strokeWidth={1.7} />
                </span>
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
                <span className="w-9 h-9 rounded-xl border border-red-200/90 dark:border-[#FB7185]/38 bg-gradient-to-br from-rose-50 to-red-100/90 dark:from-[#331826] dark:via-[#07222D] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                  <AlertNoticeIcon className="w-[18px] h-[18px] text-red-600 mdb-icon-rose" strokeWidth={1.7} />
                </span>
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
                <span className="w-9 h-9 rounded-xl border border-amber-200/90 dark:border-[#FFC010]/38 bg-gradient-to-br from-amber-50 via-amber-50/90 to-orange-100/85 dark:from-[#2C2812] dark:via-[#08242E] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                  <VerifiedCheckIcon className="w-[18px] h-[18px] text-amber-700 mdb-icon-gold" strokeWidth={1.7} />
                </span>
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
                    <QardHasanIcon className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
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
            className="min-h-[96px] p-3 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-[0_4px_16px_-10px_rgba(15,23,42,0.1)] dark:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.45)] active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('fundHeight')}
              </span>
              <span className="w-10 h-10 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_3px_10px_-4px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_14px_-4px_rgba(0,0,0,0.65)] bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/95 dark:from-[#053129] dark:via-[#02232D] dark:to-[#001822] border border-emerald-200/90 dark:border-[#00ED64]/35 flex items-center justify-center shrink-0">
                <ActiveBorrowersIcon className="w-[19px] h-[19px] text-emerald-700 mdb-icon-emerald" strokeWidth={1.7} />
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
            className="min-h-[96px] p-3 rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-[0_4px_16px_-10px_rgba(15,23,42,0.1)] dark:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.45)] active:bg-slate-50 dark:active:bg-slate-800/90 active:shadow-inner flex flex-col justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {tDash('kpi.currentBalance')}
              </span>
              <span className="w-10 h-10 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_3px_10px_-4px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_14px_-4px_rgba(0,0,0,0.65)] bg-gradient-to-br from-indigo-50 via-sky-50/75 to-indigo-100/90 dark:from-[#0B2A47] dark:via-[#042230] dark:to-[#001822] border border-indigo-200/90 dark:border-[#4DA3FF]/38 flex items-center justify-center shrink-0">
                <AboutSecurityIcon className="w-[19px] h-[19px] text-indigo-700 mdb-icon-sapphire" strokeWidth={1.7} />
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
        </div>
      </section>

      {/* 4. Core Services Grid */}
      <section aria-label={tDash('mobile.services')} className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {tDash('mobile.services')}
          </h2>
          <button
            type="button"
            onClick={openCustomizeSheet}
            aria-label={tDash('mobile.customizeIconsAria')}
            title={tDash('mobile.customizeIconsAria')}
            className="w-9 h-9 rounded-xl border border-slate-200/90 dark:border-[#1E4656] bg-white/95 dark:bg-[#052735] hover:bg-emerald-50 dark:hover:bg-[#073432] hover:border-emerald-300 dark:hover:border-[#00ED64]/45 text-slate-700 mdb-icon-slate hover:text-emerald-700 inline-flex items-center justify-center cursor-pointer transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_6px_-3px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_4px_12px_-4px_rgba(0,0,0,0.6)] shrink-0"
          >
            <SiteSettingsIcon className="w-[17px] h-[17px]" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {coreActionTiles.length === 0 ? (
          <button
            type="button"
            onClick={openCustomizeSheet}
            className="w-full min-h-[56px] p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-300 text-center hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
          >
            {tDash('mobile.noServicesSelected')}
          </button>
        ) : (
          <div className="mfs-icon-grid-4">
            {coreActionTiles.map((tile) => (
              <MfsGridTileButton key={tile.id} tile={tile} labelWeight="semibold" />
            ))}
          </div>
        )}
      </section>

      {/* 5. More Section (4-col iconic grid, primarily collapsed) */}
      {functionalPageTiles.length > 0 && (() => {
        const morePendingCount = functionalPageTiles.reduce(
          (sum, tile) => sum + (typeof tile.badge === 'number' && tile.badge > 0 ? tile.badge : 0),
          0
        );
        const hasUrgentMoreBadge = functionalPageTiles.some(
          (tile) => tile.badgeBlink === 'red' && typeof tile.badge === 'number' && tile.badge > 0
        );

        return (
          <section aria-label={tDash('mobile.more')} className="space-y-2">
            <button
              type="button"
              onClick={() => setMoreExpanded((prev) => !prev)}
              aria-expanded={moreExpanded}
              aria-controls="mfs-more-grid"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.08)] dark:shadow-[0_4px_14px_-8px_rgba(0,0,0,0.4)] hover:bg-slate-50 dark:hover:bg-slate-800/75 active:scale-[0.995] flex items-center justify-between gap-2 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {isAdmin ? tDash('mobile.governanceLedgerPages') : tDash('mobile.more')}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  ({functionalPageTiles.length})
                </span>
                {morePendingCount > 0 && (
                  <span
                    className={`min-w-[18px] h-[18px] px-1.5 rounded-full font-mono text-[10px] font-bold tabular-nums text-white inline-flex items-center justify-center ${
                      hasUrgentMoreBadge
                        ? 'bg-red-600 dark:bg-red-500'
                        : 'bg-amber-600'
                    }`}
                  >
                    {morePendingCount > 99 ? '99+' : morePendingCount}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${
                  moreExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence initial={false}>
              {moreExpanded && (
                <motion.div
                  id="mfs-more-grid"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mfs-icon-grid-4 pt-1">
                    {functionalPageTiles.map((tile) => (
                      <MfsGridTileButton key={tile.id} tile={tile} compact singleLine />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })()}

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

        <div className="rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/80 dark:ring-white/5 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.45)] divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
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
                    className={`w-10 h-10 rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_3px_8px_-4px_rgba(15,23,42,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_12px_-4px_rgba(0,0,0,0.6)] flex items-center justify-center shrink-0 ${
                      item.kind === 'contribution'
                        ? 'bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/95 dark:from-[#053129] dark:via-[#02232D] dark:to-[#001822] border-emerald-200/90 dark:border-[#00ED64]/35 text-emerald-700 mdb-icon-emerald'
                        : 'bg-gradient-to-br from-amber-50 via-amber-50/90 to-orange-100/85 dark:from-[#2C2812] dark:via-[#08242E] dark:to-[#001822] border-amber-200/90 dark:border-[#FFC010]/38 text-amber-700 mdb-icon-gold'
                    }`}
                  >
                    {item.kind === 'contribution' ? (
                      <ContributionIcon className="w-[19px] h-[19px]" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <QardHasanIcon className="w-[19px] h-[19px]" strokeWidth={1.75} aria-hidden="true" />
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
              <MonthlyPulseIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatMoney(treasury.thisMonthContributionCollected, ccy)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {formatMoney(treasury.thisMonthContributionTarget, ccy)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
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
              <MembersIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {treasury.thisMonthClearanceClearedMembers}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {treasury.thisMonthClearanceTotalMembers} {tDash('sheets.clearedSuffix')}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
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
              <span className="w-10 h-10 rounded-xl border border-amber-200/90 dark:border-[#FFC010]/38 bg-gradient-to-br from-amber-50 via-amber-50/90 to-orange-100/85 dark:from-[#2C2812] dark:via-[#08242E] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                <ClockQueueIcon className="w-[19px] h-[19px] text-amber-700 mdb-icon-gold" strokeWidth={1.7} />
              </span>
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
            className="w-full min-h-[68px] p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/25 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl border border-indigo-200/90 dark:border-[#4DA3FF]/38 bg-gradient-to-br from-indigo-50 via-sky-50/75 to-indigo-100/90 dark:from-[#0B2A47] dark:via-[#042230] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                <VotingIcon className="w-[19px] h-[19px] text-indigo-700 mdb-icon-sapphire" strokeWidth={1.7} />
              </span>
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
              <span className="w-10 h-10 rounded-xl border border-emerald-200/90 dark:border-[#00ED64]/35 bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/95 dark:from-[#053129] dark:via-[#02232D] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                <ContributionIcon className="w-[19px] h-[19px] text-emerald-700 mdb-icon-emerald" strokeWidth={1.7} />
              </span>
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
              <span className="w-10 h-10 rounded-xl border border-teal-200/90 dark:border-[#18E299]/35 bg-gradient-to-br from-teal-50 via-cyan-50/80 to-teal-100/95 dark:from-[#063235] dark:via-[#02232D] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                <AboutSecurityIcon className="w-[19px] h-[19px] text-teal-700 mdb-icon-teal" strokeWidth={1.7} />
              </span>
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
              <span className="w-10 h-10 rounded-xl border border-emerald-200/90 dark:border-[#00ED64]/35 bg-gradient-to-br from-emerald-50 via-emerald-50/90 to-emerald-100/95 dark:from-[#053129] dark:via-[#02232D] dark:to-[#001822] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] flex items-center justify-center shrink-0">
                <VerifiedCheckIcon className="w-[19px] h-[19px] text-emerald-700 mdb-icon-emerald" strokeWidth={1.7} />
              </span>
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

      {/* Sheet 4: Customize Mobile Overview Icons */}
      <MobileBottomSheet
        open={activeSheet === 'customize-icons'}
        onClose={() => {
          if (!iconsSaving) setActiveSheet(null);
        }}
        title={tDash('sheets.customizeTitle')}
        subtitle={
          user.mobileOverviewIcons
            ? tDash('sheets.customizeSubtitlePersonal')
            : tDash('sheets.customizeSubtitleDefault')
        }
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={iconsSaving}
              onClick={() => setActiveSheet(null)}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              disabled={iconsSaving}
              onClick={() => void handleSaveMemberIcons()}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {iconsSaving ? tDash('sheets.savingIcons') : tDash('sheets.saveIconsBtn')}
            </button>
          </div>
        }
      >
        {iconsError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/35 px-3 py-2.5 text-xs text-red-800 dark:text-red-200 flex items-center gap-2"
          >
            <AlertNoticeIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{iconsError}</span>
          </div>
        )}

        <MobileOverviewIconEditor
          value={iconDraft}
          onChange={setIconDraft}
          allowManagerTiles={isManager || isAdmin}
          allowAdminTiles={isAdmin}
          onReset={() => void handleResetMemberIcons()}
          disableReset={
            iconsSaving ||
            (!user.mobileOverviewIcons &&
              areMobileOverviewConfigsEqual(iconDraft, coopOrBuiltinDefaultIcons))
          }
          resetLabel={tDash('sheets.resetDefaultIcons')}
        />
      </MobileBottomSheet>
    </div>
  );
}
