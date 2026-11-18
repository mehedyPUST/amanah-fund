'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { MemberSummary, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, isPdfFileUrl } from '../utils/format.ts';

import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';

type RegModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      inputLabel?: string;
      inputPlaceholder?: string;
      inputRequired?: boolean;
      initialInputValue?: string;
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

type QueueFilter = 'all' | 'pending_approval' | 'pending_activation';

interface PendingRegistrationsViewProps {
  user: PublicUser;
  onRefresh: () => Promise<void>;
}

export function PendingRegistrationsView({ user, onRefresh }: PendingRegistrationsViewProps) {
  const t = useTranslations('Admin.approving');
  const tAdmin = useTranslations('Admin');
  const tCommon = useTranslations('Common');
  const isAdmin = user.role === 'admin';

  const [registrations, setRegistrations] = useState<MemberSummary[]>([]);
  const [suggestedNextMemberCode, setSuggestedNextMemberCode] = useState('AC002');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [busyAction, setBusyAction] = useState<{
    id: string;
    type: 'approve' | 'reject' | 'resend';
  } | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [revealedOtps, setRevealedOtps] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [modal, setModal] = useState<RegModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  function showNotice(
    tone: 'emerald' | 'amber' | 'red' | 'slate',
    title: string,
    description: string,
    details?: ActionModalDetailItem[]
  ) {
    setModal({ mode: 'notice', tone, title, description, details });
  }

  async function handleCopyText(key: string, value: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => {
          setCopiedKey((prev) => (prev === key ? null : prev));
        }, 2000);
      }
    } catch {
      // ignore clipboard restrictions
    }
  }

  async function runConfirmedModal(inputValue: string) {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
    } catch (err) {
      showNotice(
        'red',
        t('actionFailedTitle'),
        err instanceof Error ? err.message : t('unexpectedError')
      );
    } finally {
      setModalBusy(false);
    }
  }

  const loadPendingRegistrations = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getPendingRegistrations();
      setRegistrations(res.registrations);
      if (res.suggestedNextMemberCode) {
        setSuggestedNextMemberCode(res.suggestedNextMemberCode);
      }
    } catch (err) {
      showNotice(
        'red',
        t('loadFailedTitle'),
        err instanceof Error ? err.message : t('loadFailedDesc')
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, t]);

  useEffect(() => {
    void loadPendingRegistrations();
  }, [loadPendingRegistrations]);

  function confirmApprove(member: MemberSummary) {
    const reg = member.registrationDetails;
    const defaultMemberCode = suggestedNextMemberCode || 'AC002';
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('approveConfirmTitle', { name: member.name }),
      description: t('approveConfirmDesc'),
      details: [
        { label: t('applicant'), value: member.name },
        { label: t('email'), value: member.email },
        ...(reg?.nid ? [{ label: t('nid'), value: reg.nid }] : []),
        ...(reg?.mobile ? [{ label: t('mobile'), value: reg.mobile }] : []),
      ],
      inputLabel: t('memberIdInputLabel'),
      inputPlaceholder: t('memberIdInputPlaceholder'),
      inputRequired: true,
      initialInputValue: defaultMemberCode,
      confirmLabel: t('generateAndSend'),
      run: async (memberCodeInput: string) => {
        setBusyAction({ id: member.id, type: 'approve' });
        try {
          const res = await api.issueMemberActivation(member.id, {
            memberCode: memberCodeInput.trim() || undefined,
          });
          setRegistrations(res.registrations);
          if (res.suggestedNextMemberCode) {
            setSuggestedNextMemberCode(res.suggestedNextMemberCode);
          }
          setRevealedOtps((prev) => ({ ...prev, [member.id]: true }));
          await onRefresh();
          showNotice(
            'emerald',
            t('codesIssuedTitle'),
            res.emailSent
              ? t('codesIssuedEmailSent', {
                  code: res.memberCode,
                  name: member.name,
                  email: member.email,
                })
              : t('codesIssuedEmailFailed', {
                  code: res.memberCode,
                  name: member.name,
                  reason: res.emailReason ? ` (${res.emailReason})` : '',
                }),
            [
              { label: t('applicant'), value: member.name },
              { label: tAdmin('officialMemberId'), value: res.memberCode },
              { label: tAdmin('activationOtp'), value: res.otp },
              {
                label: t('emailDispatch'),
                value: res.emailSent
                  ? t('sentToEmail', { email: member.email })
                  : t('notDeliveredPhone'),
              },
            ]
          );
        } finally {
          setBusyAction(null);
        }
      },
    });
  }

  async function handleResendEmail(member: MemberSummary) {
    setBusyAction({ id: member.id, type: 'resend' });
    try {
      const res = await api.resendActivationEmail(member.id);
      setRegistrations(res.registrations);
      await onRefresh();
      showNotice(
        res.emailSent ? 'emerald' : 'amber',
        res.emailSent ? t('emailResentTitle') : t('emailDeliveryFailedTitle'),
        res.emailSent
          ? t('emailResentDesc', { code: res.memberCode, email: member.email })
          : t('emailResendFailedDesc', {
              email: member.email,
              reason: res.emailReason ? ` (${res.emailReason})` : '',
            }),
        [
          { label: tAdmin('officialMemberId'), value: res.memberCode },
          { label: tAdmin('activationOtp'), value: res.otp },
        ]
      );
    } catch (err) {
      showNotice(
        'red',
        t('resendFailedTitle'),
        err instanceof Error ? err.message : t('resendFailedDesc')
      );
    } finally {
      setBusyAction(null);
    }
  }

  function confirmReject(member: MemberSummary) {
    const reg = member.registrationDetails;
    const isAwaitingActivation = member.status === 'pending_activation';
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: isAwaitingActivation
        ? t('cancelUnactivatedTitle', { name: member.name })
        : t('rejectAppTitle', { name: member.name }),
      description: isAwaitingActivation ? t('cancelUnactivatedDesc') : t('rejectAppDesc'),
      details: [
        { label: t('applicant'), value: `${member.name} (${member.memberCode})` },
        { label: t('email'), value: member.email },
        ...(reg?.nid ? [{ label: t('nid'), value: reg.nid }] : []),
      ],
      confirmLabel: isAwaitingActivation ? t('removeUnactivatedBtn') : t('rejectAppBtn'),
      run: async () => {
        setBusyAction({ id: member.id, type: 'reject' });
        try {
          await api.declinePendingMember(member.id);
          setRegistrations((prev) => prev.filter((item) => item.id !== member.id));
          await onRefresh();
          showNotice(
            'amber',
            isAwaitingActivation ? t('unactivatedRemovedTitle') : t('regRejectedTitle'),
            t('removedAccountDesc', { name: member.name, code: member.memberCode })
          );
        } finally {
          setBusyAction(null);
        }
      },
    });
  }

  const pendingReviewCount = useMemo(
    () => registrations.filter((m) => m.status === 'pending_approval').length,
    [registrations]
  );
  const awaitingActivationCount = useMemo(
    () => registrations.filter((m) => m.status === 'pending_activation').length,
    [registrations]
  );

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return registrations.filter((m) => {
      if (queueFilter !== 'all' && m.status !== queueFilter) return false;
      if (!q) return true;
      const reg = m.registrationDetails;
      const act = m.activationCredentials;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        (act?.memberCode || '').toLowerCase().includes(q) ||
        (act?.otp || '').includes(q) ||
        (reg?.nid || '').toLowerCase().includes(q) ||
        (reg?.mobile || '').toLowerCase().includes(q) ||
        (reg?.referenceMemberName || '').toLowerCase().includes(q) ||
        (reg?.occupation || '').toLowerCase().includes(q) ||
        (reg?.companyOrganization || '').toLowerCase().includes(q) ||
        (reg?.presentAddress || '').toLowerCase().includes(q) ||
        (reg?.permanentAddress || '').toLowerCase().includes(q) ||
        (reg?.nominees || []).some(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.nidOrBirthReg.toLowerCase().includes(q) ||
            (n.mobile || '').toLowerCase().includes(q) ||
            n.relation.toLowerCase().includes(q)
        )
      );
    });
  }, [registrations, searchQuery, queueFilter]);

  if (!isAdmin) {
    return (
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('adminRequiredTitle')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('adminRequiredDesc')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Header & Controls */}
      <section className="amanah-card-amber border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-xs transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('heading')}{' '}
              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                ({registrations.length})
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('subtitle')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 shrink-0 w-full lg:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAria')}
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 pl-8 pr-3 py-2 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadPendingRegistrations()}
              disabled={loading}
              className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{t('refreshQueue')}</span>
            </button>
          </div>
        </div>

        {/* Segmented Queue Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800">
          {(
            [
              { id: 'all', label: t('filterAll'), count: registrations.length },
              { id: 'pending_approval', label: t('filterPending'), count: pendingReviewCount },
              {
                id: 'pending_activation',
                label: t('filterAwaiting'),
                count: awaitingActivationCount,
              },
            ] as const
          ).map((tab) => {
            const active = queueFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQueueFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                    : 'bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono tabular-nums opacity-80">({tab.count})</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Loading / Empty / Registration Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <div key={item} className="amanah-card-violet border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton width={56} height={56} borderRadius={8} />
                  <div>
                    <Skeleton width={180} height={18} />
                    <Skeleton width={240} height={12} className="mt-1" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton width={90} height={34} borderRadius={8} />
                  <Skeleton width={90} height={34} borderRadius={8} />
                </div>
              </div>
              <Skeleton height={110} />
            </div>
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <section className="amanah-card-emerald border rounded-2xl p-8 text-center space-y-2 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('emptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('emptyDesc')}
          </p>
        </section>
      ) : filteredRegistrations.length === 0 ? (
        <section className="amanah-card-violet border rounded-2xl p-8 text-center space-y-2 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('noMatchTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('noMatchDesc')}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setQueueFilter('all');
            }}
            className="mt-2 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('resetFilters')}
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {filteredRegistrations.map((applicant, idx) => {
            const reg = applicant.registrationDetails;
            const act = applicant.activationCredentials;
            const isAwaitingActivation = applicant.status === 'pending_activation';
            const photoUrl = reg?.photoUrl || applicant.photoUrl;
            const agreementUrl = reg?.agreementPhotoUrl;
            const isBusy = busyAction?.id === applicant.id;
            const photoKey = `photo-${applicant.id}`;
            const agreementKey = `agreement-${applicant.id}`;
            const otpVisible = Boolean(revealedOtps[applicant.id]);
            const cardHueClass = isAwaitingActivation
              ? 'amanah-card-violet'
              : idx % 2 === 0
                ? 'amanah-card-emerald'
                : 'amanah-card-amber';

            return (
              <article
                key={applicant.id}
                className={`${cardHueClass} border rounded-2xl overflow-hidden shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`}
              >
                {/* Applicant Header & Primary Approve / Reject Actions */}
                <div className="p-3.5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-4 min-w-0">
                    {photoUrl && !brokenImages[photoKey] ? (
                      <a
                        href={photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={t('openPhotoTitle')}
                        className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800 block"
                      >
                        <img
                          src={photoUrl}
                          alt={t('portraitAlt', { name: applicant.name })}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => ({ ...prev, [photoKey]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                        {applicant.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                          {applicant.name}
                        </h3>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          ·
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {act?.memberCode || applicant.memberCode}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          ·
                        </span>
                        {isAwaitingActivation ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('awaitingMemberActivation')}</span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {t('pendingAdminReview')}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <span>{applicant.email}</span>
                        {(applicant.authProvider === 'google' ||
                          applicant.authProvider === 'both') && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans font-medium text-emerald-700 dark:text-emerald-400">
                              {t('googleVerified')}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{t('appliedAt', { date: formatDateTime(applicant.joinedAt) })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:flex items-center gap-2.5 shrink-0 w-full md:w-auto">
                    <button
                      type="button"
                      disabled={isBusy || modalBusy}
                      onClick={() => confirmReject(applicant)}
                      className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isBusy && busyAction?.type === 'reject'
                          ? t('removing')
                          : isAwaitingActivation
                            ? t('remove')
                            : t('reject')}
                      </span>
                    </button>

                    {isAwaitingActivation ? (
                      <button
                        type="button"
                        disabled={isBusy || modalBusy}
                        onClick={() => void handleResendEmail(applicant)}
                        className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white shadow-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200"
                      >
                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {isBusy && busyAction?.type === 'resend' ? t('sending') : t('resendEmail')}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy || modalBusy}
                        onClick={() => confirmApprove(applicant)}
                        className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {isBusy && busyAction?.type === 'approve'
                            ? t('issuingCodes')
                            : t('approveIssueCodes')}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Admin Activation Credentials Lookup (Phone Support & Email Status) */}
                {isAwaitingActivation && act && (
                  <div className="px-3.5 sm:px-6 py-4 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-indigo-200/70 dark:border-indigo-900/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                        <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t('codesLookupHeader')}</span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {t('issuedBy', {
                          name: act.issuedByName,
                          date: formatDateTime(act.issuedAt),
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">
                            {tAdmin('officialMemberId')}
                          </div>
                          <div className="font-mono tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
                            {act.memberCode}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyText(`code-${applicant.id}`, act.memberCode)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                          title={tAdmin('copyMemberId')}
                        >
                          {copiedKey === `code-${applicant.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">
                            {tAdmin('activationOtp')}
                          </div>
                          <div className="font-mono tabular-nums text-sm font-bold tracking-[0.22em] text-indigo-700 dark:text-indigo-300 mt-0.5">
                            {act.otp ? (otpVisible ? act.otp : '••••••') : t('unavailable')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {act.otp && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedOtps((prev) => ({
                                    ...prev,
                                    [applicant.id]: !prev[applicant.id],
                                  }))
                                }
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title={otpVisible ? t('hideOtp') : t('revealOtp')}
                              >
                                {otpVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyText(`otp-${applicant.id}`, act.otp)}
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title={t('copyOtpTitle')}
                              >
                                {copiedKey === `otp-${applicant.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 flex flex-col justify-between gap-1.5">
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          {act.emailSent ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {t('emailSentLabel')}
                              {act.emailSentAt ? ` · ${formatDateTime(act.emailSentAt)}` : ''}
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {t('emailNotDelivered')}
                              {act.emailError ? ` (${act.emailError})` : ''}
                            </span>
                          )}
                        </div>
                        {act.otp && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyText(
                                `both-${applicant.id}`,
                                t('copyBothTemplate', { code: act.memberCode, otp: act.otp })
                              )
                            }
                            className="w-full py-1.5 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {copiedKey === `both-${applicant.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>{t('copiedBoth')}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>{t('copyBothPhone')}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Full KYC Details & Verification Attachments (Flat Grid, Hairline Dividers) */}
                <div className="p-3.5 sm:p-6 grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6">
                  {reg ? (
                    <dl className="xl:col-span-8 grid grid-cols-2 lg:grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-4 text-xs">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">{t('nid')}</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white break-all">
                          {reg.nid}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">{t('mobileNumber')}</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {reg.mobile}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">{t('dob')}</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {reg.dateOfBirth}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          {t('referenceMember')}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.referenceMemberName}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">{t('occupation')}</dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.occupation}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          {t('companyOrg')}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.companyOrganization}
                        </dd>
                      </div>

                      <div className="col-span-2 lg:col-span-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">{t('presentAddress')}</dt>
                          <dd className="mt-1 text-slate-900 dark:text-slate-100 leading-relaxed">
                            {reg.presentAddress}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">{t('permanentAddress')}</dt>
                          <dd className="mt-1 text-slate-900 dark:text-slate-100 leading-relaxed">
                            {reg.permanentAddress}
                          </dd>
                        </div>
                      </div>

                      {reg.nominees && reg.nominees.length > 0 && (
                        <div className="col-span-2 lg:col-span-3">
                          <NomineeDetailsList nominees={reg.nominees} />
                        </div>
                      )}
                    </dl>
                  ) : (
                    <div className="xl:col-span-8 text-xs text-slate-500 dark:text-slate-400 flex items-center">
                      {t('noKycAttached')}
                    </div>
                  )}

                  {/* Document Verification Previews */}
                  <div className="xl:col-span-4 xl:border-l xl:border-slate-100 dark:xl:border-slate-800 xl:pl-6 grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="text-slate-500 dark:text-slate-400 font-medium">
                        {t('applicantPhoto')}
                      </div>
                      {photoUrl && !brokenImages[photoKey] ? (
                        <a
                          href={photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 aspect-[4/3]"
                        >
                          <img
                            src={photoUrl}
                            alt={t('verificationPortraitAlt', { name: applicant.name })}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [photoKey]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-900/75 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </span>
                        </a>
                      ) : (
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-center p-2 text-[11px] text-slate-500 dark:text-slate-400">
                          {t('noPhoto')}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-slate-500 dark:text-slate-400 font-medium">
                        {t('agreementPaper')}
                      </div>
                      {agreementUrl && !brokenImages[agreementKey] ? (
                        isPdfFileUrl(agreementUrl) ? (
                          <a
                            href={agreementUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group aspect-[4/3] rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/30 flex flex-col items-center justify-center gap-1.5 p-2 text-center hover:border-emerald-500 transition-colors"
                          >
                            <FileText
                              className="w-5 h-5 text-emerald-700 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1">
                              <span>{t('viewPdf')}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </span>
                          </a>
                        ) : (
                          <a
                            href={agreementUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 aspect-[4/3]"
                          >
                            <img
                              src={agreementUrl}
                              alt={t('agreementAlt', { name: applicant.name })}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenImages((prev) => ({ ...prev, [agreementKey]: true }))
                              }
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-900/75 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </span>
                          </a>
                        )
                      ) : (
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center p-2 text-[11px] text-slate-500 dark:text-slate-400 gap-1">
                          <FileText
                            className="w-4 h-4 text-slate-400 dark:text-slate-500"
                            aria-hidden="true"
                          />
                          <span>{t('optionalNone')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        initialInputValue={modal?.mode === 'confirm' ? modal.initialInputValue : ''}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
