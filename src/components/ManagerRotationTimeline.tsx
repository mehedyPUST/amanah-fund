'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Crown,
  GitCommitHorizontal,
  ListTree,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
import type { ManagerCycleSchedule, ManagerCycleSlot } from '../types/coop.ts';
import { formatShortDate } from '../utils/format.ts';

type TimelineFilter = 'all' | 'completed' | 'current' | 'upcoming';
type TimelineLayout = 'track' | 'vertical';

interface ManagerRotationTimelineProps {
  schedule: ManagerCycleSchedule;
  currentUserId: string;
  isAdmin: boolean;
  modalBusy?: boolean;
  onViewMemberProfile?: (memberId: string) => void;
  onToggleManagerRole?: (slot: ManagerCycleSlot) => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDateMs(dateStr: string): number {
  const clean = dateStr.trim();
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(clean) ? `${clean}T00:00:00Z` : clean);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type TimingKey =
  | 'endedToday'
  | 'endedDaysAgo'
  | 'finalDayTenure'
  | 'daysRemaining'
  | 'startsToday'
  | 'startsTomorrow'
  | 'startsInDays';

function getRelativeTenureMeta(slot: ManagerCycleSlot, todayUtcMs: number): {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  progressPct: number;
  timingKey: TimingKey;
  timingDays: number;
} {
  const startMs = parseUtcDateMs(slot.startDate);
  const endMs = parseUtcDateMs(slot.endDate);
  const totalDays = Math.max(1, Math.round((endMs - startMs) / MS_PER_DAY) + 1);

  if (slot.status === 'completed') {
    const daysAgo = Math.max(0, Math.round((todayUtcMs - endMs) / MS_PER_DAY));
    return {
      totalDays,
      elapsedDays: totalDays,
      remainingDays: 0,
      progressPct: 100,
      timingKey: daysAgo === 0 ? 'endedToday' : 'endedDaysAgo',
      timingDays: daysAgo,
    };
  }

  if (slot.status === 'current') {
    const elapsedDays = Math.min(
      totalDays,
      Math.max(1, Math.round((todayUtcMs - startMs) / MS_PER_DAY) + 1)
    );
    const remainingDays = Math.max(0, Math.round((endMs - todayUtcMs) / MS_PER_DAY));
    const progressPct = Math.min(100, Math.max(4, Math.round((elapsedDays / totalDays) * 100)));
    return {
      totalDays,
      elapsedDays,
      remainingDays,
      progressPct,
      timingKey: remainingDays === 0 ? 'finalDayTenure' : 'daysRemaining',
      timingDays: remainingDays,
    };
  }

  const daysUntilStart = Math.max(0, Math.round((startMs - todayUtcMs) / MS_PER_DAY));
  return {
    totalDays,
    elapsedDays: 0,
    remainingDays: totalDays,
    progressPct: 0,
    timingKey:
      daysUntilStart === 0
        ? 'startsToday'
        : daysUntilStart === 1
          ? 'startsTomorrow'
          : 'startsInDays',
    timingDays: daysUntilStart,
  };
}

function MemberAvatar({
  name,
  photoUrl,
  status,
}: {
  name: string;
  photoUrl?: string;
  status: ManagerCycleSlot['status'];
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const ringClass =
    status === 'current'
      ? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30'
      : status === 'completed'
        ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
        : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300';

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`w-9 h-9 rounded-lg object-cover shrink-0 ${
          status === 'current' ? 'ring-2 ring-emerald-500/40' : ''
        }`}
      />
    );
  }

  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold font-mono shrink-0 ${ringClass}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

