'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Pencil,
  RotateCcw,
  Target,
  X,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, PublicUser } from '../types/coop.ts';
import {
  formatBillingMonth,
  formatDateTime,
  formatMoney,
  shortHash,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface ContributionGoalTrackerProps {
  user: PublicUser;
  contributions: Contribution[];
  config: FundConfig | null;
  loading?: boolean;
  onSubmitContribution?: (billingMonth?: string) => void;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function getGoalStorageKey(userId: string, year: number): string {
  return `amanah_yearly_goal_${userId}_${year}`;
}

export function ContributionGoalTracker({
  user,
  contributions,
  config,
  loading = false,
  onSubmitContribution,
}: ContributionGoalTrackerProps) {
  const ccy = config?.currency || 'BDT';
  const monthlyBaseTarget = Math.max(1, config?.monthlyContributionAmount || 5000);
  const defaultYearlyGoal = monthlyBaseTarget * 12;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-11

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    contributions.forEach((c) => {
      if (c.userId !== user.id) return;
      const y = Number((c.billingMonth || c.submittedAt).slice(0, 4));
      if (Number.isInteger(y) && y >= 2020 && y <= currentYear + 1) {
        years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [contributions, user.id, currentYear]);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [customGoal, setCustomGoal] = useState<number | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(defaultYearlyGoal));
  const [goalError, setGoalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(getGoalStorageKey(user.id, selectedYear));
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0) {
          setCustomGoal(parsed);
          setGoalInput(String(parsed));
          return;
        }
      }
    } catch {
      // ignore storage unavailability
    }
    setCustomGoal(null);
    setGoalInput(String(defaultYearlyGoal));
  }, [user.id, selectedYear, defaultYearlyGoal]);

  const yearlyGoal = customGoal ?? defaultYearlyGoal;
  const monthlyPaceTarget = yearlyGoal / 12;

  const trackerData = useMemo(() => {
    const myYearContribs = contributions.filter((c) => {
      if (c.userId !== user.id) return false;
      const ym = c.billingMonth || c.submittedAt.slice(0, 7);
      return ym.startsWith(`${selectedYear}-`);
    });

    const monthlyBuckets = Array.from({ length: 12 }, (_, idx) => {
      const monthNum = String(idx + 1).padStart(2, '0');
      const billingMonth = `${selectedYear}-${monthNum}`;
      return {
        index: idx,
        label: MONTH_NAMES[idx],
        billingMonth,
        approvedAmount: 0,
        pendingAmount: 0,
      };
    });

    myYearContribs.forEach((c) => {
      const ym = c.billingMonth || c.submittedAt.slice(0, 7);
      const m = Number(ym.slice(5, 7));
      if (!Number.isInteger(m) || m < 1 || m > 12) return;
      const bucket = monthlyBuckets[m - 1];
      if (c.status === 'approved') {
        bucket.approvedAmount += c.amount;
      } else if (c.status === 'pending') {
        bucket.pendingAmount += c.amount;
      }
    });

    const approvedTotal = monthlyBuckets.reduce((sum, b) => sum + b.approvedAmount, 0);
    const pendingTotal = monthlyBuckets.reduce((sum, b) => sum + b.pendingAmount, 0);
    const combinedTotal = approvedTotal + pendingTotal;

    const approvedPct =
      approvedTotal >= yearlyGoal
        ? 100
        : Math.min(99, Math.round((approvedTotal / Math.max(1, yearlyGoal)) * 100));
    const pendingPct =
      pendingTotal <= 0
        ? 0
        : Math.min(100 - approvedPct, Math.round((pendingTotal / Math.max(1, yearlyGoal)) * 100));
    const remainingToGoal = Math.max(0, yearlyGoal - approvedTotal);
    const surplusAmount = Math.max(0, approvedTotal - yearlyGoal);

    const monthsMetCount = monthlyBuckets.filter(
      (b) => b.approvedAmount >= monthlyPaceTarget
    ).length;
    const monthsWithPending = monthlyBuckets.filter(
      (b) => b.approvedAmount < monthlyPaceTarget && b.approvedAmount + b.pendingAmount >= monthlyPaceTarget
    ).length;

    const elapsedMonths =
      selectedYear < currentYear ? 12 : selectedYear > currentYear ? 0 : currentMonthIndex + 1;
    const expectedToDate = monthlyPaceTarget * elapsedMonths;
    const paceDelta = approvedTotal - expectedToDate;

    return {
      monthlyBuckets,
      approvedTotal,
      pendingTotal,
      combinedTotal,
      approvedPct,
      pendingPct,
      remainingToGoal,
      surplusAmount,
      monthsMetCount,
      monthsWithPending,
      elapsedMonths,
      expectedToDate,
      paceDelta,
    };
  }, [
    contributions,
    user.id,
    selectedYear,
    yearlyGoal,
    monthlyPaceTarget,
    currentYear,
    currentMonthIndex,
  ]);

  const nowBillingMonth = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;

  const currentMonthSummary = useMemo(() => {
    const entries = contributions
      .filter((c) => c.userId === user.id && c.billingMonth === nowBillingMonth)
      .slice()
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    const approvedAmount = entries
      .filter((c) => c.status === 'approved')
      .reduce((sum, c) => sum + c.amount, 0);
    const pendingAmount = entries
      .filter((c) => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, 0);
    const latestEntry = entries[0] || null;

    let state: 'paid' | 'pending' | 'rejected' | 'due' = 'due';
    if (approvedAmount >= monthlyBaseTarget) {
      state = 'paid';
    } else if (pendingAmount > 0) {
      state = 'pending';
    } else if (latestEntry?.status === 'rejected') {
      state = 'rejected';
    } else if (approvedAmount > 0) {
      state = 'due';
    }

    return {
      billingMonth: nowBillingMonth,
      monthLabel: formatBillingMonth(nowBillingMonth),
      entries,
      approvedAmount,
      pendingAmount,
      latestEntry,
      state,
      remainingAmount: Math.max(0, monthlyBaseTarget - approvedAmount - pendingAmount),
    };
  }, [contributions, user.id, nowBillingMonth, monthlyBaseTarget]);

  const personalPaymentHistory = useMemo(() => {
    return contributions
      .filter((c) => c.userId === user.id)
      .slice()
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [contributions, user.id]);

  function handleSaveGoal(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(goalInput);
    if (!Number.isFinite(parsed) || parsed < 100) {
      setGoalError('Enter a yearly savings goal of at least 100.');
      return;
    }
    setGoalError(null);
    setCustomGoal(parsed);
    try {
      window.localStorage.setItem(getGoalStorageKey(user.id, selectedYear), String(parsed));
    } catch {
      // ignore storage unavailability
    }
    setEditingGoal(false);
  }

  function handleResetGoal() {
    setCustomGoal(null);
    setGoalInput(String(defaultYearlyGoal));
    setGoalError(null);
    try {
      window.localStorage.removeItem(getGoalStorageKey(user.id, selectedYear));
    } catch {
      // ignore storage unavailability
    }
    setEditingGoal(false);
  }

  if (loading) {
    return (
      <section className="amanah-card-teal border rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton width={180} height={12} />
            <Skeleton width={280} height={22} />
          </div>
          <Skeleton width={140} height={34} />
        </div>
        <Skeleton height={14} />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      </section>
    );
  }

  const currentBillingMonth = `${selectedYear}-${String(
    selectedYear === currentYear ? currentMonthIndex + 1 : 1
  ).padStart(2, '0')}`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-labelledby="contribution-goal-tracker-heading"
      className="amanah-card-teal border rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200"
    >
      {/* Top Header & Year / Goal Controls */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </span>
            <span>Annual Savings Goal Tracker</span>
          </div>
          <h3
            id="contribution-goal-tracker-heading"
            className="text-base font-semibold text-slate-900 dark:text-white"
          >
            {selectedYear} Monthly Contribution Progress vs. Yearly Goal
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monthly pace target{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {formatMoney(Math.round(monthlyPaceTarget), ccy)}/mo
            </span>
            <span aria-hidden="true"> · </span>
            Cooperative standard{' '}
            <span className="font-mono tabular-nums">
              {formatMoney(defaultYearlyGoal, ccy)}/yr
            </span>
            {customGoal !== null && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                  Custom goal active
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {availableYears.length > 1 && (
            <div
              role="group"
              aria-label="Select tracking year"
              className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg border border-slate-200/70 dark:border-slate-700/70"
            >
              {availableYears.map((yr) => {
                const active = selectedYear === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setSelectedYear(yr)}
                    className={`relative px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="goal-tracker-year-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
                      />
                    )}
                    <span className="relative z-10">{yr}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingGoal((prev) => !prev);
              setGoalInput(String(yearlyGoal));
              setGoalError(null);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/70 transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Pencil className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>{editingGoal ? 'Close Editor' : 'Edit Yearly Goal'}</span>
          </button>

          {onSubmitContribution && (
            <button
              type="button"
              onClick={() => onSubmitContribution(currentBillingMonth)}
              className="group px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Deposit Month</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Current Month Contribution Status Banner */}
      <div
        className={`rounded-xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          currentMonthSummary.state === 'paid'
            ? 'bg-emerald-50/75 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
            : currentMonthSummary.state === 'pending'
              ? 'bg-amber-50/75 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
              : currentMonthSummary.state === 'rejected'
                ? 'bg-red-50/75 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                : 'bg-slate-50/90 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              currentMonthSummary.state === 'paid'
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                : currentMonthSummary.state === 'pending'
                  ? 'bg-amber-600/15 text-amber-700 dark:text-amber-400'
                  : currentMonthSummary.state === 'rejected'
                    ? 'bg-red-600/15 text-red-700 dark:text-red-400'
                    : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {currentMonthSummary.state === 'paid' ? (
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            ) : currentMonthSummary.state === 'pending' ? (
              <Clock className="w-4 h-4" aria-hidden="true" />
            ) : currentMonthSummary.state === 'rejected' ? (
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
            ) : (
              <CreditCard className="w-4 h-4" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">
                Current Month Status · {currentMonthSummary.monthLabel}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                ·
              </span>
              {currentMonthSummary.state === 'paid' ? (
                <StatusText status="approved" />
              ) : currentMonthSummary.state === 'pending' ? (
                <StatusText status="pending" />
              ) : currentMonthSummary.state === 'rejected' ? (
                <StatusText status="rejected" />
              ) : (
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  Contribution Due
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentMonthSummary.state === 'paid' && (
                <>
                  Verified{' '}
                  <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMoney(currentMonthSummary.approvedAmount, ccy)}
                  </strong>{' '}
                  against your{' '}
                  <span className="font-mono tabular-nums">
                    {formatMoney(monthlyBaseTarget, ccy)}
                  </span>{' '}
                  monthly cooperative requirement.
                </>
              )}
              {currentMonthSummary.state === 'pending' && (
                <>
                  Submitted{' '}
                  <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-300">
                    {formatMoney(currentMonthSummary.pendingAmount, ccy)}
                  </strong>{' '}
                  via {currentMonthSummary.latestEntry?.providerName} (
                  <span className="font-mono">
                    {currentMonthSummary.latestEntry?.maskedReference}
                  </span>
                  ). Awaiting manager verification.
                </>
              )}
              {currentMonthSummary.state === 'rejected' && (
                <>
                  Last submission for {currentMonthSummary.monthLabel} was declined
                  {currentMonthSummary.latestEntry?.reviewNote
                    ? ` (${currentMonthSummary.latestEntry.reviewNote})`
                    : ''}
                  . Submit a corrected Bank or MFS reference below.
                </>
              )}
              {currentMonthSummary.state === 'due' && (
                <>
                  Monthly contribution target of{' '}
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(currentMonthSummary.remainingAmount, ccy)}
                  </strong>{' '}
                  has not been submitted for {currentMonthSummary.monthLabel} yet.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-right font-mono tabular-nums">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Monthly Target</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {formatMoney(monthlyBaseTarget, ccy)}
            </div>
          </div>

          {onSubmitContribution && currentMonthSummary.state !== 'paid' && (
            <button
              type="button"
              onClick={() => onSubmitContribution(nowBillingMonth)}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>
                {currentMonthSummary.state === 'rejected'
                  ? `Resubmit ${MONTH_NAMES[currentMonthIndex]}`
                  : `Pay ${MONTH_NAMES[currentMonthIndex]} Now`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Custom Yearly Goal Editor */}
      <AnimatePresence initial={false}>
        {editingGoal && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSaveGoal}
            className="overflow-hidden pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-end justify-between gap-3"
          >
            <div className="space-y-1 flex-1 max-w-sm">
              <label
                htmlFor="yearly-savings-goal-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Personal {selectedYear} Yearly Savings Goal ({ccy})
              </label>
              <input
                id="yearly-savings-goal-input"
                type="number"
                min={100}
                step={100}
                required
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              {goalError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{goalError}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
              >
                Save Goal
              </button>
              {customGoal !== null && (
                <button
                  type="button"
                  onClick={handleResetGoal}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset to 12× ({formatMoney(defaultYearlyGoal, ccy)})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingGoal(false)}
                aria-label="Cancel editing yearly goal"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 4-Column Annual Goal Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Verified Saved ({selectedYear})
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(trackerData.approvedTotal, ccy)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {trackerData.monthsMetCount} of 12 monthly targets met
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Yearly Savings Goal</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            {formatMoney(yearlyGoal, ccy)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {trackerData.approvedPct}% verified complete
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Pending Review</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(trackerData.pendingTotal, ccy)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {trackerData.pendingTotal > 0
              ? `+${trackerData.pendingPct}% awaiting manager`
              : 'No pending submissions'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {trackerData.surplusAmount > 0 ? 'Goal Exceeded By' : 'Remaining to Goal'}
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
            {trackerData.surplusAmount > 0
              ? `+${formatMoney(trackerData.surplusAmount, ccy)}`
              : formatMoney(trackerData.remainingToGoal, ccy)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {trackerData.elapsedMonths > 0
              ? trackerData.paceDelta >= 0
                ? `${formatMoney(Math.round(trackerData.paceDelta), ccy)} ahead of ${trackerData.elapsedMonths}m pace`
                : `${formatMoney(Math.abs(Math.round(trackerData.paceDelta)), ccy)} behind ${trackerData.elapsedMonths}m pace`
              : 'Upcoming saving cycle'}
          </div>
        </div>
      </div>

      {/* Primary Yearly Progress Bar with 12-Month Milestone Markers */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Annual Progress Bar ({trackerData.monthsMetCount}/12 months funded)
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatMoney(trackerData.approvedTotal, ccy)}{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              / {formatMoney(yearlyGoal, ccy)} ({trackerData.approvedPct}%)
            </span>
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`${selectedYear} yearly savings goal progress`}
          aria-valuenow={Math.min(yearlyGoal, trackerData.approvedTotal)}
          aria-valuemin={0}
          aria-valuemax={yearlyGoal}
          className="relative w-full h-3.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400"
            style={{ width: `${trackerData.approvedPct}%`, originX: 0 }}
          />
          {trackerData.pendingPct > 0 && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${trackerData.pendingPct}%`, originX: 0 }}
            />
          )}

          {/* 12-Month Equal Milestone Dividers */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
            {Array.from({ length: 12 }, (_, idx) => (
              <div
                key={idx}
                className={
                  idx < 11
                    ? 'border-r border-white/60 dark:border-slate-900/70 h-full'
                    : 'h-full'
                }
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" aria-hidden="true" />
              <span>Verified ({trackerData.approvedPct}%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs bg-amber-500/80 dark:bg-amber-400/75 shrink-0"
                aria-hidden="true"
              />
              <span>Pending Verification ({trackerData.pendingPct}%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-700 shrink-0"
                aria-hidden="true"
              />
              <span>
                Remaining ({Math.max(0, 100 - trackerData.approvedPct - trackerData.pendingPct)}%)
              </span>
            </span>
          </div>

          <span className="font-mono tabular-nums">12 segments = 1 month each</span>
        </div>
      </div>

      {/* 12-Month Breakdown Progress Grid */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Monthly Breakdown Against {formatMoney(Math.round(monthlyPaceTarget), ccy)}/mo Target
          </h4>
          {onSubmitContribution && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Select any open month to submit a Bank or MFS contribution
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-3.5">
          {trackerData.monthlyBuckets.map((month) => {
            const approvedMonthPct =
              month.approvedAmount >= monthlyPaceTarget
                ? 100
                : Math.min(99, Math.round((month.approvedAmount / Math.max(1, monthlyPaceTarget)) * 100));
            const pendingMonthPct =
              month.pendingAmount <= 0
                ? 0
                : Math.min(
                    100 - approvedMonthPct,
                    Math.round((month.pendingAmount / Math.max(1, monthlyPaceTarget)) * 100)
                  );
            const isVerifiedComplete = month.approvedAmount >= monthlyPaceTarget;
            const hasPending = month.pendingAmount > 0;
            const isPastOrCurrent =
              selectedYear < currentYear ||
              (selectedYear === currentYear && month.index <= currentMonthIndex);
            const isCurrentMonth =
              selectedYear === currentYear && month.index === currentMonthIndex;

            const statusLabel = isVerifiedComplete
              ? 'Met'
              : hasPending
                ? 'Pending'
                : isPastOrCurrent
                  ? 'Due'
                  : 'Upcoming';

            const content = (
              <>
                <div className="flex items-center justify-between gap-1.5 text-xs">
                  <span
                    className={`font-medium ${
                      isCurrentMonth
                        ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {month.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                      isVerifiedComplete
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : hasPending
                          ? 'text-amber-700 dark:text-amber-400'
                          : isPastOrCurrent
                            ? 'text-slate-600 dark:text-slate-300'
                            : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {isVerifiedComplete && (
                      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                    )}
                    {!isVerifiedComplete && hasPending && (
                      <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{statusLabel}</span>
                  </span>
                </div>

                <div
                  className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all duration-300"
                    style={{ width: `${approvedMonthPct}%` }}
                  />
                  {pendingMonthPct > 0 && (
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${pendingMonthPct}%` }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {formatMoney(month.approvedAmount + month.pendingAmount, ccy)}
                  </span>
                  <span>{approvedMonthPct}%</span>
                </div>
              </>
            );

            if (onSubmitContribution) {
              return (
                <button
                  key={month.billingMonth}
                  type="button"
                  onClick={() => onSubmitContribution(month.billingMonth)}
                  className={`text-left py-2.5 px-3 rounded-lg border transition-all duration-200 space-y-1.5 cursor-pointer hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 ${
                    isCurrentMonth
                      ? 'bg-emerald-50/75 dark:bg-emerald-950/35 border-emerald-300/90 dark:border-emerald-800/70'
                      : 'bg-slate-50/70 dark:bg-slate-950/50 border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60'
                  }`}
                >
                  {content}
                </button>
              );
            }

            return (
              <div
                key={month.billingMonth}
                className={`py-2.5 px-3 rounded-lg border space-y-1.5 ${
                  isCurrentMonth
                    ? 'bg-emerald-50/75 dark:bg-emerald-950/35 border-emerald-300/90 dark:border-emerald-800/70'
                    : 'bg-slate-50/70 dark:bg-slate-950/50 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {/* Member Personal Payment History */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Your Contribution Payment History ({personalPaymentHistory.length})
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {user.memberCode} · Chronological Record
          </span>
        </div>

        {personalPaymentHistory.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
            No monthly contributions recorded under your account yet. Submit your first deposit below.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-lg max-h-64 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2 px-3 font-medium">Billing Month</th>
                  <th className="py-2 px-3 font-medium">Submitted</th>
                  <th className="py-2 px-3 font-medium">Channel &amp; Ref</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Amount</th>
                  <th className="py-2 px-3 font-medium">Verification Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {personalPaymentHistory.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {formatBillingMonth(item.billingMonth)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(item.submittedAt)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.providerName}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span className="uppercase text-slate-500 dark:text-slate-400">{item.channel}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {item.decryptedDetails?.referenceId || item.maskedReference}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusText status={item.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                      {formatMoney(item.amount, ccy)}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {item.reviewNote
                        ? item.reviewNote
                        : item.reviewerName
                          ? `Verified by ${item.reviewerName}`
                          : `Hash ${shortHash(item.entryHash)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.section>
  );
}
