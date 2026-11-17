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
      run: () => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

export function AdminUserManagementPanel({
  members,
  currentUser,
  config,
  loading,
  onMembersUpdated,
  onInspectMember,
  onRefreshAll,
}: AdminUserManagementPanelProps) {
  const isAdmin = currentUser.role === 'admin';
  const ccy = config?.currency || 'BDT';

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
      pending: members.filter((m) => m.status === 'pending_approval').length,
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

  function requestQuickRoleOrStatus(
    member: MemberSummary,
    payload: { role?: UserRole; status?: UserStatus },
    successText: string
  ) {
    const isSuspend = payload.status === 'suspended';
    const actionLabel = payload.role
      ? `Change Role to ${payload.role}`
      : payload.status === 'active'
        ? member.status === 'pending_approval'
          ? 'Approve Membership'
          : 'Reactivate Account'
        : 'Suspend Account';

    setModal({
      mode: 'confirm',
      tone: isSuspend ? 'red' : payload.role === 'admin' ? 'amber' : 'emerald',
      title: `${actionLabel}?`,
      description: isSuspend
        ? 'Suspending this account immediately revokes login, voting, and loan request access.'
        : 'Confirm this account permission or status update for the cooperative directory.',
      details: [
        { label: 'Member', value: `${member.name} (${member.memberCode})` },
        { label: 'Current Role', value: member.role.toUpperCase() },
        { label: 'Current Status', value: member.status.replace(/_/g, ' ') },
        ...(payload.role ? [{ label: 'New Role', value: payload.role.toUpperCase() }] : []),
        ...(payload.status
          ? [{ label: 'New Status', value: payload.status.replace(/_/g, ' ') }]
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
            title: res.approvedNow ? 'Membership Approved' : 'User Account Updated',
            description: res.approvedNow
              ? res.emailSent
                ? `Approved ${member.name} (${member.memberCode}) and sent welcome email to ${member.email}.`
                : `Approved ${member.name} (${member.memberCode}) and queued in-app welcome notice${res.emailReason ? ` (email skipped: ${res.emailReason})` : ''}.`
              : successText,
            details: [
              { label: 'Member', value: `${member.name} (${member.memberCode})` },
              ...(payload.role ? [{ label: 'Role', value: payload.role.toUpperCase() }] : []),
              ...(payload.status
                ? [{ label: 'Status', value: payload.status.replace(/_/g, ' ') }]
                : []),
              ...(res.approvedNow
                ? [{ label: 'Welcome Email', value: res.emailSent ? `Sent to ${member.email}` : 'In-App Only' }]
                : []),
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Update Failed',
            description: err instanceof Error ? err.message : 'Failed to update user account.',
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
      title: 'Delete User Account?',
      description:
        'Removing this user deletes their access from the cooperative directory. Historical financial ledger entries remain intact.',
      details: [
        { label: 'Member', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
        { label: 'Role', value: member.role.toUpperCase() },
      ],
      confirmLabel: 'Delete Account',
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.deleteMember(member.id);
          onMembersUpdated(res.members);
          await onRefreshAll();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'User Removed',
            description: `Removed user ${member.name} (${member.memberCode}) from cooperative directory.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Delete Failed',
            description: err instanceof Error ? err.message : 'Failed to remove user account.',
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
      title: 'Reset Password & Send Temporary Password?',
      description:
        'Generates a strong temporary password, updates the member login hash, resolves any pending reset request, and sends the temporary password via email.',
      details: [
        { label: 'Member', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
        ...(pendingReq
          ? [{ label: 'Request ID', value: pendingReq.id }]
          : []),
      ],
      confirmLabel: 'Generate & Send Temp Password',
      run: async () => {
        setBusyId(member.id);
        try {
          const res = await api.adminResetMemberPassword(member.id);
          await Promise.all([loadResetRequests(), onRefreshAll()]);
          setModal({
            mode: 'notice',
            tone: res.emailSent ? 'emerald' : 'amber',
            title: res.emailSent
              ? 'Temporary Password Sent via Email'
              : 'Password Reset (SMTP Not Configured)',
            description: res.emailSent
              ? `Temporary password has been dispatched to ${res.recipientEmail}. Instruct the member to change it from My Profile after signing in.`
              : `Password was updated for ${res.memberName}, but SMTP email could not be sent (${res.emailError || 'SMTP_NOT_CONFIGURED'}). Share the temporary password securely below.`,
            details: [
              { label: 'Member', value: `${res.memberName} (${res.memberCode})` },
              { label: 'Email Dispatch', value: res.emailSent ? 'Delivered via SMTP' : 'Not Delivered' },
              ...(!res.emailSent && res.tempPassword
                ? [{ label: 'Temporary Password', value: res.tempPassword }]
                : []),
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Password Reset Failed',
            description: err instanceof Error ? err.message : 'Could not reset member password.',
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
      title: 'Decline Password Reset Request?',
      description: 'Marks this pending password reset request as declined without changing the account password.',
      details: [
        { label: 'Member', value: `${req.memberName} (${req.memberCode})` },
        { label: 'Email', value: req.email },
      ],
      confirmLabel: 'Decline Request',
      run: async () => {
        setBusyId(req.userId);
        try {
          await api.declinePasswordResetRequest(req.id, 'Declined by administrator');
          await loadResetRequests();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Reset Request Declined',
            description: `Declined password reset request ${req.id} for ${req.memberName}.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Decline Failed',
            description: err instanceof Error ? err.message : 'Could not decline password reset request.',
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
      title: 'Provision New Cooperative User?',
      description:
        'Confirm provisioning this user account with encrypted registration credentials and RBAC role.',
      details: [
        { label: 'Full Name', value: createdName },
        { label: 'Email', value: createdEmail },
        { label: 'Role', value: createdRole.toUpperCase() },
        { label: 'Initial Status', value: createForm.status.replace(/_/g, ' ') },
      ],
      confirmLabel: 'Create User Account',
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
            title: 'User Account Created',
            description: `User account created for ${createdName} (${createdRole}).`,
            details: [
              { label: 'Name', value: createdName },
              { label: 'Email', value: createdEmail },
              { label: 'Role', value: createdRole.toUpperCase() },
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'User Provisioning Failed',
            description: err instanceof Error ? err.message : 'Could not create user account.',
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
      title: 'Save User Account Changes?',
      description: 'Confirm updating profile details, RBAC role, and account status.',
      details: [
        { label: 'Member', value: `${trimmedName} (${targetMember.memberCode})` },
        { label: 'Email', value: trimmedEmail },
        { label: 'Role', value: editForm.role.toUpperCase() },
        { label: 'Status', value: editForm.status.replace(/_/g, ' ') },
        ...(editForm.password.trim()
          ? [{ label: 'Password Reset', value: 'New password will be applied' }]
          : []),
      ],
      confirmLabel: 'Save Changes',
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
            title: 'User Profile Updated',
            description: `Updated user profile & permissions for ${trimmedName} (${targetMember.memberCode}).`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Save Failed',
            description: err instanceof Error ? err.message : 'Failed to save user edits.',
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
            <span>Administrator User Management</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Manage Users, Roles & Access Controls ({members.length})
          </h3>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start lg:self-center cursor-pointer transition-all duration-200 active:scale-[0.98]"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add New User</span>
          </button>
        )}
      </div>

      {/* Pending Password Reset Requests Queue (Admin) */}
      {isAdmin && pendingResetRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/25 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <KeyRound className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>Pending Password Reset Requests ({pendingResetRequests.length})</span>
            </div>
            <span className="text-[11px] font-mono text-amber-800 dark:text-amber-300">
              Step-up 2FA required for admin reset
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
                    {req.email} · Requested {formatDateTime(req.requestedAt)}
                  </div>
                  {req.reason && (
                    <p className="text-slate-700 dark:text-slate-300 pt-0.5">Note: {req.reason}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                  <button
                    type="button"
                    disabled={busyId === req.userId}
                    onClick={() => requestDeclinePasswordReset(req)}
                    className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-medium cursor-pointer disabled:opacity-50"
                  >
                    Decline
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
                    <span>Reset &amp; Email Temp Password</span>
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
          <div className="text-slate-500 dark:text-slate-400">Total Accounts</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading ? <Skeleton width={36} /> : stats.total}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Active Verified</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {loading ? <Skeleton width={36} /> : stats.active}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Pending Approval</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {loading ? <Skeleton width={36} /> : stats.pending}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Suspended</div>
          <div className="mt-1 text-base font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            {loading ? <Skeleton width={36} /> : stats.suspended}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-slate-500 dark:text-slate-400">Admins & Managers</div>
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
                { id: 'all', label: 'All Statuses' },
                { id: 'active', label: 'Active' },
                { id: 'pending_approval', label: 'Pending' },
                { id: 'suspended', label: 'Suspended' },
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
            aria-label="Filter users by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 text-sm sm:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
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
            placeholder="Filter name, email, code…"
            aria-label="Search users"
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
          No user accounts match the active filter criteria.
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
                      Joined {formatShortDate(m.joinedAt)}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusText status={m.status} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Savings</div>
                    <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                      {formatMoney(m.totalContributed, ccy)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Loans/Yr</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {m.loansThisYear}/{config?.maxLoansPerYear || 3}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Loan Bal.</div>
                    <div className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400 truncate">
                      {formatMoney(m.activeLoanBalance, ccy)}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Role Assignment
                      </span>
                      <select
                        aria-label={`Role for ${m.name}`}
                        disabled={isBusy || isSelf}
                        value={m.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          if (nextRole !== m.role) {
                            requestQuickRoleOrStatus(
                              m,
                              { role: nextRole },
                              `Updated ${m.name}'s role to ${nextRole}.`
                            );
                          }
                        }}
                        className="min-h-[38px] px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 capitalize disabled:opacity-60"
                      >
                        <option value="member">member</option>
                        <option value="manager">manager</option>
                        <option value="admin">admin</option>
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
                          <span>KYC</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(m)}
                        className="min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
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
                            <span>Reset PW</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              const nextStatus: UserStatus =
                                m.status === 'active' ? 'suspended' : 'active';
                              requestQuickRoleOrStatus(
                                m,
                                { status: nextStatus },
                                nextStatus === 'active'
                                  ? `Activated ${m.name} (${m.memberCode}).`
                                  : `Suspended ${m.name} (${m.memberCode}).`
                              );
                            }}
                            className={`min-h-[40px] flex-1 px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer disabled:opacity-50 ${
                              m.status === 'active'
                                ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
                                : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {m.status === 'active'
                              ? 'Suspend'
                              : m.status === 'pending_approval'
                                ? 'Approve'
                                : 'Activate'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => requestDeleteUser(m)}
                            aria-label={`Delete ${m.name}`}
                            className="min-w-[40px] min-h-[40px] px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {isSelf && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 px-2">
                          Current Admin
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
                <th className="py-2.5 px-4 font-medium">User</th>
                <th className="py-2.5 px-4 font-medium">Role</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Contributed</th>
                <th className="py-2.5 px-4 font-medium text-right">Loans / Year</th>
                <th className="py-2.5 px-4 font-medium text-right">Active Balance</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                {isAdmin && <th className="py-2.5 px-4 font-medium text-right">Manage Actions</th>}
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
                        {m.memberCode} · {m.email} · Joined {formatShortDate(m.joinedAt)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {isAdmin ? (
                        <select
                          aria-label={`Role for ${m.name}`}
                          disabled={isBusy || isSelf}
                          value={m.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as UserRole;
                            if (nextRole !== m.role) {
                              requestQuickRoleOrStatus(
                                m,
                                { role: nextRole },
                                `Updated ${m.name}'s role to ${nextRole}.`
                              );
                            }
                          }}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 capitalize disabled:opacity-60"
                        >
                          <option value="member">member</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className="capitalize font-medium">{m.role}</span>
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
                              title="Inspect KYC details"
                              className="px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3 h-3" aria-hidden="true" />
                              <span>KYC</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditModal(m)}
                            title="Edit user details and permissions"
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            <span>Edit</span>
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
                              title="Reset password and email temporary password"
                              className="px-2.5 py-1 rounded border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <KeyRound className="w-3 h-3" aria-hidden="true" />
                              <span>Reset PW</span>
                            </button>
                          )}

                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  const nextStatus: UserStatus =
                                    m.status === 'active' ? 'suspended' : 'active';
                                  requestQuickRoleOrStatus(
                                    m,
                                    { status: nextStatus },
                                    nextStatus === 'active'
                                      ? `Activated ${m.name} (${m.memberCode}).`
                                      : `Suspended ${m.name} (${m.memberCode}).`
                                  );
                                }}
                                className={`px-2.5 py-1 rounded border font-medium cursor-pointer disabled:opacity-50 transition-all duration-200 ${
                                  m.status === 'active'
                                    ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white'
                                    : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                                }`}
                              >
                                {m.status === 'active'
                                  ? 'Suspend'
                                  : m.status === 'pending_approval'
                                    ? 'Approve'
                                    : 'Activate'}
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => requestDeleteUser(m)}
                                title="Delete user account"
                                aria-label={`Delete ${m.name}`}
                                className="p-1.5 rounded border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}

                          {isSelf && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1">Current Admin</span>
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
                  Add New Cooperative User
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
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
                    Email Address
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
                    Initial Password (min 6 chars)
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
                      Role
                    </label>
                    <select
                      value={createForm.role}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, role: e.target.value as UserRole }))
                      }
                      className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      value={createForm.status}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, status: e.target.value as UserStatus }))
                      }
                      className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="active">Active</option>
                      <option value="pending_approval">Pending</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Number
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
                    Occupation
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
                  Company / Organization
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
                  Present Address
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving}
                  className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{createSaving ? 'Creating User…' : 'Create User'}</span>
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
                  Edit User · {editingMember.name} ({editingMember.memberCode})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
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
                    Email Address
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
                    Role
                  </label>
                  <select
                    disabled={editingMember.id === currentUser.id}
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, role: e.target.value as UserRole }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Account Status
                  </label>
                  <select
                    disabled={editingMember.id === currentUser.id}
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, status: e.target.value as UserStatus }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  >
                    <option value="active">Active (Verified)</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Number
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
                    Occupation
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
                  Company / Organization
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
                    Present Address
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
                    Permanent Address
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
                  Reset Password (Optional)
                </label>
                <input
                  type="password"
                  minLength={6}
                  placeholder="Leave blank to keep existing password"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{editSaving ? 'Saving Changes…' : 'Save User Changes'}</span>
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
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async () => {
                setModalBusy(true);
                try {
                  await modal.run();
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