export function ManagerRotationTimeline({
  schedule,
  currentUserId,
  isAdmin,
  modalBusy = false,
  onViewMemberProfile,
  onToggleManagerRole,
}: ManagerRotationTimelineProps) {
  const tCycle = useTranslations('ManagerCycle');
  const t = useTranslations('ManagerCycle.timeline');
  const locale = useLocale() as AppLocale;
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [layout, setLayout] = useState<TimelineLayout>('track');
  const [selectedCycleNumber, setSelectedCycleNumber] = useState<number | null>(
    schedule.currentCycleNumber ?? schedule.slots[0]?.cycleNumber ?? null
  );
  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const currentCardRef = useRef<HTMLDivElement | null>(null);

  function formatTiming(meta: ReturnType<typeof getRelativeTenureMeta>) {
    if (
      meta.timingKey === 'endedDaysAgo' ||
      meta.timingKey === 'daysRemaining' ||
      meta.timingKey === 'startsInDays'
    ) {
      return t(meta.timingKey, { days: meta.timingDays });
    }
    return t(meta.timingKey);
  }

  const todayUtcMs = useMemo(() => getTodayUtcMs(), []);

  const counts = useMemo(() => {
    let completed = 0;
    let current = 0;
    let upcoming = 0;
    for (const slot of schedule.slots) {
      if (slot.status === 'completed') completed += 1;
      else if (slot.status === 'current') current += 1;
      else upcoming += 1;
    }
    return {
      all: schedule.slots.length,
      completed,
      current,
      upcoming,
    };
  }, [schedule.slots]);

  const filteredSlots = useMemo(() => {
    if (filter === 'all') return schedule.slots;
    return schedule.slots.filter((s) => s.status === filter);
  }, [schedule.slots, filter]);

  const currentTenureMeta = useMemo(() => {
    if (!schedule.currentSlot) return null;
    return getRelativeTenureMeta(schedule.currentSlot, todayUtcMs);
  }, [schedule.currentSlot, todayUtcMs]);

  const activeSelectedSlot = useMemo(() => {
    if (filteredSlots.length === 0) return null;
    return (
      filteredSlots.find((s) => s.cycleNumber === selectedCycleNumber) ||
      filteredSlots.find((s) => s.status === 'current') ||
      filteredSlots[0]
    );
  }, [filteredSlots, selectedCycleNumber]);

  function scrollTrackBy(direction: 'left' | 'right') {
    const el = trackScrollRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -320 : 320;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  function jumpToCurrent() {
    if (filter !== 'all' && filter !== 'current') {
      setFilter('all');
    }
    if (schedule.currentSlot) {
      setSelectedCycleNumber(schedule.currentSlot.cycleNumber);
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        currentCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      });
    });
  }

  const filterTabs: Array<{ id: TimelineFilter; label: string; count: number }> = [
    { id: 'all', label: t('allTurns'), count: counts.all },
    { id: 'completed', label: t('historical'), count: counts.completed },
    { id: 'current', label: t('current'), count: counts.current },
    { id: 'upcoming', label: t('future'), count: counts.upcoming },
  ];

  return (
    <section
      aria-label={t('regionAria')}
      className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs space-y-4 sm:space-y-5 transition-all duration-200"
    >
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <GitCommitHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
            {t('heading')}
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full xl:w-auto">
          {/* Segmented Status Filter */}
          <div
            role="tablist"
            aria-label={t('filterAria')}
            className="flex flex-nowrap overflow-x-auto no-scrollbar max-w-full w-full sm:w-fit items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            {filterTabs.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`relative min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="rotation-filter-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                  <span className="relative z-10 font-mono tabular-nums text-[11px] opacity-75">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Layout Toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setLayout('track')}
              className={`relative min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                layout === 'track'
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {layout === 'track' && (
                <motion.span
                  layoutId="rotation-layout-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <Columns3 className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
              <span className="relative z-10">{t('layoutTrack')}</span>
            </button>
            <button
              type="button"
              onClick={() => setLayout('vertical')}
              className={`relative min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                layout === 'vertical'
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {layout === 'vertical' && (
                <motion.span
                  layoutId="rotation-layout-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-xs"
                />
              )}
              <ListTree className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
              <span className="relative z-10">{t('layoutChronology')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Tenure Progress & Legend Strip */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>{t('legendHistorical', { count: counts.completed })}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
            <Crown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('legendCurrentActive', { count: counts.current })}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('legendFutureScheduled', { count: counts.upcoming })}</span>
          </span>
        </div>

        {schedule.currentSlot && currentTenureMeta && (
          <div className="flex-1 max-w-md space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300 truncate">
                {t('activeTurnPrefix')}{' '}
                <strong className="font-semibold text-slate-900 dark:text-white">
                  {schedule.currentSlot.memberName}
                </strong>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-emerald-700 dark:text-emerald-400 shrink-0">
                {t('dayOfTotalPct', {
                  elapsed: currentTenureMeta.elapsedDays,
                  total: currentTenureMeta.totalDays,
                  pct: currentTenureMeta.progressPct,
                })}
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-valuenow={currentTenureMeta.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('progressAria')}
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500"
                style={{ width: `${currentTenureMeta.progressPct}%`, originX: 0 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredSlots.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <CalendarRange className="w-6 h-6 mx-auto text-slate-400" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {filter === 'completed'
                ? t('emptyCompletedTitle')
                : filter === 'current'
                  ? t('emptyCurrentTitle')
                  : filter === 'upcoming'
                    ? t('emptyUpcomingTitle')
                    : t('emptyDefaultTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {filter === 'completed'
                ? t('emptyCompletedDesc')
                : t('emptyDefaultDesc')}
            </p>
          </div>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t('showAllTurns')}
            </button>
          )}
        </div>
      ) : layout === 'track' ? (
        /* HORIZONTAL TRACK TIMELINE */
        <div className="space-y-4">
          {/* Scroll Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('showingCyclesMeta', {
                count: filteredSlots.length,
                months: schedule.cycleMonths,
              })}
            </div>
            <div className="flex items-center gap-1.5">
              {schedule.currentSlot && (
                <button
                  type="button"
                  onClick={jumpToCurrent}
                  className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 cursor-pointer whitespace-nowrap"
                >
                  {t('focusCurrent')}
                </button>
              )}
              <button
                type="button"
                onClick={() => scrollTrackBy('left')}
                aria-label={t('scrollLeftAria')}
                className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollTrackBy('right')}
                aria-label={t('scrollRightAria')}
                className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Chronological Axis */}
          <div
            ref={trackScrollRef}
            className="overflow-x-auto pb-3 scrollbar-subtle scroll-smooth"
          >
            <div className="inline-flex items-stretch min-w-full">
              {filteredSlots.map((slot, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === filteredSlots.length - 1;
                const isSelf = slot.memberId === currentUserId;
                const isNext =
                  schedule.nextSlot?.cycleNumber === slot.cycleNumber && slot.status === 'upcoming';
                const isSelected = activeSelectedSlot?.cycleNumber === slot.cycleNumber;
                const meta = getRelativeTenureMeta(slot, todayUtcMs);

                const leftConnectorClass =
                  slot.status === 'upcoming'
                    ? 'border-t-2 border-dashed border-slate-300 dark:border-slate-700'
                    : 'border-t-2 border-emerald-500/70 dark:border-emerald-600/70';

                const rightConnectorClass =
                  slot.status === 'completed'
                    ? 'border-t-2 border-emerald-500/70 dark:border-emerald-600/70'
                    : 'border-t-2 border-dashed border-slate-300 dark:border-slate-700';

                return (
                  <div
                    key={`${slot.cycleNumber}-${slot.memberId}`}
                    ref={slot.status === 'current' ? currentCardRef : undefined}
                    className="w-[250px] sm:w-[285px] shrink-0 flex flex-col"
                  >
                    {/* Axis Node & Connector Row */}
                    <div className="relative flex items-center h-10 mb-2">
                      {/* Left line */}
                      <div
                        className={`flex-1 h-0 ${isFirst ? 'border-t-0' : leftConnectorClass}`}
                        aria-hidden="true"
                      />

                      {/* Center Node Marker */}
                      <button
                        type="button"
                        onClick={() => setSelectedCycleNumber(slot.cycleNumber)}
                        aria-label={t('selectCycleAria', {
                          num: slot.cycleNumber,
                          name: slot.memberName,
                        })}
                        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border transition-transform cursor-pointer ${
                          slot.status === 'current'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm scale-105'
                            : slot.status === 'completed'
                              ? 'bg-slate-100 dark:bg-slate-800 border-emerald-500/60 text-emerald-700 dark:text-emerald-400'
                              : isNext
                                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {slot.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        ) : slot.status === 'current' ? (
                          <Crown className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Clock className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>

                      {/* Right line */}
                      <div
                        className={`flex-1 h-0 ${isLast ? 'border-t-0' : rightConnectorClass}`}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Node Content Card */}
                    <div className="px-1.5 flex-1 flex">
                      <article
                        onClick={() => setSelectedCycleNumber(slot.cycleNumber)}
                        className={`w-full rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors cursor-pointer backdrop-blur-md ${
                          slot.status === 'current'
                            ? 'border-emerald-500/80 dark:border-emerald-600/80 bg-emerald-50/60 dark:bg-emerald-950/30'
                            : isSelected
                              ? 'border-slate-400 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/50'
                              : slot.status === 'completed'
                                ? 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/65 dark:bg-slate-950/65 hover:border-slate-300 dark:hover:border-slate-700'
                                : 'border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Cycle & Status Typography Line (Zero Pills) */}
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                              {tCycle('cycleNumber', { num: slot.cycleNumber })}
                            </span>
                            <span
                              className={`font-medium ${
                                slot.status === 'current'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : slot.status === 'completed'
                                    ? 'text-slate-500 dark:text-slate-400'
                                    : isNext
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {slot.status === 'current'
                                ? t('statusCurrentTenure')
                                : slot.status === 'completed'
                                  ? t('statusHistorical')
                                  : isNext
                                    ? t('statusNextUp')
                                    : t('statusFuture')}
                            </span>
                          </div>

                          {/* Member Header */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MemberAvatar
                              name={slot.memberName}
                              photoUrl={slot.photoUrl}
                              status={slot.status}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {slot.memberName}
                                {isSelf && (
                                  <span className="ml-1.5 text-xs font-mono font-normal text-emerald-700 dark:text-emerald-400">
                                    {tCycle('youSuffix')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                {slot.memberCode} · <span>{translateRoleLabel(slot.currentRole, locale)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Expected Tenure Date Window */}
                          <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 space-y-1">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t('expectedTenureDate')}
                            </div>
                            <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                              {formatShortDate(slot.startDate)} → {formatShortDate(slot.endDate)}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              <span>{formatTiming(meta)}</span>
                              <span>{t('totalDaysShort', { days: meta.totalDays })}</span>
                            </div>
                            {slot.status === 'current' && (
                              <div className="pt-1">
                                <div className="h-1 w-full rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                                  <motion.div
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                    className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full"
                                    style={{ width: `${meta.progressPct}%`, originX: 0 }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {(onViewMemberProfile || (isAdmin && onToggleManagerRole)) && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                            {onViewMemberProfile ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewMemberProfile(slot.memberId);
                                }}
                                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <span>{tCycle('profileBtn')}</span>
                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              </button>
                            ) : (
                              <span />
                            )}
                            {isAdmin && onToggleManagerRole && (
                              <button
                                type="button"
                                disabled={modalBusy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleManagerRole(slot);
                                }}
                                className={`text-[11px] font-medium hover:underline cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                  slot.currentRole === 'manager'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {slot.currentRole === 'manager'
                                  ? t('revertRoleShort')
                                  : t('makeManagerShort')}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* VERTICAL CHRONOLOGY TIMELINE */
        <div className="relative space-y-0">
          {filteredSlots.map((slot, idx) => {
            const isLast = idx === filteredSlots.length - 1;
            const isSelf = slot.memberId === currentUserId;
            const isNext =
              schedule.nextSlot?.cycleNumber === slot.cycleNumber && slot.status === 'upcoming';
            const meta = getRelativeTenureMeta(slot, todayUtcMs);

            return (
              <div
                key={`${slot.cycleNumber}-${slot.memberId}`}
                ref={slot.status === 'current' ? currentCardRef : undefined}
                className="relative flex items-stretch gap-3 sm:gap-4"
              >
                {/* Left Vertical Spine */}
                <div className="flex flex-col items-center shrink-0 w-8">
                  <div
                    className={`mt-4 w-7 h-7 rounded-full flex items-center justify-center border shrink-0 z-10 ${
                      slot.status === 'current'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : slot.status === 'completed'
                          ? 'bg-slate-100 dark:bg-slate-800 border-emerald-500/60 text-emerald-700 dark:text-emerald-400'
                          : isNext
                            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {slot.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : slot.status === 'current' ? (
                      <Crown className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={`w-px flex-1 my-1 ${
                        slot.status === 'completed'
                          ? 'bg-emerald-400/60 dark:bg-emerald-700/60'
                          : 'border-l border-dashed border-slate-300 dark:border-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Timeline Row Content */}
                <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div
                    className={`rounded-xl border p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 backdrop-blur-md ${
                      slot.status === 'current'
                        ? 'border-emerald-500/80 dark:border-emerald-600/80 bg-emerald-50/60 dark:bg-emerald-950/30'
                        : slot.status === 'completed'
                          ? 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/65 dark:bg-slate-950/65'
                          : 'border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar
                        name={slot.memberName}
                        photoUrl={slot.photoUrl}
                        status={slot.status}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                            {tCycle('cycleNumber', { num: slot.cycleNumber })}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <span
                            className={`font-medium ${
                              slot.status === 'current'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : slot.status === 'completed'
                                  ? 'text-slate-500 dark:text-slate-400'
                                  : isNext
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {slot.status === 'current'
                              ? t('statusCurrentActiveManager')
                              : slot.status === 'completed'
                                ? t('statusHistoricalTenure')
                                : isNext
                                  ? t('statusNextInRotation')
                                  : t('statusFutureScheduled')}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {slot.memberName}
                          {isSelf && (
                            <span className="ml-1.5 text-xs font-mono font-normal text-emerald-700 dark:text-emerald-400">
                              {tCycle('youSuffix')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {slot.memberCode} · {t('currentRolePrefix')}{' '}
                          <span>{translateRoleLabel(slot.currentRole, locale)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
                      <div className="sm:text-right space-y-0.5">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('expectedTenureDate')}
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatShortDate(slot.startDate)} → {formatShortDate(slot.endDate)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatTiming(meta)} · {t('totalDaysWord', { days: meta.totalDays })}
                        </div>
                      </div>

                      {(onViewMemberProfile || (isAdmin && onToggleManagerRole)) && (
                        <div className="flex items-center gap-2">
                          {onViewMemberProfile && (
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(slot.memberId)}
                              className="min-h-[40px] sm:min-h-0 flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              {tCycle('profileBtn')}
                            </button>
                          )}
                          {isAdmin && onToggleManagerRole && (
                            <button
                              type="button"
                              disabled={modalBusy}
                              onClick={() => onToggleManagerRole(slot)}
                              className={`min-h-[40px] sm:min-h-0 flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                slot.currentRole === 'manager'
                                  ? 'border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              {slot.currentRole === 'manager'
                                ? t('revertShort')
                                : t('activateShort')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
