'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Crown,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
import type { FundConfig, ManagerCycleSchedule, ManagerCycleSlot, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatShortDate } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ManagerRotationTimeline } from './ManagerRotationTimeline.tsx';

interface ManagerCycleViewProps {
  user: PublicUser;
  config: FundConfig | null;
  onViewMemberProfile?: (memberId: string) => void;
  onOpenConfig?: () => void;
  onRefresh: () => Promise<void>;
}

type CycleModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      run: () => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

export function ManagerCycleView({
  user,
  config,
  onViewMemberProfile,
  onOpenConfig,
  onRefresh,
}: ManagerCycleViewProps) {
  const t = useTranslations('ManagerCycle');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const isAdmin = user.role === 'admin';
  const [schedule, setSchedule] = useState<ManagerCycleSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleMonthsInput, setCycleMonthsInput] = useState(
    String(config?.managerCycleMonths ?? 3)
  );
  const [cycleStartInput, setCycleStartInput] = useState(
    config?.managerCycleStartDate || '2026-01-01'
  );
  const [modal, setModal] = useState<CycleModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getManagerCycle();
      setSchedule(res.schedule);
      setCycleMonthsInput(String(res.schedule.cycleMonths));
      setCycleStartInput(res.schedule.cycleStartDate);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('loadFailedTitle'),
        description: err instanceof Error ? err.message : t('loadFailedDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSchedule();
    const handleGlobalRefresh = () => {
      void loadSchedule();
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [loadSchedule, config?.managerCycleMonths, config?.managerCycleStartDate]);

  async function runConfirmed() {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run();
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('updateFailedTitle'),
        description: err instanceof Error ? err.message : t('updateFailedDesc'),
      });
    } finally {
      setModalBusy(false);
    }
  }

  function handleSaveCycleConfig(e: FormEvent) {
    e.preventDefault();
    const months = Math.floor(Number(cycleMonthsInput));
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidDurationTitle'),
        description: t('invalidDurationDesc'),
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStartInput)) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidStartDateTitle'),
        description: t('invalidStartDateDesc'),
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmCycleTitle'),
      description: t('confirmCycleDesc'),
      details: [
        { label: t('newRotationInterval'), value: t('everyNMonths', { count: months }) },
        { label: t('cycleAnchorStartDate'), value: formatShortDate(cycleStartInput) },
      ],
      confirmLabel: t('savePolicyBtn'),
      run: async () => {
        await api.updateConfig({
          managerCycleMonths: months,
          managerCycleStartDate: cycleStartInput,
        });
        await Promise.all([onRefresh(), loadSchedule()]);
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: t('cycleUpdatedTitle'),
          description: t('cycleUpdatedDesc', {
            count: months,
            date: formatShortDate(cycleStartInput),
          }),
        });
      },
    });
  }

  function confirmAssignManager(slot: ManagerCycleSlot) {
    const nextRole = slot.currentRole === 'manager' ? 'member' : 'manager';
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title:
        nextRole === 'manager'
          ? t('assignManagerTitle', { name: slot.memberName })
          : t('revertMemberTitle', { name: slot.memberName }),
      description:
        nextRole === 'manager'
          ? t('assignManagerDesc', { name: slot.memberName, code: slot.memberCode })
          : t('revertMemberDesc', { name: slot.memberName, code: slot.memberCode }),
      details: [
        {
          label: t('cycleSlotLabel'),
          value: `#${slot.cycleNumber} (${formatShortDate(slot.startDate)} – ${formatShortDate(slot.endDate)})`,
        },
        { label: t('currentRoleLabel'), value: translateRoleLabel(slot.currentRole, locale) },
        { label: t('newRoleLabel'), value: translateRoleLabel(nextRole, locale) },
      ],
      confirmLabel: nextRole === 'manager' ? t('assignManagerBtn') : t('revertToMemberBtn'),
      run: async () => {
        await api.updateMember(slot.memberId, { role: nextRole });
        await Promise.all([onRefresh(), loadSchedule()]);
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: t('roleUpdatedTitle'),
          description:
            nextRole === 'manager'
              ? t('roleUpdatedManagerDesc', { name: slot.memberName })
              : t('roleUpdatedMemberDesc', { name: slot.memberName }),
        });
      },
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {/* Header Banner */}
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <CalendarClock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              {t('heading')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {t('subtitle', {
                months: t('nMonths', { count: schedule ? schedule.cycleMonths : 3 }),
              })}
            </p>
          </div>

          {schedule && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0 text-xs">
              <div className="px-3.5 py-2 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/50">
                <div className="text-[11px] text-teal-700 dark:text-teal-400">{t('turnDuration')}</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                  {t('nMonths', { count: schedule.cycleMonths })}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50">
                <div className="text-[11px] text-indigo-700 dark:text-indigo-400">{t('cycleAnchor')}</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatShortDate(schedule.cycleStartDate)}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{t('rotationPool')}</div>
                <div className="font-mono font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {t('nActiveMembers', { count: schedule.eligibleMembersCount })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Admin Controls */}
      {isAdmin && (
        <section className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('adminConfigTitle')}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[3, 6, 12].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCycleMonthsInput(String(preset))}
                  className={`min-h-[38px] sm:min-h-0 px-2.5 py-1 rounded-md text-xs font-mono border cursor-pointer transition-colors ${
                    Number(cycleMonthsInput) === preset
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('nMonths', { count: preset })}
                </button>
              ))}
              {onOpenConfig && (
                <button
                  type="button"
                  onClick={onOpenConfig}
                  className="min-h-[38px] sm:min-h-0 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t('siteSettingsBtn')}
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveCycleConfig} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('monthsPerTermLabel')}
              </label>
              <input
                type="number"
                min={1}
                max={36}
                required
                value={cycleMonthsInput}
                onChange={(e) => setCycleMonthsInput(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('cycleStartDateLabel')}
              </label>
              <input
                type="date"
                required
                value={cycleStartInput}
                onChange={(e) => setCycleStartInput(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              disabled={modalBusy}
              className="min-h-[44px] sm:min-h-0 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {t('updateIntervalBtn')}
            </button>
          </form>
        </section>
      )}

      {loading && !schedule ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton height={130} />
            <Skeleton height={130} />
          </div>
          <Skeleton height={240} />
        </div>
      ) : schedule ? (
        <>
          {/* Current & Next Spotlight */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                  <Crown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t('currentCycleManager')}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {t('cycleNumber', { num: schedule.currentSlot?.cycleNumber ?? '—' })}
                </span>
              </div>

              {schedule.currentSlot ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        {schedule.currentSlot.memberName}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {schedule.currentSlot.memberCode} ·{' '}
                        {t('joinedDate', { date: formatShortDate(schedule.currentSlot.joinedAt) })}
                      </div>
                    </div>
                    {onViewMemberProfile && (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(schedule.currentSlot!.memberId)}
                        className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <span>{t('viewProfile')}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-1 text-xs font-mono">
                    <span className="text-emerald-800 dark:text-emerald-300">{t('activeTermWindow')}</span>
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {formatShortDate(schedule.currentSlot.startDate)} →{' '}
                      {formatShortDate(schedule.currentSlot.endDate)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('noActiveMembers')}</p>
              )}
            </section>

            <section className="amanah-card-amber border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                  <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t('nextUpRotation')}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {t('cycleNumber', { num: schedule.nextSlot?.cycleNumber ?? '—' })}
                </span>
              </div>

              {schedule.nextSlot ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        {schedule.nextSlot.memberName}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {schedule.nextSlot.memberCode} ·{' '}
                        {t('joinedDate', { date: formatShortDate(schedule.nextSlot.joinedAt) })}
                      </div>
                    </div>
                    {onViewMemberProfile && (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(schedule.nextSlot!.memberId)}
                        className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <span>{t('viewProfile')}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1 text-xs font-mono">
                    <span className="text-slate-500 dark:text-slate-400">{t('upcomingTermWindow')}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatShortDate(schedule.nextSlot.startDate)} →{' '}
                      {formatShortDate(schedule.nextSlot.endDate)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('additionalMembersNeeded')}</p>
              )}
            </section>
          </div>

          {/* Active Assigned Managers Note */}
          {schedule.activeDesignatedManagers.length > 0 && (
            <section className="bg-slate-50/75 dark:bg-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{t('activeHoldersLabel')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {schedule.activeDesignatedManagers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onViewMemberProfile?.(m.id)}
                    className="inline-flex items-center gap-1.5 font-mono text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {m.name} ({m.memberCode})
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Visual Rotation Timeline (Historical, Current & Future Members + Expected Tenure Dates) */}
          <ManagerRotationTimeline
            schedule={schedule}
            currentUserId={user.id}
            isAdmin={isAdmin}
            modalBusy={modalBusy}
            onViewMemberProfile={onViewMemberProfile}
            onToggleManagerRole={confirmAssignManager}
          />

          {/* Full Cyclic Rotation Table */}
          <section className="amanah-card-teal border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('fullRosterTitle', { count: schedule.slots.length })}
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {t('orderedBy')}
              </span>
            </div>

            {schedule.slots.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                {t('emptyPool')}
              </div>
            ) : (
              <>
                {/* Mobile Rotation Cards (< lg) */}
                <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white/80 dark:bg-slate-900/60">
                  {schedule.slots.map((slot) => {
                    const isSelf = slot.memberId === user.id;
                    return (
                      <div
                        key={`mobile-${slot.cycleNumber}-${slot.memberId}`}
                        className={`p-3.5 space-y-2.5 text-xs ${
                          slot.status === 'current' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {t('cycleNumber', { num: slot.cycleNumber })}
                          </span>
                          {slot.status === 'current' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('currentTerm')}</span>
                            </span>
                          ) : slot.status === 'completed' ? (
                            <span className="text-slate-500 dark:text-slate-400">{t('completed')}</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {t('upcoming')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {slot.memberName}
                              {isSelf && (
                                <span className="ml-1.5 text-[11px] font-mono font-normal text-emerald-700 dark:text-emerald-400">
                                  {t('youSuffix')}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {slot.memberCode} · <span>{translateRoleLabel(slot.currentRole, locale)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('termLabelMonths', { months: schedule.cycleMonths })}
                          </span>
                          <span>
                            {formatShortDate(slot.startDate)} → {formatShortDate(slot.endDate)}
                          </span>
                        </div>

                        {(onViewMemberProfile || isAdmin) && (
                          <div className={`grid gap-2 pt-0.5 ${onViewMemberProfile && isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {onViewMemberProfile && (
                              <button
                                type="button"
                                onClick={() => onViewMemberProfile(slot.memberId)}
                                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                {t('profileBtn')}
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={modalBusy}
                                onClick={() => confirmAssignManager(slot)}
                                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 ${
                                  slot.currentRole === 'manager'
                                    ? 'border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                              >
                                {slot.currentRole === 'manager'
                                  ? t('revertToMemberBtn')
                                  : t('activateManagerBtn')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= lg) */}
                <div className="hidden lg:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4 font-medium">{t('colCycle')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colMember')}</th>
                      <th className="py-2.5 px-4 font-medium">
                        {t('colTermWindow', { months: schedule.cycleMonths })}
                      </th>
                      <th className="py-2.5 px-4 font-medium">{t('colRole')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colTurnStatus')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {schedule.slots.map((slot) => {
                      const isSelf = slot.memberId === user.id;
                      return (
                        <tr
                          key={`${slot.cycleNumber}-${slot.memberId}`}
                          className={
                            slot.status === 'current'
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                          }
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                            #{slot.cycleNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{slot.memberName}</span>
                              {isSelf && (
                                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                                  {t('youSuffix')}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {slot.memberCode}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatShortDate(slot.startDate)} → {formatShortDate(slot.endDate)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                            {translateRoleLabel(slot.currentRole, locale)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {slot.status === 'current' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{t('currentTerm')}</span>
                              </span>
                            ) : slot.status === 'completed' ? (
                              <span className="text-slate-500 dark:text-slate-400">{t('completed')}</span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                {t('upcoming')}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {onViewMemberProfile && (
                                <button
                                  type="button"
                                  onClick={() => onViewMemberProfile(slot.memberId)}
                                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  {t('profileBtn')}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={modalBusy}
                                  onClick={() => confirmAssignManager(slot)}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer disabled:opacity-50 ${
                                    slot.currentRole === 'manager'
                                      ? 'border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  }`}
                                >
                                  {slot.currentRole === 'manager'
                                    ? t('revertToMemberBtn')
                                    : t('activateManagerBtn')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
        </>
      ) : null}

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmed : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
