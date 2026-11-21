'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  ShieldCheck,
  TrendingUp,
  Vote,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type {
  DashboardOverview,
  DashboardSectionId,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';

const INVESTMENT_IMAGE_URL =
  'https://i.ibb.co.com/21vdb554/coop-halal-investment.jpg';

type BannerHue = 'emerald' | 'teal' | 'amber' | 'violet' | 'sky';

interface BannerSlide {
  id: string;
  hue: BannerHue;
  kicker: string;
  kickerClass: string;
  title: string;
  isNumericTitle?: boolean;
  titleSuffix?: string;
  subtitle: string;
  isProseSubtitle?: boolean;
  visual:
    | { kind: 'brand' }
    | { kind: 'investment' }
    | { kind: 'ring'; pct: number; strokeClass: string; textClass: string }
    | { kind: 'icon'; Icon: typeof Vote; boxClass: string; iconClass: string };
  onClick: () => void;
}

interface MobileDashboardBannerProps {
  config: DashboardOverview['config'];
  treasury: DashboardOverview['treasury'];
  personal: DashboardOverview['personal'];
  phase: DashboardOverview['phase'];
  daysUntilMaturity: number;
  user: PublicUser;
  totalQueueCount: number;
  thisMonthContribPct: number;
  loanProgress: {
    loan: LoanRequest;
    progressPct: number;
    stageCaption: string;
  } | null;
  onOpenSheet: (sheet: 'pulse' | 'queues' | 'borrowers') => void;
  onNavigate: (section: DashboardSectionId) => void;
}

const CARD_SURFACE_CLASS: Record<BannerHue, string> = {
  emerald: 'amanah-card-emerald',
  teal: 'amanah-card-teal',
  amber: 'amanah-card-amber',
  violet: 'amanah-card-violet',
  sky: 'amanah-card-sky',
};

const ACTIVE_BAR_CLASS: Record<BannerHue, string> = {
  emerald: 'bg-emerald-600 dark:bg-emerald-400',
  teal: 'bg-teal-600 dark:bg-teal-400',
  amber: 'bg-amber-600 dark:bg-amber-400',
  violet: 'bg-violet-600 dark:bg-violet-400',
  sky: 'bg-sky-600 dark:bg-sky-400',
};

const CHEVRON_CLASS: Record<BannerHue, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-400',
  teal: 'text-teal-700 dark:text-teal-400',
  amber: 'text-amber-700 dark:text-amber-400',
  violet: 'text-violet-700 dark:text-violet-400',
  sky: 'text-sky-700 dark:text-sky-400',
};

const CORNER_GLOW_CLASS: Record<BannerHue, string> = {
  emerald: 'from-emerald-400/18 via-teal-400/8 to-transparent dark:from-emerald-500/18 dark:via-teal-500/8',
  teal: 'from-teal-400/18 via-cyan-400/8 to-transparent dark:from-teal-500/18 dark:via-cyan-500/8',
  amber: 'from-amber-400/18 via-orange-400/8 to-transparent dark:from-amber-500/18 dark:via-orange-500/8',
  violet: 'from-violet-400/18 via-indigo-400/8 to-transparent dark:from-violet-500/18 dark:via-indigo-500/8',
  sky: 'from-sky-400/18 via-cyan-400/8 to-transparent dark:from-sky-500/18 dark:via-cyan-500/8',
};

