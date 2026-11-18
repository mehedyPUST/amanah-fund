'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Eye,
  KeyRound,
  Mail,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  FundConfig,
  MemberSummary,
  PasswordResetRequest,
  PublicUser,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { useTranslations } from 'next-intl';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { StatusText } from './StatusText.tsx';

interface AdminUserManagementPanelProps {
  members: MemberSummary[];
  currentUser: PublicUser;
  config: FundConfig | null;
  loading: boolean;
  onMembersUpdated: (nextMembers: MemberSummary[]) => void;
  onInspectMember: (member: MemberSummary) => void;
  onRefreshAll: () => Promise<void>;
}

type UserMgmtModalState =
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

function suggestNextAmanahMemberId(list: MemberSummary[]): string {
  let maxNum = 0;
  for (const m of list) {
    if (m.status === 'pending_approval') continue;
    const code = m.activationCredentials?.memberCode || m.memberCode;
    const match = code.match(/(?:AMANAH-)?AC-(\d+)$/i) || code.match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `AMANAH-AC-${String(Math.max(1, maxNum + 1)).padStart(2, '0')}`;
}

export function AdminUserManagementPanel({
  members,
  currentUser,
  config,
  loading,
  onMembersUpdated,
  onInspectMember,
  onRefreshAll,
}: AdminUserManagementPanelProps) {
  const t = useTranslations('Admin.users');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Roles');
  const tStatuses = useTranslations('Statuses');
  const isAdmin = currentUser.role === 'admin';
  const ccy = config?.currency || 'BDT';

  const roleLabel = (role: string) =>
    tRoles.has(role) ? tRoles(role) : role;
  const statusLabel = (status: string) =>
    tStatuses.has(status) ? tStatuses(status) : status.replace(/_/g, ' ');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<UserMgmtModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);

  const loadResetRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.getPasswordResetRequests();
      setResetRequests(res.requests || []);
    } catch {
      // ignore initial permission errors for non-admins
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadResetRequests();
  }, [loadResetRequests]);

  const pendingResetRequests = useMemo(
    () => resetRequests.filter((r) => r.status === 'pending'),
    [resetRequests]
  );

  // Create User modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member' as UserRole,
    status: 'active' as UserStatus,
    mobile: '',
    occupation: '',
    companyOrganization: '',
    presentAddress: '',
    permanentAddress: '',
  });

  // Edit User modal state
  const [editingMember, setEditingMember] = useState<MemberSummary | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: 'member' as UserRole,
    status: 'active' as UserStatus,
    mobile: '',
    occupation: '',
    companyOrganization: '',
    presentAddress: '',
    permanentAddress: '',
    password: '',
  });

  const stats = useMemo(() => {
    return {
      total: members.length,
      active: members.filter((m) => m.status === 'active').length,
      pending: members.filter(
        (m) => m.status === 'pending_approval' || m.status === 'pending_activation'
      ).length,
      suspended: members.filter((m) => m.status === 'suspended').length,
      staff: members.filter((m) => m.role === 'admin' || m.role === 'manager').length,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        (m.registrationDetails?.mobile || m.phoneMasked || '').toLowerCase().includes(q)
      );
    });
  }, [members, search, roleFilter, statusFilter]);

  function openEditModal(member: MemberSummary) {
    setEditingMember(member);
    setEditForm({
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      mobile: member.registrationDetails?.mobile || '',
      occupation: member.registrationDetails?.occupation || '',
      companyOrganization: member.registrationDetails?.companyOrganization || '',
      presentAddress: member.registrationDetails?.presentAddress || '',
      permanentAddress: member.registrationDetails?.permanentAddress || '',
      password: '',
    });
  }

  function requestIssueActivationCodes(member: MemberSummary) {
    const suggestedCode = suggestNextAmanahMemberId(members);
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('issueCodesTitle', { name: member.name }),
      description: t('issueCodesDesc'),
      details: [
        { label: t('applicant'), value: member.name },
        { label: t('email'), value: member.email },
      ],
      inputLabel: t('memberIdInputLabel'),
      inputPlaceholder: t('memberIdInputPlaceholder'),
      inputRequired: true,
      initialInputValue: suggestedCode,
      confirmLabel: t('generateSendBtn'),
      run: async (memberCodeInput: string) => {
        setBusyId(member.id);
        try {
          const res = await api.issueMemberActivation(member.id, {
            memberCode: memberCodeInput.trim() || undefined,
          });
          onMembersUpdated(res.members);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('codesIssuedTitle'),
            description: res.emailSent
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
            details: [
              { label: t('member'), value: member.name },
              { label: t('officialMemberId'), value: res.memberCode },
              { label: t('activationOtp'), value: res.otp },
              {
                label: t('emailDispatch'),
                value: res.emailSent
                  ? t('sentToEmail', { email: member.email })
                  : t('notDeliveredPhone'),
              },
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('issueFailedTitle'),
            description: err instanceof Error ? err.message : t('issueFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function showActivationCodesModal(member: MemberSummary) {
    const act = member.activationCredentials;
    if (!act) {
      requestIssueActivationCodes(member);
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('viewCodesTitle', { name: member.name }),
      description: t('viewCodesDesc'),
      details: [
        { label: t('officialMemberId'), value: act.memberCode },
        { label: t('activationOtp'), value: act.otp || t('unavailable') },
        {
          label: t('emailStatus'),
          value: act.emailSent
            ? t('sentToEmail', { email: member.email })
            : t('notDelivered'),
        },
        { label: t('issuedBy'), value: `${act.issuedByName} · ${formatDateTime(act.issuedAt)}` },
      ],
      confirmLabel: t('resendActivationEmailBtn'),
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.resendActivationEmail(member.id);
          onMembersUpdated(res.members);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: res.emailSent ? 'emerald' : 'amber',
            title: res.emailSent ? t('emailResentTitle') : t('emailFailedTitle'),
            description: res.emailSent
              ? t('emailResentDesc', { code: res.memberCode, email: member.email })
              : t('emailResendFailedDesc', {
                  reason: res.emailReason ? ` (${res.emailReason})` : '',
                }),
            details: [
              { label: t('officialMemberId'), value: res.memberCode },
              { label: t('activationOtp'), value: res.otp },
            ],
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function requestQuickRoleOrStatus(
    member: MemberSummary,
    payload: { role?: UserRole; status?: UserStatus },
    successText: string
  ) {
    const isSuspend = payload.status === 'suspended';
    const actionLabel = payload.role
      ? t('changeRoleTo', { role: roleLabel(payload.role) })
      : payload.status === 'active'
        ? member.status === 'pending_approval'
          ? t('approveMembership')
          : t('reactivateAccount')
        : t('suspendAccount');

    setModal({
      mode: 'confirm',
      tone: isSuspend ? 'red' : payload.role === 'admin' ? 'amber' : 'emerald',
      title: t('confirmTitleQ', { action: actionLabel }),
      description: isSuspend ? t('suspendDesc') : t('updateConfirmDesc'),
      details: [
        { label: t('member'), value: `${member.name} (${member.memberCode})` },
        { label: t('currentRole'), value: roleLabel(member.role) },
        { label: t('currentStatus'), value: statusLabel(member.status) },
        ...(payload.role ? [{ label: t('newRole'), value: roleLabel(payload.role) }] : []),
        ...(payload.status
          ? [{ label: t('newStatus'), value: statusLabel(payload.status) }]
          : []),
      ],
      confirmLabel: actionLabel,
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.updateMember(member.id, payload);
          onMembersUpdated(res.members);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: res.approvedNow ? t('membershipApprovedTitle') : t('accountUpdatedTitle'),
            description: res.approvedNow
              ? res.emailSent
                ? t('approvedEmailSent', {
                    name: member.name,
                    code: member.memberCode,
                    email: member.email,
                  })
                : t('approvedEmailSkipped', {
                    name: member.name,
                    code: member.memberCode,
                    reason: res.emailReason
                      ? t('emailSkippedReason', { reason: res.emailReason })
                      : '',
                  })
              : successText,
            details: [
              { label: t('member'), value: `${member.name} (${member.memberCode})` },
              ...(payload.role ? [{ label: t('role'), value: roleLabel(payload.role) }] : []),
              ...(payload.status
                ? [{ label: t('status'), value: statusLabel(payload.status) }]
                : []),
              ...(res.approvedNow
                ? [
                    {
                      label: t('welcomeEmail'),
                      value: res.emailSent
                        ? t('sentToEmail', { email: member.email })
                        : t('inAppOnly'),
                    },
                  ]
                : []),
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('updateFailedTitle'),
            description: err instanceof Error ? err.message : t('updateFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function requestDeleteUser(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('deleteTitle'),
      description: t('deleteDesc'),
      details: [
        { label: t('member'), value: `${member.name} (${member.memberCode})` },
        { label: t('email'), value: member.email },
        { label: t('role'), value: roleLabel(member.role) },
      ],
      confirmLabel: t('deleteConfirmBtn'),
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.deleteMember(member.id);
          onMembersUpdated(res.members);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('userRemovedTitle'),
            description: t('userRemovedDesc', { name: member.name, code: member.memberCode }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deleteFailedTitle'),
            description: err instanceof Error ? err.message : t('deleteFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function requestAdminPasswordReset(
    member: { id: string; name: string; memberCode: string; email: string },
    pendingReq?: PasswordResetRequest
  ) {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('resetPwTitle'),
      description: t('resetPwDesc'),
      details: [
        { label: t('member'), value: `${member.name} (${member.memberCode})` },
        { label: t('email'), value: member.email },
        ...(pendingReq ? [{ label: t('requestId'), value: pendingReq.id }] : []),
      ],
      confirmLabel: t('generateSendTempPwBtn'),
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.adminResetMemberPassword(member.id);
          await Promise.all([loadResetRequests(), onRefreshAll()]);
          setModal({
            mode: 'notice',
            tone: res.emailSent ? 'emerald' : 'amber',
            title: res.emailSent ? t('tempPwSentTitle') : t('tempPwNoSmtpTitle'),
            description: res.emailSent
              ? t('tempPwSentDesc', { email: res.recipientEmail })
              : t('tempPwNoSmtpDesc', {
                  name: res.memberName,
                  error: res.emailError || 'SMTP_NOT_CONFIGURED',
                }),
            details: [
              { label: t('member'), value: `${res.memberName} (${res.memberCode})` },
              {
                label: t('emailDispatch'),
                value: res.emailSent ? t('deliveredViaSmtp') : t('notDelivered'),
              },
              ...(!res.emailSent && res.tempPassword
                ? [{ label: t('tempPassword'), value: res.tempPassword }]
                : []),
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('resetPwFailedTitle'),
            description: err instanceof Error ? err.message : t('resetPwFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function requestDeclinePasswordReset(req: PasswordResetRequest) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('declineResetTitle'),
      description: t('declineResetDesc'),
      details: [
        { label: t('member'), value: `${req.memberName} (${req.memberCode})` },
        { label: t('email'), value: req.email },
      ],
      confirmLabel: t('declineRequestBtn'),
      run: async () => {
        setBusyId(req.userId);
        try {
          await api.declinePasswordResetRequest(req.id, 'Declined by administrator');
          await loadResetRequests();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('resetDeclinedTitle'),
            description: t('resetDeclinedDesc', { id: req.id, name: req.memberName }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('declineFailedTitle'),
            description: err instanceof Error ? err.message : t('declineFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleCreateUserSubmit(e: FormEvent) {
    e.preventDefault();
    const createdName = createForm.name.trim();
    const createdEmail = createForm.email.trim();
    const createdRole = createForm.role;
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('createConfirmTitle'),
      description: t('createConfirmDesc'),
      details: [
        { label: t('fullName'), value: createdName },
        { label: t('email'), value: createdEmail },
        { label: t('role'), value: roleLabel(createdRole) },
        { label: t('initialStatus'), value: statusLabel(createForm.status) },
      ],
      confirmLabel: t('createAccountBtn'),
      run: async () => {
        setCreateSaving(true);
        try {
          const res = await api.createMember({
            name: createdName,
            email: createdEmail,
            password: createForm.password,
            role: createdRole,
            status: createForm.status,
            mobile: createForm.mobile.trim() || undefined,
            occupation: createForm.occupation.trim() || undefined,
            companyOrganization: createForm.companyOrganization.trim() || undefined,
            presentAddress: createForm.presentAddress.trim() || undefined,
            permanentAddress: createForm.permanentAddress.trim() || undefined,
          });
          onMembersUpdated(res.members);
          setCreateOpen(false);
          setCreateForm({
            name: '',
            email: '',
            password: '',
            role: 'member',
            status: 'active',
            mobile: '',
            occupation: '',
            companyOrganization: '',
            presentAddress: '',
            permanentAddress: '',
          });
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('userCreatedTitle'),
            description: t('userCreatedDesc', { name: createdName, role: roleLabel(createdRole) }),
            details: [
              { label: t('name'), value: createdName },
              { label: t('email'), value: createdEmail },
              { label: t('role'), value: roleLabel(createdRole) },
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('createFailedTitle'),
            description: err instanceof Error ? err.message : t('createFailedDesc'),
          });
        } finally {
          setCreateSaving(false);
        }
      },
    });
  }

  function handleEditUserSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingMember) return;
    const targetMember = editingMember;
    const trimmedName = editForm.name.trim();
    const trimmedEmail = editForm.email.trim();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('saveChangesTitle'),
      description: t('saveChangesDesc'),
      details: [
        { label: t('member'), value: `${trimmedName} (${targetMember.memberCode})` },
        { label: t('email'), value: trimmedEmail },
        { label: t('role'), value: roleLabel(editForm.role) },
        { label: t('status'), value: statusLabel(editForm.status) },
        ...(editForm.password.trim()
          ? [{ label: t('passwordReset'), value: t('newPasswordApplied') }]
          : []),
      ],
      confirmLabel: t('saveChangesBtn'),
      run: async () => {
        setEditSaving(true);
        try {
          const res = await api.updateMember(targetMember.id, {
            name: trimmedName,
            email: trimmedEmail,
            role: editForm.role,
            status: editForm.status,
            mobile: editForm.mobile.trim(),
            occupation: editForm.occupation.trim(),
            companyOrganization: editForm.companyOrganization.trim(),
            presentAddress: editForm.presentAddress.trim(),
            permanentAddress: editForm.permanentAddress.trim(),
            ...(editForm.password.trim() ? { password: editForm.password } : {}),
          });
          onMembersUpdated(res.members);
          setEditingMember(null);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('profileUpdatedTitle'),
            description: t('profileUpdatedDesc', {
              name: trimmedName,
              code: targetMember.memberCode,
            }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('saveFailedTitle'),
            description: err instanceof Error ? err.message : t('saveFailedDesc'),
          });
        } finally {
          setEditSaving(false);
        }
      },
    });
  }

  return (
    <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-5 shadow-xs">
      {/* Header & Add User CTA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
            <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('eyebrow')}</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {t('heading', { count: members.length })}
          </h3>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start lg:self-center cursor-pointer transition-all duration-200 active:scale-[0.98]"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('addNewUser')}</span>
          </button>
        )}
      </div>

      {/* Pending Password Reset Requests Queue (Admin) */}
      {isAdmin && pendingResetRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/25 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <KeyRound className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>{t('pendingResetsHeading', { count: pendingResetRequests.length })}</span>
            </div>
            <span className="text-[11px] font-mono text-amber-800 dark:text-amber-300">
              {t('stepUp2faNote')}
            </span>
          </div>

          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40 border border-amber-200/80 dark:border-amber-900/50 rounded-lg bg-white/85 dark:bg-slate-900/80">
            {pendingResetRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {req.memberName}{' '}
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      ({req.memberCode})
                    </span>
                  </div>
                  <div className="font-mono text-slate-500 dark:text-slate-400">
                    {t('requestedAt', { email: req.email, date: formatDateTime(req.requestedAt) })}
                  </div>
                  {req.reason && (
                    <p className="text-slate-700 dark:text-slate-300 pt-0.5">
                      {t('notePrefix', { reason: req.reason })}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                  <button
                    type="button"
                    disabled={busyId === req.userId}
                    onClick={() => requestDeclinePasswordReset(req)}
                    className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-medium cursor-pointer disabled:opacity-50"
                  >
                    {t('decline')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.userId}
                    onClick={() =>
                      requestAdminPasswordReset(
                        {
                          id: req.userId,
                          name: req.memberName,
                          memberCode: req.memberCode,
                          email: req.email,
                        },
                        req
                      )
                    }
                    className="min-h-[44px] sm:min-h-0 justify-center px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('resetAndEmailTempPw')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Counts Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-4 py-3 sm:py-3.5 border-y border-slate-100 dark:border-slate-800 text-xs">
        <div>
          <div className="text-slate-500 dark:text-slate-400">{t('statTotal')}</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading ? <Skeleton width={36} /> : stats.total}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">{t('statActive')}</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {loading ? <Skeleton width={36} /> : stats.active}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">{t('statPending')}</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {loading ? <Skeleton width={36} /> : stats.pending}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">{t('statSuspended')}</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            {loading ? <Skeleton width={36} /> : stats.suspended}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-slate-500 dark:text-slate-400">{t('statStaff')}</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            {loading ? <Skeleton width={36} /> : stats.staff}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="flex flex-nowrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto no-scrollbar max-w-full w-full sm:w-fit">
            {(
              [
                { id: 'all', label: t('filterAllStatuses') },
                { id: 'active', label: t('filterActive') },
                { id: 'pending_approval', label: t('filterPendingReview') },
                { id: 'pending_activation', label: t('filterAwaitingActivation') },
                { id: 'suspended', label: t('filterSuspended') },
              ] as const
            ).map((s) => {
              const active = statusFilter === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusFilter(s.id)}
                  className={`relative min-h-[38px] sm:min-h-0 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="admin-user-status-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{s.label}</span>
                </button>
              );
            })}
          </div>

          <select
            aria-label={t('filterRoleAria')}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
          >
            <option value="all">{t('filterAllRoles')}</option>
            <option value="admin">{tRoles('admin')}</option>
            <option value="manager">{tRoles('manager')}</option>
            <option value="member">{tRoles('member')}</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchAria')}
            className="w-full min-h-[44px] sm:min-h-0 pl-8 pr-3 py-1.5 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
          />
        </div>
      </div>

      {/* Directory Table */}
      {loading ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="p-3.5 grid grid-cols-12 gap-3 items-center">
              <div className="col-span-4 space-y-1">
                <Skeleton width={130} height={14} />
                <Skeleton width={200} height={11} />
              </div>
              <div className="col-span-2">
                <Skeleton width={76} height={24} />
              </div>
              <div className="col-span-2">
                <Skeleton width={80} height={14} />
              </div>
              <div className="col-span-2">
                <Skeleton width={68} height={14} />
              </div>
              <div className="col-span-2 flex justify-end gap-1.5">
                <Skeleton width={52} height={24} />
                <Skeleton width={52} height={24} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="p-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          {t('emptyFiltered')}
        </div>
      ) : (
        <>
        {/* Mobile User Management Cards (< lg) */}
        <div className="lg:hidden space-y-2.5">
          {filteredMembers.map((m) => {
            const isSelf = m.id === currentUser.id;
            const isBusy = busyId === m.id;
            return (
              <div
                key={`mobile-user-${m.id}`}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/75 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {m.name}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                      {m.memberCode} · {m.email}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {t('joinedAt', { date: formatShortDate(m.joinedAt) })}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusText status={m.status} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('savings')}</div>
                    <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                      {formatMoney(m.totalContributed, ccy)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('loansPerYr')}</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {m.loansThisYear}/{config?.maxLoansPerYear || 3}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('loanBal')}</div>
                    <div className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400 truncate">
                      {formatMoney(m.activeLoanBalance, ccy)}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {t('roleAssignment')}
                      </span>
                      <select
                        aria-label={t('roleForAria', { name: m.name })}
                        disabled={isBusy || isSelf}
                        value={m.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          if (nextRole !== m.role) {
                            requestQuickRoleOrStatus(
                              m,
                              { role: nextRole },
                              t('updatedRoleMsg', { name: m.name, role: roleLabel(nextRole) })
                            );
                          }
                        }}
                        className="min-h-[38px] px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                      >
                        <option value="member">{tRoles('member')}</option>
                        <option value="manager">{tRoles('manager')}</option>
                        <option value="admin">{tRoles('admin')}</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.registrationDetails && (
                        <button
                          type="button"
                          onClick={() => onInspectMember(m)}
                          className="min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('kyc')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(m)}
                        className="min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('edit')}</span>
                      </button>
                      {!isSelf && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              requestAdminPasswordReset({
                                id: m.id,
                                name: m.name,
                                memberCode: m.memberCode,
                                email: m.email,
                              })
                            }
                            className="min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('resetPwShort')}</span>
                          </button>
                          {m.status === 'pending_activation' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => showActivationCodesModal(m)}
                              className="min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('viewCodes')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                if (m.status === 'pending_approval') {
                                  requestIssueActivationCodes(m);
                                  return;
                                }
                                const nextStatus: UserStatus =
                                  m.status === 'active' ? 'suspended' : 'active';
                                requestQuickRoleOrStatus(
                                  m,
                                  { status: nextStatus },
                                  nextStatus === 'active'
                                    ? t('activatedMsg', { name: m.name, code: m.memberCode })
                                    : t('suspendedMsg', { name: m.name, code: m.memberCode })
                                );
                              }}
                              className={`min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer disabled:opacity-50 ${
                                m.status === 'active'
                                  ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
                                  : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {m.status === 'active'
                                ? t('suspend')
                                : m.status === 'pending_approval'
                                  ? t('issueCodes')
                                  : t('activate')}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => requestDeleteUser(m)}
                            aria-label={t('deleteAria', { name: m.name })}
                            className="min-w-[40px] min-h-[40px] px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {isSelf && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 px-2">
                          {t('currentAdmin')}
                        </span>
                      )}
                    </div>
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
                <th className="py-2.5 px-4 font-medium">{t('colUser')}</th>
                <th className="py-2.5 px-4 font-medium">{t('colRole')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colTotalContributed')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colLoansPerYear')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colActiveBalance')}</th>
                <th className="py-2.5 px-4 font-medium">{t('colStatus')}</th>
                {isAdmin && <th className="py-2.5 px-4 font-medium text-right">{t('colManageActions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMembers.map((m) => {
                const isSelf = m.id === currentUser.id;
                const isBusy = busyId === m.id;

                return (
                  <tr key={m.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white text-sm">
                        {m.name}
                      </div>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        {m.memberCode} · {m.email} · {t('joinedAt', { date: formatShortDate(m.joinedAt) })}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {isAdmin ? (
                        <select
                          aria-label={t('roleForAria', { name: m.name })}
                          disabled={isBusy || isSelf}
                          value={m.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as UserRole;
                            if (nextRole !== m.role) {
                              requestQuickRoleOrStatus(
                                m,
                                { role: nextRole },
                                t('updatedRoleMsg', { name: m.name, role: roleLabel(nextRole) })
                              );
                            }
                          }}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                        >
                          <option value="member">{tRoles('member')}</option>
                          <option value="manager">{tRoles('manager')}</option>
                          <option value="admin">{tRoles('admin')}</option>
                        </select>
                      ) : (
                        <span className="font-medium">{roleLabel(m.role)}</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                      {formatMoney(m.totalContributed, ccy)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {m.loansThisYear} / {config?.maxLoansPerYear || 3}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatMoney(m.activeLoanBalance, ccy)}
                    </td>

                    <td className="py-3 px-4">
                      <StatusText status={m.status} />
                    </td>

                    {isAdmin && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {m.registrationDetails && (
                            <button
                              type="button"
                              onClick={() => onInspectMember(m)}
                              title={t('inspectKycTitle')}
                              className="px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3 h-3" aria-hidden="true" />
                              <span>{t('kyc')}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditModal(m)}
                            title={t('editUserTitle')}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            <span>{t('edit')}</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                requestAdminPasswordReset({
                                  id: m.id,
                                  name: m.name,
                                  memberCode: m.memberCode,
                                  email: m.email,
                                })
                              }
                              title={t('resetPwTitleTooltip')}
                              className="px-2.5 py-1 rounded border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <KeyRound className="w-3 h-3" aria-hidden="true" />
                              <span>{t('resetPwShort')}</span>
                            </button>
                          )}

                          {!isSelf && (
                            <>
                              {m.status === 'pending_activation' ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => showActivationCodesModal(m)}
                                  title={t('viewCodesTitleTooltip')}
                                  className="px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200"
                                >
                                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                                  <span>{t('codes')}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    if (m.status === 'pending_approval') {
                                      requestIssueActivationCodes(m);
                                      return;
                                    }
                                    const nextStatus: UserStatus =
                                      m.status === 'active' ? 'suspended' : 'active';
                                    requestQuickRoleOrStatus(
                                      m,
                                      { status: nextStatus },
                                      nextStatus === 'active'
                                        ? t('activatedMsg', { name: m.name, code: m.memberCode })
                                        : t('suspendedMsg', { name: m.name, code: m.memberCode })
                                    );
                                  }}
                                  className={`px-2.5 py-1 rounded border font-medium cursor-pointer disabled:opacity-50 transition-all duration-200 ${
                                    m.status === 'active'
                                      ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white'
                                      : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                                  }`}
                                >
                                  {m.status === 'active'
                                    ? t('suspend')
                                    : m.status === 'pending_approval'
                                      ? t('issueCodes')
                                      : t('activate')}
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => requestDeleteUser(m)}
                                title={t('deleteUserTitleTooltip')}
                                aria-label={t('deleteAria', { name: m.name })}
                                className="p-1.5 rounded border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}

                          {isSelf && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1">
                              {t('currentAdmin')}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modal: Add New User */}
      <AnimatePresence>
      {createOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-create-user-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/88 dark:bg-slate-900/88 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl max-w-xl w-full max-h-[92dvh] overflow-y-auto shadow-xl"
          >
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4
                  id="admin-create-user-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {t('createModalTitle')}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label={t('closeModalAria')}
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('initialPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={createForm.password}
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('role')}
                    </label>
                    <select
                      value={createForm.role}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, role: e.target.value as UserRole }))
                      }
                      className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="member">{tRoles('member')}</option>
                      <option value="manager">{tRoles('manager')}</option>
                      <option value="admin">{tRoles('admin')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('status')}
                    </label>
                    <select
                      value={createForm.status}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, status: e.target.value as UserStatus }))
                      }
                      className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="active">{t('filterActive')}</option>
                      <option value="pending_approval">{t('statusPending')}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('mobileNumber')}
                  </label>
                  <input
                    type="tel"
                    value={createForm.mobile}
                    onChange={(e) => setCreateForm((p) => ({ ...p, mobile: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('occupation')}
                  </label>
                  <input
                    type="text"
                    value={createForm.occupation}
                    onChange={(e) => setCreateForm((p) => ({ ...p, occupation: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('companyOrg')}
                </label>
                <input
                  type="text"
                  value={createForm.companyOrganization}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, companyOrganization: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('presentAddress')}
                </label>
                <input
                  type="text"
                  value={createForm.presentAddress}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, presentAddress: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="pt-2 grid grid-cols-2 sm:flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createSaving}
                  className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{createSaving ? t('creatingUser') : t('createUserBtn')}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal: Edit Existing User */}
      <AnimatePresence>
      {editingMember && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-edit-user-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/88 dark:bg-slate-900/88 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl max-w-xl w-full max-h-[92dvh] overflow-y-auto shadow-xl"
          >
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4
                  id="admin-edit-user-title"
                  className="text-base font-semibold text-slate-900 dark:text-white truncate"
                >
                  {t('editModalTitle', {
                    name: editingMember.name,
                    code: editingMember.memberCode,
                  })}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                aria-label={t('closeModalAria')}
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('role')}
                  </label>
                  <select
                    disabled={editingMember.id === currentUser.id}
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, role: e.target.value as UserRole }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  >
                    <option value="member">{tRoles('member')}</option>
                    <option value="manager">{tRoles('manager')}</option>
                    <option value="admin">{tRoles('admin')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('accountStatus')}
                  </label>
                  <select
                    disabled={editingMember.id === currentUser.id}
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, status: e.target.value as UserStatus }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  >
                    <option value="active">{t('statusActiveVerified')}</option>
                    <option value="pending_approval">{t('statusPendingApproval')}</option>
                    <option value="pending_activation">{t('statusPendingActivation')}</option>
                    <option value="suspended">{t('filterSuspended')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('mobileNumber')}
                  </label>
                  <input
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm((p) => ({ ...p, mobile: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('occupation')}
                  </label>
                  <input
                    type="text"
                    value={editForm.occupation}
                    onChange={(e) => setEditForm((p) => ({ ...p, occupation: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('companyOrg')}
                </label>
                <input
                  type="text"
                  value={editForm.companyOrganization}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, companyOrganization: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('presentAddress')}
                  </label>
                  <input
                    type="text"
                    value={editForm.presentAddress}
                    onChange={(e) => setEditForm((p) => ({ ...p, presentAddress: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('permanentAddress')}
                  </label>
                  <input
                    type="text"
                    value={editForm.permanentAddress}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, permanentAddress: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('resetPasswordOptional')}
                </label>
                <input
                  type="password"
                  minLength={6}
                  placeholder={t('keepExistingPasswordPlaceholder')}
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="pt-2 grid grid-cols-2 sm:flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{editSaving ? t('savingChanges') : t('saveUserChangesBtn')}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : t('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        initialInputValue={modal?.mode === 'confirm' ? modal.initialInputValue : ''}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async (inputValue: string) => {
                setModalBusy(true);
                try {
                  await modal.run(inputValue);
                } finally {
                  setModalBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </section>
  );
}
