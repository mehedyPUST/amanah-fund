'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  ClipboardCheck,
  ExternalLink,
  FileText,
  KeyRound,
  Mail,
  Phone,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  FundConfig,
  MemberSummary,
  ProfileChangeRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, isPdfFileUrl } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { AdminUserManagementPanel } from './AdminUserManagementPanel.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';
import { PendingRegistrationsView } from './PendingRegistrationsView.tsx';

type RegistryModalState =
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
  const t = useTranslations('Admin.memberRegistry');
  const tCommon = useTranslations('Common');
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isAdmin = user.role === 'admin';

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [profileRequests, setProfileRequests] = useState<ProfileChangeRequest[]>([]);
  const [profileBusyId, setProfileBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspectingMember, setInspectingMember] = useState<MemberSummary | null>(null);
  const [modal, setModal] = useState<RegistryModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

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
        api.getProfileChangeRequests().catch(() => ({ requests: [] as ProfileChangeRequest[] })),
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
  }, [isStaff]);

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
            { label: t('detailOtp'), value: res.otp },
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
          { label: t('detailOtp'), value: res.otp },
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
    const changesSummary = Object.entries(req.requestedChanges)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' | ');

    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: t('approveProfileTitle', { name: req.memberName }),
        description: t('approveProfileDesc'),
        details: [
          { label: t('detailMember'), value: `${req.memberName} (${req.memberCode})` },
          { label: t('detailChanges'), value: changesSummary || t('profileUpdateFallback') },
        ],
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
        title: t('declineProfileTitle', { name: req.memberName }),
        description: t('declineProfileDesc'),
        details: [
          { label: t('detailMember'), value: `${req.memberName} (${req.memberCode})` },
          { label: t('detailChanges'), value: changesSummary || t('profileUpdateFallback') },
        ],
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
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
            <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t('heading', {
              total: members.length,
              pending: pendingCount,
              awaiting: awaitingActivationCount,
            })}
          </h2>
        </div>
      </section>

      <div className="space-y-6">
          {pendingProfileRequests.length > 0 && (
            <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3.5 sm:p-6 space-y-4 shadow-xs">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t('queueEyebrow')}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {t('queueTitle', { count: pendingProfileRequests.length })}
                </h3>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
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
                          {Object.entries(req.requestedChanges).map(([k, v]) => (
                            <div key={k}>
                              <span className="font-mono text-slate-500 dark:text-slate-400">{k}:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-white">
                                {String(v)}
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
                          className="min-h-[44px] sm:min-h-0 justify-center px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                        >
                          {t('declineBtn')}
                        </button>
                        <button
                          type="button"
                          disabled={profileBusyId === req.id || modalBusy}
                          onClick={() => confirmProfileChangeReview(req, 'approved')}
                          className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
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
            className="bg-white/88 dark:bg-slate-900/88 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl max-w-2xl w-full max-h-[92dvh] overflow-y-auto shadow-xl"
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
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center shrink-0"
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
                      <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/35 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
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
                          <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {t('detailOtp')}
                            </div>
                            <div className="font-mono font-bold text-sm tracking-[0.22em] text-indigo-700 dark:text-indigo-300 mt-0.5">
                              {act.otp || t('otpUnavailable')}
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

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {t('agreementPaper')}
                        </div>
                        {reg?.agreementPhotoUrl ? (
                          isPdfFileUrl(reg.agreementPhotoUrl) ? (
                            <a
                              href={reg.agreementPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="h-32 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-2 p-3 text-center hover:border-emerald-500 transition-colors"
                            >
                              <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                              <span className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1">
                                <span>{t('openAgreementPdf')}</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </span>
                            </a>
                          ) : (
                            <a
                              href={reg.agreementPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[4/3]"
                            >
                              <img
                                src={reg.agreementPhotoUrl}
                                alt={`${inspectingMember.name} signed agreement`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          )
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {t('notProvidedOptional')}
                          </div>
                        )}
                      </div>
                    </div>

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
              {isAdmin && inspectingMember.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmDeclinePendingMember(inspectingMember)}
                    className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('declineBtn')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmApprovePendingMember(inspectingMember)}
                    className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
                  className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('resendActivationBtn')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
