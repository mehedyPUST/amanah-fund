'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import type {
  FundConfig,
  MemberSummary,
  ProfileChangeRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { downloadMembershipApplicationPdf } from '../utils/applicationFormPdf.ts';
import { formatDateTime, isPdfFileUrl } from '../utils/format.ts';
import { formatProfileChangeEntries } from '../utils/profileChanges.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { AdminUserManagementPanel } from './AdminUserManagementPanel.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';
import { PendingRegistrationsView } from './PendingRegistrationsView.tsx';
import { ProfileChangeDiffPreview } from './ProfileChangeDiffPreview.tsx';

type RegistryModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      customContent?: ReactNode;
      maxWidthClass?: string;
      confirmLabel: string;
      inputLabel?: string;
      inputPlaceholder?: string;
      inputRequired?: boolean;
      inputMultiline?: boolean;
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

function suggestNextAmanahMemberId(list: MemberSummary[]): string {
  let maxNum = 0;
  for (const m of list) {
    if (m.status === 'pending_approval') continue;
    const code = m.activationCredentials?.memberCode || m.memberCode;
    const match = code.match(/(?:AMANAH-)?AC-?(\d+)$/i) || code.match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `AC${String(Math.max(1, maxNum + 1)).padStart(3, '0')}`;
}

interface MemberRegistrySectionProps {
  user: PublicUser;
  config: FundConfig | null;
  onRefresh: () => Promise<void>;
}

export function MemberRegistrySection({
  user,
  config,
  onRefresh,
}: MemberRegistrySectionProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('Admin.memberRegistry');
  const tCommon = useTranslations('Common');
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isAdmin = user.role === 'admin';

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [profileRequests, setProfileRequests] = useState<ProfileChangeRequest[]>([]);
  const [profileBusyId, setProfileBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspectingMember, setInspectingMember] = useState<MemberSummary | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [modal, setModal] = useState<RegistryModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  async function handleDownloadInspectingPdf(member: MemberSummary) {
    if (!member.registrationDetails || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadMembershipApplicationPdf({
        applicantName: member.name,
        email: member.email,
        memberCode: member.activationCredentials?.memberCode || member.memberCode,
        status: member.status,
        submittedAt: member.joinedAt,
        fundName: config?.fundName || undefined,
        registrationDetails: member.registrationDetails,
        locale,
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

  function showNotice(
    tone: 'emerald' | 'amber' | 'red' | 'slate',
    title: string,
    description: string,
    details?: ActionModalDetailItem[]
  ) {
    setModal({ mode: 'notice', tone, title, description, details });
  }

  async function runConfirmedModal(inputValue: string) {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
    } catch (err) {
      showNotice(
        'red',
        tCommon('actionCouldNotComplete'),
        err instanceof Error ? err.message : tCommon('unexpectedError')
      );
    } finally {
      setModalBusy(false);
    }
  }

  const tRef = useRef(t);
  tRef.current = t;

  const loadMembers = useCallback(async () => {
    if (!isStaff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, reqRes] = await Promise.all([
        api.getMembers(),
        isAdmin
          ? api.getProfileChangeRequests().catch(() => ({ requests: [] as ProfileChangeRequest[] }))
          : Promise.resolve({ requests: [] as ProfileChangeRequest[] }),
      ]);
      setMembers(res.members);
      setProfileRequests(reqRes.requests);
    } catch (err) {
      showNotice(
        'red',
        tRef.current('loadFailedTitle'),
        err instanceof Error ? err.message : tRef.current('loadFailedDesc')
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isStaff]);

  useEffect(() => {
    void loadMembers();
    const handleGlobalRefresh = () => {
      void loadMembers();
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [loadMembers]);

  function confirmApprovePendingMember(member: MemberSummary) {
    const suggestedCode = suggestNextAmanahMemberId(members);
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('approveTitle', { name: member.name }),
      description: t('approveDesc'),
      details: [
        { label: t('detailApplicant'), value: member.name },
        { label: t('detailEmail'), value: member.email },
      ],
      inputLabel: t('inputMemberIdLabel'),
      inputPlaceholder: t('inputMemberIdPh'),
      inputRequired: true,
      initialInputValue: suggestedCode,
      confirmLabel: t('approveConfirmBtn'),
      run: async (memberCodeInput: string) => {
        const res = await api.issueMemberActivation(member.id, {
          memberCode: memberCodeInput.trim() || undefined,
        });
        setMembers(res.members);
        const updated = res.members.find((item) => item.id === member.id) || null;
        setInspectingMember((prev) => (prev?.id === member.id ? updated : prev));
        await Promise.all([onRefresh(), loadMembers()]);
        showNotice(
          'emerald',
          t('issuedTitle'),
          res.emailSent
            ? t('issuedEmailDesc', {
                code: res.memberCode,
                name: member.name,
                email: member.email,
              })
            : t('issuedNoEmailDesc', {
                code: res.memberCode,
                name: member.name,
                reason: res.emailReason ? ` (${res.emailReason})` : '',
              }),
          [
            { label: t('detailApplicant'), value: member.name },
            { label: t('detailOfficialId'), value: res.memberCode },
            { label: t('detailOtp'), value: t('otpPrivateEmailOnly') },
            {
              label: t('detailDispatch'),
              value: res.emailSent ? t('sentToEmail', { email: member.email }) : t('notDeliveredPhoneReady'),
            },
          ]
        );
      },
    });
  }

  async function handleResendActivation(member: MemberSummary) {
    setModalBusy(true);
    try {
      const res = await api.resendActivationEmail(member.id);
      setMembers(res.members);
      const updated = res.members.find((item) => item.id === member.id) || null;
      setInspectingMember((prev) => (prev?.id === member.id ? updated : prev));
      await Promise.all([onRefresh(), loadMembers()]);
      showNotice(
        res.emailSent ? 'emerald' : 'amber',
        res.emailSent ? t('emailResentTitle') : t('emailFailedTitle'),
        res.emailSent
          ? t('resentDesc', { code: res.memberCode, email: member.email })
          : t('resendFailedDesc', {
              email: member.email,
              reason: res.emailReason ? ` (${res.emailReason})` : '',
            }),
        [
          { label: t('detailOfficialId'), value: res.memberCode },
          { label: t('detailOtp'), value: t('otpPrivateEmailOnly') },
        ]
      );
    } catch (err) {
      showNotice(
        'red',
        t('resendFailedTitle'),
        err instanceof Error ? err.message : t('resendFailedFallback')
      );
    } finally {
      setModalBusy(false);
    }
  }

  function confirmDeclinePendingMember(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('declineTitle', { name: member.name }),
      description: t('declineDesc'),
      details: [
        { label: t('detailApplicant'), value: `${member.name} (${member.memberCode})` },
        { label: t('detailEmail'), value: member.email },
      ],
      confirmLabel: t('declineConfirmBtn'),
      run: async () => {
        const res = await api.declinePendingMember(member.id);
        setMembers(res.members);
        setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
        await Promise.all([onRefresh(), loadMembers()]);
        showNotice(
          'amber',
          t('declinedNoticeTitle'),
          t('declinedNoticeDesc', { name: member.name, code: member.memberCode })
        );
      },
    });
  }

  function confirmProfileChangeReview(
    req: ProfileChangeRequest,
    decision: 'approved' | 'rejected'
  ) {
    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        maxWidthClass: 'max-w-3xl',
        title: t('approveProfileTitle', { name: req.memberName }),
        description: t('approveProfileDesc'),
        customContent: <ProfileChangeDiffPreview request={req} />,
        confirmLabel: t('approveProfileConfirm'),
        run: async () => {
          setProfileBusyId(req.id);
          try {
            await api.reviewProfileChangeRequest(req.id, 'approved');
            await Promise.all([onRefresh(), loadMembers()]);
            showNotice(
              'emerald',
              t('profileApprovedTitle'),
              t('profileApprovedDesc', { name: req.memberName })
            );
          } finally {
            setProfileBusyId(null);
          }
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        maxWidthClass: 'max-w-3xl',
        title: t('declineProfileTitle', { name: req.memberName }),
        description: t('declineProfileDesc'),
        customContent: <ProfileChangeDiffPreview request={req} />,
        inputLabel: t('declineProfileInputLabel'),
        inputPlaceholder: t('declineProfileInputPh'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('declineProfileConfirm'),
        run: async (note) => {
          setProfileBusyId(req.id);
          try {
            await api.reviewProfileChangeRequest(req.id, 'rejected', note.trim());
            await Promise.all([onRefresh(), loadMembers()]);
            showNotice(
              'amber',
              t('profileDeclinedTitle'),
              t('profileDeclinedDesc', { name: req.memberName })
            );
          } finally {
            setProfileBusyId(null);
          }
        },
      });
    }
  }

  const pendingCount = members.filter((m) => m.status === 'pending_approval').length;
  const awaitingActivationCount = members.filter((m) => m.status === 'pending_activation').length;
  const pendingProfileRequests = profileRequests.filter((r) => r.status === 'pending');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {loading && members.length === 0 ? (
              <Skeleton width={250} height={22} />
            ) : (
              t('heading', {
                total: members.length,
                pending: pendingCount,
                awaiting: awaitingActivationCount,
              })
            )}
          </h2>
        </div>
      </section>

      <div className="space-y-6">
          {isAdmin && pendingProfileRequests.length > 0 && (
            <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-amber-200/80 dark:border-amber-900/60 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t('queueEyebrow')}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {t('queueTitle', { count: pendingProfileRequests.length })}
                </h3>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
                {pendingProfileRequests.map((req) => (
                  <div key={req.id} className="p-4 space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {req.memberName} ({req.memberCode}) ·{' '}
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {formatDateTime(req.requestedAt)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                          {formatProfileChangeEntries(req.requestedChanges).map((item) => (
                            <div key={item.key}>
                              <span className="font-mono text-slate-500 dark:text-slate-400">{item.label}:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-white">
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full lg:w-auto">
                        <button
                          type="button"
                          disabled={profileBusyId === req.id || modalBusy}
                          onClick={() => confirmProfileChangeReview(req, 'rejected')}
                          className="min-h-[44px] sm:min-h-0 justify-center px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-all duration-150 active:scale-[0.98]"
                        >
                          {t('declineBtn')}
                        </button>
                        <button
                          type="button"
                          disabled={profileBusyId === req.id || modalBusy}
                          onClick={() => confirmProfileChangeReview(req, 'approved')}
                          className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {t('approveUpdateBtn')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {isAdmin && (
            <PendingRegistrationsView
              user={user}
              onRefresh={async () => {
                await Promise.all([onRefresh(), loadMembers()]);
              }}
            />
          )}

          {isAdmin && (
            <AdminUserManagementPanel
              members={members}
              currentUser={user}
              config={config}
              loading={loading}
              onMembersUpdated={setMembers}
              onInspectMember={setInspectingMember}
              onRefreshAll={async () => {
                await Promise.all([onRefresh(), loadMembers()]);
              }}
            />
          )}
      </div>

      {/* Admin Inspection Modal: Full Applicant / Member Registration Details */}
      <AnimatePresence>
      {inspectingMember && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registry-member-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/80 dark:ring-white/10 rounded-2xl max-w-2xl w-full max-h-[92dvh] overflow-y-auto shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)]"
          >
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100/80 dark:border-slate-800/80 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="registry-member-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white truncate"
                >
                  {t('modalTitle', { name: inspectingMember.name })}
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                  {inspectingMember.memberCode} · {inspectingMember.email} ·{' '}
                  {t('appliedPrefix', { date: formatDateTime(inspectingMember.joinedAt) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                aria-label={t('closeModalAria')}
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 text-xs">
              {(() => {
                const reg = inspectingMember.registrationDetails;
                const act = inspectingMember.activationCredentials;
                const portrait = reg?.photoUrl || inspectingMember.photoUrl;
                return (
                  <>
                    {isAdmin && inspectingMember.status === 'pending_activation' && act && (
                      <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-teal-800 dark:text-teal-300">
                            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('phoneSupportHeading')}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {t('issuedAt', { date: formatDateTime(act.issuedAt) })}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {t('detailOfficialId')}
                            </div>
                            <div className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                              {act.memberCode}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-2">
                            <Lock
                              className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('detailOtp')}
                              </div>
                              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                                {t('otpPrivateEmailOnly')}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {t('applicantPhoto')}
                        </div>
                        {portrait ? (
                          <a
                            href={portrait}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[4/3]"
                          >
                            <img
                              src={portrait}
                              alt={`${inspectingMember.name} photo`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {t('noPhoto')}
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                              <span>{t('agreementPaper')}</span>
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              {t('encryptedJsonBadge')}
                            </span>
                          </div>
                          {reg ? (
                            <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                              {reg.digitalAgreement ? (
                                <>
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('agreementIdLabel')}: </span>
                                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                      {reg.digitalAgreement.agreementId}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400">{t('agreementSignedLabel')}: </span>
                                    <span className="font-mono">
                                      {formatDateTime(reg.digitalAgreement.signedAt)}
                                    </span>
                                  </div>
                                  {reg.digitalAgreement.activatedAt && (
                                    <div>
                                      <span className="text-slate-500 dark:text-slate-400">{t('agreementActivatedLabel')}: </span>
                                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                                        {formatDateTime(reg.digitalAgreement.activatedAt)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    SHA-256: {reg.digitalAgreement.sha256Hash.slice(0, 16).toUpperCase()}…
                                  </div>
                                </>
                              ) : (
                                <p className="leading-relaxed">{t('digitalAgreementVaultDesc')}</p>
                              )}
                            </div>
                          ) : (
                            <div className="text-slate-500 dark:text-slate-400">
                              {t('notProvidedOptional')}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {reg && (
                            <button
                              type="button"
                              disabled={downloadingPdf}
                              onClick={() => void handleDownloadInspectingPdf(inspectingMember)}
                              className="w-full py-2 px-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 transition-colors"
                            >
                              {downloadingPdf ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              <span>
                                {downloadingPdf ? t('generatingPdf') : t('downloadApplicationPdf')}
                              </span>
                            </button>
                          )}
                          {reg?.agreementPhotoUrl && (
                            <a
                              href={reg.agreementPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:underline inline-flex items-center justify-center gap-1"
                            >
                              <FileText className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {isPdfFileUrl(reg.agreementPhotoUrl)
                                  ? t('openAgreementPdf')
                                  : t('legacyAttachment')}
                              </span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {(reg?.nidFrontUrl || reg?.nidBackUrl) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {t('nidFront')}
                          </div>
                          {reg.nidFrontUrl ? (
                            <a
                              href={reg.nidFrontUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[16/10]"
                            >
                              <img
                                src={reg.nidFrontUrl}
                                alt={`${inspectingMember.name} ${t('nidFront')}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="h-28 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                              {t('notUploaded')}
                            </div>
                          )}
                        </div>

                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {t('nidBack')}
                          </div>
                          {reg.nidBackUrl ? (
                            <a
                              href={reg.nidBackUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[16/10]"
                            >
                              <img
                                src={reg.nidBackUrl}
                                alt={`${inspectingMember.name} ${t('nidBack')}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="h-28 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                              {t('notUploaded')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {reg?.signatureUrl && (
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {t('applicantSignature')}
                        </div>
                        <a
                          href={reg.signatureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white w-[300px] max-w-full h-[80px]"
                        >
                          <img
                            src={reg.signatureUrl}
                            alt={`${inspectingMember.name} signature`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain"
                          />
                        </a>
                      </div>
                    )}

                    {reg ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">{t('dob')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.dateOfBirth}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('referenceMember')}
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.referenceMemberName}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">{t('mobile')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.mobile}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">{t('nid')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.nid}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">{t('occupation')}</div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.occupation}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('company')}
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.companyOrganization}
                          </div>
                        </div>
                        {reg.nameBn && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">নাম (বাংলা)</div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              {reg.nameBn}
                            </div>
                          </div>
                        )}
                        {reg.fatherName && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">{t('fatherName')}</div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              <div>{reg.fatherName}</div>
                              {reg.fatherNameBn && (
                                <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                                  {reg.fatherNameBn}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {reg.motherName && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">{t('motherName')}</div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              <div>{reg.motherName}</div>
                              {reg.motherNameBn && (
                                <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                                  {reg.motherNameBn}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {reg.gender && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">{t('gender')}</div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              {reg.gender === 'male'
                                ? t('genderMale')
                                : reg.gender === 'female'
                                  ? t('genderFemale')
                                  : t('genderOther')}
                            </div>
                          </div>
                        )}
                        {reg.maritalStatus && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">
                              {t('maritalStatus')}
                            </div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              {reg.maritalStatus === 'single'
                                ? t('maritalSingle')
                                : reg.maritalStatus === 'married'
                                  ? t('maritalMarried')
                                  : reg.maritalStatus === 'widowed'
                                    ? t('maritalWidowed')
                                    : t('maritalDivorced')}
                            </div>
                          </div>
                        )}
                        {(reg.spouseName || reg.spouseNameBn) && (
                          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-500 dark:text-slate-400">{t('spouseName')}</div>
                            <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                              {reg.spouseName && <div>{reg.spouseName}</div>}
                              {reg.spouseNameBn && (
                                <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                                  {reg.spouseNameBn}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">{t('presentAddress')}</div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.presentAddress}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('permanentAddress')}
                          </div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.permanentAddress}
                          </div>
                        </div>
                        {(reg.socialMedia?.whatsapp ||
                          reg.socialMedia?.facebook ||
                          reg.socialMedia?.linkedin) && (
                          <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <div className="text-slate-500 dark:text-slate-400">
                              {t('socialProfiles')}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {reg.socialMedia.whatsapp && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 font-mono text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                                  {t('whatsapp')}: {reg.socialMedia.whatsapp}
                                </span>
                              )}
                              {reg.socialMedia.facebook && (
                                <a
                                  href={reg.socialMedia.facebook}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline"
                                >
                                  <span>{t('facebook')}</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              )}
                              {reg.socialMedia.linkedin && (
                                <a
                                  href={reg.socialMedia.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:underline"
                                >
                                  <span>{t('linkedin')}</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        {t('noExtendedKyc')}
                      </div>
                    )}
                    {reg?.nominees && reg.nominees.length > 0 && (
                      <NomineeDetailsList nominees={reg.nominees} compact />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="sticky bottom-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2">
              {inspectingMember.registrationDetails && (
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={() => void handleDownloadInspectingPdf(inspectingMember)}
                  className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {downloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {downloadingPdf ? t('generatingPdf') : t('downloadApplicationPdf')}
                  </span>
                </button>
              )}
              {isAdmin && inspectingMember.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmDeclinePendingMember(inspectingMember)}
                    className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('declineBtn')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmApprovePendingMember(inspectingMember)}
                    className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                  >
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('approveIssueBtn')}</span>
                  </button>
                </>
              )}
              {isAdmin && inspectingMember.status === 'pending_activation' && (
                <button
                  type="button"
                  disabled={modalBusy}
                  onClick={() => void handleResendActivation(inspectingMember)}
                  className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-600 hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('resendActivationBtn')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                {tCommon('close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        customContent={modal?.mode === 'confirm' ? modal.customContent : undefined}
        maxWidthClass={modal?.mode === 'confirm' ? modal.maxWidthClass : undefined}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        inputMultiline={modal?.mode === 'confirm' ? modal.inputMultiline : false}
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