function SlideProgressRing({
  pct,
  strokeClass,
  textClass,
}: {
  pct: number;
  strokeClass: string;
  textClass: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative w-12 h-12 sm:w-[52px] sm:h-[52px] flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 48 48"
        className="w-full h-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-slate-200/80 dark:stroke-slate-700/70"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-500 ease-out ${strokeClass}`}
        />
      </svg>
      <span
        className={`absolute font-mono text-[11px] font-bold tabular-nums tracking-tight ${textClass}`}
      >
        {clamped}%
      </span>
    </div>
  );
}

export function MobileDashboardBanner({
  config,
  treasury,
  personal,
  phase,
  daysUntilMaturity,
  user,
  totalQueueCount,
  thisMonthContribPct,
  loanProgress,
  onOpenSheet,
  onNavigate,
}: MobileDashboardBannerProps) {
  const tCommon = useTranslations('Common');
  const tDash = useTranslations('Dashboard');
  const tLife = useTranslations('Public.hero.lifecycle');

  const [activeIndex, setActiveIndex] = useState(0);
  const [mouseHovered, setMouseHovered] = useState(false);
  const [touchInteracting, setTouchInteracting] = useState(false);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [investmentImgFailed, setInvestmentImgFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isPageHidden, setIsPageHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hidden : false
  );

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => setIsPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

  const scheduleInteractionResume = (delayMs = 2000) => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
    }
    setTouchInteracting(true);
    resumeTimerRef.current = window.setTimeout(() => {
      setTouchInteracting(false);
      resumeTimerRef.current = null;
    }, delayMs);
  };

  const isAdmin = user.role === 'admin';
  const ccy = config.currency || 'BDT';

  const slides: BannerSlide[] = useMemo(() => {
    const list: BannerSlide[] = [
      {
        id: 'brand-charter',
        hue: 'emerald',
        kicker: phase === 'qard_hasan' ? tDash('phase1Title') : tDash('phase2Title'),
        kickerClass: 'text-emerald-700 dark:text-emerald-400',
        title: config.fundName,
        subtitle: `${tDash('targetMaturity', { date: formatShortDate(config.maturityDate) })} · ${tCommon('daysRemaining', { days: daysUntilMaturity })}`,
        visual: { kind: 'brand' },
        onClick: () => onOpenSheet('pulse'),
      },
      {
        id: 'halal-investment',
        hue: 'teal',
        kicker: tLife('stage2Index'),
        kickerClass: 'text-teal-700 dark:text-teal-400',
        title: tLife('stage2Title'),
        subtitle: config.halalInvestmentThesis || tLife('caption'),
        isProseSubtitle: true,
        visual: { kind: 'investment' },
        onClick: () => onOpenSheet('pulse'),
      },
      {
        id: 'monthly-pulse',
        hue: 'teal',
        kicker: tDash('sheets.pulseTitle', { month: treasury.thisMonthKey }),
        kickerClass: 'text-teal-700 dark:text-teal-400',
        title: formatMoney(treasury.thisMonthContributionCollected, ccy),
        isNumericTitle: true,
        titleSuffix: `/ ${formatMoney(treasury.thisMonthContributionTarget, ccy)}`,
        subtitle: `${tDash('mobile.banner.clearedShort', {
          cleared: treasury.thisMonthClearanceClearedMembers,
          total: treasury.thisMonthClearanceTotalMembers,
        })} · ${tDash('mobile.banner.dueShort', {
          amount: formatMoney(treasury.thisMonthDueRemaining, ccy),
        })}`,
        visual: {
          kind: 'ring',
          pct: thisMonthContribPct,
          strokeClass: 'stroke-teal-600 dark:stroke-teal-400',
          textClass: 'text-teal-800 dark:text-teal-300',
        },
        onClick: () => onOpenSheet('pulse'),
      },
    ];

    if (isAdmin) {
      list.push({
        id: 'admin-queues',
        hue: totalQueueCount > 0 ? 'amber' : 'violet',
        kicker: tDash('mobile.banner.governanceStatus'),
        kickerClass:
          totalQueueCount > 0
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-violet-700 dark:text-violet-400',
        title:
          totalQueueCount > 0
            ? tDash('mobile.banner.pendingApprovalsCount', { count: totalQueueCount })
            : tDash('mobile.banner.allQueuesCleared'),
        subtitle: tDash('mobile.banner.queuesBreakdown', {
          deposits: treasury.pendingContributionsCount,
          loans: treasury.pendingLoansReviewCount + treasury.pendingVotesCount,
          kyc: treasury.pendingMembersCount,
        }),
        visual: {
          kind: 'icon',
          Icon: ClipboardCheck,
          boxClass:
            totalQueueCount > 0
              ? 'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/80 dark:border-amber-400/40'
              : 'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/80 dark:border-violet-400/40',
          iconClass:
            totalQueueCount > 0
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-violet-700 dark:text-violet-300',
        },
        onClick: () =>
          totalQueueCount > 0 ? onOpenSheet('queues') : onNavigate('manager-desk'),
      });
    } else if (personal.dueContributionAmount > 0) {
      list.push({
        id: 'member-due-reminder',
        hue: 'amber',
        kicker: tDash('mobile.banner.monthlyDuesReminder'),
        kickerClass: 'text-amber-700 dark:text-amber-400',
        title: formatMoney(personal.dueContributionAmount, ccy),
        isNumericTitle: true,
        titleSuffix: tDash('mobile.banner.dueNowSuffix'),
        subtitle: tDash('mobile.banner.monthsDeadlineMeta', {
          months: personal.dueContributionMonths,
          date: formatShortDate(personal.nextContributionDeadline),
        }),
        visual: {
          kind: 'icon',
          Icon: CreditCard,
          boxClass:
            'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/80 dark:border-amber-400/40',
          iconClass: 'text-amber-700 dark:text-amber-300',
        },
        onClick: () => onNavigate('monthly-contribution'),
      });
    } else if (loanProgress) {
      list.push({
        id: 'member-loan-progress',
        hue: 'sky',
        kicker: `${tDash('alerts.activeLoanRequest')} · ${loanProgress.loan.id}`,
        kickerClass: 'text-sky-700 dark:text-sky-400',
        title: formatMoney(loanProgress.loan.amount, ccy),
        isNumericTitle: true,
        subtitle: loanProgress.stageCaption,
        visual: {
          kind: 'ring',
          pct: loanProgress.progressPct,
          strokeClass: 'stroke-sky-600 dark:stroke-sky-400',
          textClass: 'text-sky-800 dark:text-sky-300',
        },
        onClick: () =>
          onNavigate(
            loanProgress.loan.status === 'pending_vote' ? 'ballot' : 'quard-hasan'
          ),
      });
    } else {
      list.push({
        id: 'member-standing',
        hue: 'violet',
        kicker: `${tDash('mobile.banner.yourStanding')} · ${user.memberCode}`,
        kickerClass: 'text-violet-700 dark:text-violet-400',
        title: formatMoney(personal.totalContributed, ccy),
        isNumericTitle: true,
        subtitle: tDash('mobile.banner.depositsVerifiedZeroDue', {
          count: personal.approvedContributionsCount,
        }),
        visual: {
          kind: 'icon',
          Icon: ShieldCheck,
          boxClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/80 dark:border-violet-400/40',
          iconClass: 'text-violet-700 dark:text-violet-300',
        },
        onClick: () => onNavigate('my-amanah'),
      });
    }

    const totalOpenBallots = treasury.pendingVotesCount + treasury.openDecisionPollsCount;
    if (totalOpenBallots > 0) {
      list.push({
        id: 'open-ballots',
        hue: 'violet',
        kicker: tDash('mobile.banner.shuraBallotsOpen'),
        kickerClass: 'text-violet-700 dark:text-violet-400',
        title: tDash('mobile.banner.activeBallotsCount', { count: totalOpenBallots }),
        subtitle: tDash('mobile.banner.ballotsBreakdown', {
          loans: treasury.pendingVotesCount,
          polls: treasury.openDecisionPollsCount,
        }),
        visual: {
          kind: 'icon',
          Icon: Vote,
          boxClass:
            'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/80 dark:border-violet-400/40',
          iconClass: 'text-violet-700 dark:text-violet-300',
        },
        onClick: () => onNavigate('ballot'),
      });
    } else {
      list.push({
        id: 'liquidity-reserve',
        hue: 'sky',
        kicker: `${tDash('kpi.liquidityReserve')} · ${tDash('quickCards.zeroInterest')}`,
        kickerClass: 'text-sky-700 dark:text-sky-400',
        title: formatMoney(treasury.availableLiquidity, ccy),
        isNumericTitle: true,
        subtitle: tDash('mobile.banner.liquidityStatsMeta', {
          borrowers: treasury.activeBorrowers.length,
          members: treasury.activeMembersCount,
        }),
        visual: {
          kind: 'icon',
          Icon: TrendingUp,
          boxClass:
            'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/80 dark:border-sky-400/40',
          iconClass: 'text-sky-700 dark:text-sky-300',
        },
        onClick: () =>
          treasury.activeBorrowers.length > 0
            ? onOpenSheet('borrowers')
            : onNavigate('statistics'),
      });
    }

    return list;
  }, [
    ccy,
    config.fundName,
    config.halalInvestmentThesis,
    config.maturityDate,
    daysUntilMaturity,
    isAdmin,
    loanProgress,
    onNavigate,
    onOpenSheet,
    personal.approvedContributionsCount,
    personal.dueContributionAmount,
    personal.dueContributionMonths,
    personal.nextContributionDeadline,
    personal.totalContributed,
    phase,
    tCommon,
    tDash,
    tLife,
    thisMonthContribPct,
    totalQueueCount,
    treasury.activeBorrowers.length,
    treasury.activeMembersCount,
    treasury.availableLiquidity,
    treasury.openDecisionPollsCount,
    treasury.pendingContributionsCount,
    treasury.pendingLoansReviewCount,
    treasury.pendingMembersCount,
    treasury.pendingVotesCount,
    treasury.thisMonthClearanceClearedMembers,
    treasury.thisMonthClearanceTotalMembers,
    treasury.thisMonthContributionCollected,
    treasury.thisMonthContributionTarget,
    treasury.thisMonthDueRemaining,
    treasury.thisMonthKey,
    user.memberCode,
  ]);

  const safeIndex = activeIndex < slides.length ? activeIndex : 0;
  const currentSlide = slides[safeIndex];
  const isPaused = mouseHovered || touchInteracting || isPageHidden;

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [slides.length, isPaused]);

  const goToSlide = (nextIdx: number) => {
    if (slides.length <= 1) return;
    const normalized = ((nextIdx % slides.length) + slides.length) % slides.length;
    if (normalized === safeIndex) return;
    setActiveIndex(normalized);
    scheduleInteractionResume(3000);
  };

  const stepSlide = (delta: -1 | 1) => {
    if (slides.length <= 1) return;
    setActiveIndex((prev) => (prev + delta + slides.length) % slides.length);
    scheduleInteractionResume(3000);
  };

  return (
    <motion.section
      aria-roledescription="carousel"
      aria-label={tDash('mobile.banner.carouselLabel')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setMouseHovered(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setMouseHovered(false);
      }}
      onTouchStart={(e) => {
        if (resumeTimerRef.current !== null) {
          window.clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = null;
        }
        setTouchInteracting(true);
        const touch = e.touches[0];
        if (touch) {
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
      }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (start && e.changedTouches[0]) {
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            stepSlide(dx < 0 ? 1 : -1);
            return;
          }
        }
        scheduleInteractionResume(1600);
      }}
      onTouchCancel={() => scheduleInteractionResume(1200)}
      className={`relative w-full h-[112px] sm:h-[122px] overflow-hidden rounded-2xl border ring-1 ring-inset ring-white/80 dark:ring-white/10 shadow-[0_6px_22px_-12px_rgba(15,23,42,0.14)] dark:shadow-[0_10px_26px_-12px_rgba(0,0,0,0.52)] transition-colors duration-300 select-none ${CARD_SURFACE_CLASS[currentSlide.hue]}`}
    >
      {/* Subtle geometric accent shimmer */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-gradient-to-br blur-2xl transition-colors duration-300 ${CORNER_GLOW_CLASS[currentSlide.hue]}`}
      />

      {/* Persistent Horizontal Slide Track (Zero Unmount/Remount — Images Load Once) */}
      <motion.div
        animate={{ x: `-${safeIndex * 100}%` }}
        transition={
          reducedMotion
            ? { duration: 0.01 }
            : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
        }
        className="relative z-10 flex w-full h-full will-change-transform"
      >
        {slides.map((slide, idx) => {
          const isActive = idx === safeIndex;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={slide.onClick}
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              aria-label={`${slide.kicker} · ${slide.title}`}
              className={`w-full h-full shrink-0 px-3.5 pt-2 pb-5 sm:px-4 sm:pt-2.5 sm:pb-6 flex items-center justify-between gap-2 text-left cursor-pointer active:opacity-95 transition-opacity ${
                isActive ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {slide.visual.kind === 'brand' ? (
                <>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 leading-snug line-clamp-1">
                      {slide.kicker}
                    </div>
                    <h2 className="text-[15px] sm:text-base font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                      {slide.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums leading-snug">
                      <span className="text-slate-600 dark:text-slate-300">
                        {tDash('targetMaturity', { date: formatShortDate(config.maturityDate) })}
                      </span>
                      <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        {tCommon('daysRemaining', { days: daysUntilMaturity })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!bannerImgFailed && (
                      <div className="w-[126px] sm:w-[164px] h-[76px] sm:h-[88px] overflow-hidden flex items-center justify-center pointer-events-none select-none">
                        <img
                          src="/assets/aistudio/image_5fd8619d.png"
                          alt=""
                          aria-hidden="true"
                          onError={() => setBannerImgFailed(true)}
                          className="w-full h-full object-contain scale-[1.55] mix-blend-multiply dark:invert dark:hue-rotate-180 dark:mix-blend-screen dark:opacity-90"
                        />
                      </div>
                    )}
                    <ChevronRight
                      className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div
                      className={`text-[11px] font-semibold leading-snug truncate ${slide.kickerClass}`}
                    >
                      {slide.kicker}
                    </div>
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <h2
                        className={`text-[15px] sm:text-base font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate ${
                          slide.isNumericTitle ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {slide.title}
                      </h2>
                      {slide.titleSuffix && (
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {slide.titleSuffix}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug truncate ${
                        slide.isProseSubtitle ? '' : 'font-mono tabular-nums'
                      }`}
                    >
                      {slide.subtitle}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {slide.visual.kind === 'investment' &&
                      (!investmentImgFailed ? (
                        <div className="w-[96px] sm:w-[122px] h-[66px] sm:h-[74px] rounded-xl overflow-hidden border border-teal-300/70 dark:border-teal-700/60 bg-slate-100 dark:bg-slate-900 shadow-xs pointer-events-none select-none shrink-0">
                          <img
                            src={INVESTMENT_IMAGE_URL}
                            alt={tLife('caption')}
                            referrerPolicy="no-referrer"
                            onError={() => setInvestmentImgFailed(true)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl border bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/80 dark:border-teal-400/40 flex items-center justify-center shrink-0">
                          <HandCoins className="w-5 h-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                        </span>
                      ))}

                    {slide.visual.kind === 'ring' && (
                      <SlideProgressRing
                        pct={slide.visual.pct}
                        strokeClass={slide.visual.strokeClass}
                        textClass={slide.visual.textClass}
                      />
                    )}

                    {slide.visual.kind === 'icon' && (
                      <span
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border shadow-2xs flex items-center justify-center shrink-0 ${slide.visual.boxClass}`}
                      >
                        <slide.visual.Icon
                          className={`w-5 h-5 ${slide.visual.iconClass}`}
                          aria-hidden="true"
                        />
                      </span>
                    )}

                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${CHEVRON_CLASS[slide.hue]}`}
                      aria-hidden="true"
                    />
                  </div>
                </>
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Compact Bottom Slide Controls (Sibling to Primary Button — Zero Button Nesting) */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3.5 sm:px-4 pb-1.5 flex items-center justify-between gap-2 pointer-events-none">
        <div
          className="flex items-center gap-1 pointer-events-auto"
          role="tablist"
          aria-label={tDash('mobile.banner.carouselLabel')}
        >
          {slides.map((slide, idx) => {
            const active = idx === safeIndex;
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={tDash('mobile.banner.goToSlide', { index: idx + 1 })}
                onClick={() => goToSlide(idx)}
                className="h-5 flex items-center justify-center px-0.5 cursor-pointer focus-visible:rounded-sm"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-200 ${
                    active
                      ? `w-5 ${ACTIVE_BAR_CLASS[currentSlide.hue]}`
                      : 'w-2 bg-slate-400/45 dark:bg-slate-600/70 hover:bg-slate-500/70'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => stepSlide(-1)}
            aria-label={tDash('mobile.banner.prevSlide')}
            className="w-6 h-5 rounded-md flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400 px-0.5">
            {tDash('mobile.banner.slideOf', {
              current: safeIndex + 1,
              total: slides.length,
            })}
          </span>
          <button
            type="button"
            onClick={() => stepSlide(1)}
            aria-label={tDash('mobile.banner.nextSlide')}
            className="w-6 h-5 rounded-md flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
