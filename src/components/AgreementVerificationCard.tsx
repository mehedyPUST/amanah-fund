'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { PublicAgreementVerification } from '../types/coop.ts';
import { formatShortDate } from '../utils/format.ts';
import { AmanahLogo } from './AmanahLogo.tsx';

interface AgreementVerificationCardProps {
  verification: PublicAgreementVerification | null;
  projectHeading: string;
  searchedToken?: string;
}

type MilestoneVisualState = 'completed' | 'current' | 'upcoming' | 'suspended';

interface VerificationMilestone {
  id: 'submitted' | 'approved' | 'active';
  label: string;
  caption: string;
  state: MilestoneVisualState;
  isMonoCaption: boolean;
}

function getMilestoneIcon(
  id: VerificationMilestone['id'],
  state: MilestoneVisualState
) {
  if (state === 'suspended') {
    return <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  if (id === 'submitted') {
    return <FileCheck2 className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  if (id === 'approved') {
    return state === 'completed' ? (
      <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
    ) : (
      <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
    );
  }
  return state === 'completed' ? (
    <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
  ) : (
    <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
  );
}

function getMilestoneNodeClasses(state: MilestoneVisualState): string {
  switch (state) {
    case 'completed':
      return 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400';
    case 'current':
      return 'border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400';
    case 'suspended':
      return 'border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400';
    case 'upcoming':
    default:
      return 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500';
  }
}

export function AgreementVerificationCard({
  verification,
  projectHeading,
  searchedToken,
}: AgreementVerificationCardProps) {
  const t = useTranslations('Verify');
  const router = useRouter();
  const [query, setQuery] = useState(searchedToken || '');

  const displayProjectHeading = verification?.projectHeading || projectHeading;

  function handleLookupSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  const verifiedHint = verification
    ? verification.verified
      ? t('verifiedTrueHint')
      : verification.status === 'pending_activation'
        ? t('verifiedFalseAwaitingActivation')
        : verification.status === 'pending_approval'
          ? t('verifiedFalsePendingReview')
          : t('verifiedFalseSuspended')
    : '';

  const activeHint = verification
    ? verification.active
      ? t('activeTrueHint')
      : verification.status === 'suspended'
        ? t('activeFalseSuspended')
        : t('activeFalsePending')
    : '';

  const isApprovedReached = Boolean(
    verification &&
      (verification.approvalDate ||
        verification.status === 'pending_activation' ||
        verification.status === 'active' ||
        (verification.status === 'suspended' && verification.verified))
  );

  const milestones: VerificationMilestone[] = verification
    ? [
        {
          id: 'submitted',
          label: t('milestoneSubmitted'),
          caption: formatShortDate(verification.joiningDate),
          state: 'completed',
          isMonoCaption: true,
        },
        {
          id: 'approved',
          label: t('milestoneApproved'),
          caption: verification.approvalDate
            ? formatShortDate(verification.approvalDate)
            : isApprovedReached
              ? formatShortDate(verification.joiningDate)
              : t('milestonePendingReview'),
          state: isApprovedReached ? 'completed' : 'current',
          isMonoCaption: Boolean(verification.approvalDate || isApprovedReached),
        },
        {
          id: 'active',
          label: t('milestoneActive'),
          caption:
            verification.status === 'active'
              ? formatShortDate(
                  verification.activationDate ||
                    verification.approvalDate ||
                    verification.joiningDate
                )
              : verification.status === 'suspended'
                ? t('milestoneSuspended')
                : verification.status === 'pending_activation'
                  ? t('milestoneAwaitingOtp')
                  : t('milestoneUpcoming'),
          state:
            verification.status === 'active'
              ? 'completed'
              : verification.status === 'suspended'
                ? 'suspended'
                : verification.status === 'pending_activation'
                  ? 'current'
                  : 'upcoming',
          isMonoCaption: verification.status === 'active',
        },
      ]
    : [];

  return (
    <section className="py-4 sm:py-8">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('backToHome')}</span>
          </Link>

          <span className="text-[11px] font-medium tracking-wider uppercase text-slate-500 dark:text-slate-400">
            {t('eyebrow')}
          </span>
        </div>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
        >
          <div className="h-1.5 w-full bg-emerald-700 dark:bg-emerald-600" aria-hidden="true" />

          {/* Project Heading Header */}
          <div className="px-5 sm:px-7 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <AmanahLogo size="md" variant="mark" decorative className="shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  {t('fieldProjectHeading')}
                </p>
                <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-snug break-words">
                  {displayProjectHeading}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('credentialSubtitle')}
                </p>
              </div>
            </div>

            {verification && (
              <div className="shrink-0 flex items-center gap-1.5 text-xs font-semibold pt-0.5">
                {verification.verified ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{t('verifiedTrue')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{t('verifiedFalse')}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {verification ? (
            <>
              {/* Membership Milestone Timeline */}
              <div
                aria-label={t('timelineHeading')}
                className="px-5 sm:px-7 py-4 bg-slate-50/70 dark:bg-slate-950/35 border-b border-slate-100 dark:border-slate-800"
              >
                <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
                  {t('timelineHeading')}
                </p>
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-0 sm:gap-2">
                  {milestones.map((step, idx) => {
                    const isLast = idx === milestones.length - 1;
                    const nextStep = milestones[idx + 1];
                    const nextConnectorActive =
                      step.state === 'completed' &&
                      nextStep &&
                      (nextStep.state === 'completed' || nextStep.state === 'current');

                    return (
                      <li
                        key={step.id}
                        className={`relative flex sm:flex-col items-start gap-3 sm:gap-2 ${
                          isLast ? 'pb-0' : 'pb-4 sm:pb-0'
                        }`}
                      >
                        {/* Top row: Icon Node + Horizontal Desktop Connector */}
                        <div className="flex sm:w-full items-center gap-2 shrink-0">
                          <div
                            className={`relative z-10 w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${getMilestoneNodeClasses(
                              step.state
                            )}`}
                          >
                            {getMilestoneIcon(step.id, step.state)}
                          </div>
                          {!isLast && (
                            <div
                              aria-hidden="true"
                              className={`hidden sm:block h-px flex-1 ${
                                nextConnectorActive
                                  ? 'bg-emerald-300 dark:bg-emerald-800'
                                  : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                          )}
                        </div>

                        {/* Mobile Vertical Connector */}
                        {!isLast && (
                          <div
                            aria-hidden="true"
                            className={`sm:hidden absolute left-4 top-8 bottom-0 w-px -translate-x-1/2 ${
                              nextConnectorActive
                                ? 'bg-emerald-300 dark:bg-emerald-800'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        )}

                        {/* Step Label & Date / Status */}
                        <div className="min-w-0 pt-0.5 sm:pt-0">
                          <div
                            className={`text-xs font-semibold leading-snug ${
                              step.state === 'upcoming'
                                ? 'text-slate-500 dark:text-slate-400'
                                : step.state === 'suspended'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {step.label}
                          </div>
                          <div
                            className={`mt-0.5 text-[11px] leading-snug ${
                              step.isMonoCaption ? 'font-mono tabular-nums' : ''
                            } ${
                              step.state === 'completed'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : step.state === 'current'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : step.state === 'suspended'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {step.caption}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="px-5 sm:px-7 py-2">
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {/* Member Name */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-baseline">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('fieldName')}
                  </dt>
                  <dd className="sm:col-span-7 text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 break-words">
                    <div>{verification.name}</div>
                    {verification.nameBn && (
                      <div className="mt-0.5 text-xs font-normal text-slate-600 dark:text-slate-400">
                        {verification.nameBn}
                      </div>
                    )}
                  </dd>
                </div>

                {/* Member ID */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-baseline">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('fieldMemberId')}
                  </dt>
                  <dd className="sm:col-span-7 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {verification.memberCode}
                  </dd>
                </div>

                {/* Joining Date */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-baseline">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('fieldJoiningDate')}
                  </dt>
                  <dd className="sm:col-span-7 text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatShortDate(verification.joiningDate)}
                  </dd>
                </div>

                {/* Approval Date */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-baseline">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('fieldApprovalDate')}
                  </dt>
                  <dd className="sm:col-span-7 text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {verification.approvalDate
                      ? formatShortDate(verification.approvalDate)
                      : t('pendingApprovalValue')}
                  </dd>
                </div>

                {/* Verified Status */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-start">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400 sm:pt-0.5">
                    {t('fieldVerified')}
                  </dt>
                  <dd className="sm:col-span-7">
                    <div
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                        verification.verified
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {verification.verified ? (
                        <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {verification.verified ? t('verifiedTrue') : t('verifiedFalse')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {verifiedHint}
                    </p>
                  </dd>
                </div>

                {/* Active Status */}
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4 items-start">
                  <dt className="sm:col-span-5 text-xs font-medium text-slate-500 dark:text-slate-400 sm:pt-0.5">
                    {t('fieldActive')}
                  </dt>
                  <dd className="sm:col-span-7">
                    <div
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                        verification.active
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : verification.status === 'suspended'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {verification.active ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      )}
                      <span>{verification.active ? t('activeTrue') : t('activeFalse')}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {activeHint}
                    </p>
                  </dd>
                </div>
              </dl>

              {verification.agreementId && (
                <div className="pt-3 pb-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {t('agreementRef', { id: verification.agreementId })}
                </div>
              )}
            </div>
            </>
          ) : searchedToken ? (
            <div className="px-5 sm:px-7 py-6 space-y-2">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('notFoundTitle')}</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('notFoundDesc', { token: searchedToken })}
              </p>
            </div>
          ) : (
            <div className="px-5 sm:px-7 py-6 space-y-1.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('lookupTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('lookupSubtitle')}
              </p>
            </div>
          )}

          {/* Lookup Bar & Privacy Footer */}
          <div className="px-5 sm:px-7 py-4 bg-slate-50/75 dark:bg-slate-950/45 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <form onSubmit={handleLookupSubmit} className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="verify-token-input" className="sr-only">
                {t('lookupLabel')}
              </label>
              <input
                id="verify-token-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('lookupPlaceholder')}
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('lookupButton')}</span>
              </button>
            </form>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('privacyNote')}
            </p>
          </div>
        </motion.article>
      </div>
    </section>
  );
}
