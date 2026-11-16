'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ClipboardCheck, Users, X, XCircle } from 'lucide-react';
import type {
  FundConfig,
  MemberSummary,
  ProfileChangeRequest,
  PublicUser,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ActiveMembersView } from './ActiveMembersView.tsx';
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
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

interface MemberRegistrySectionProps {
  user: PublicUser;
  config: FundConfig | null;
  onRefresh: () => Promise<void>;
  onViewMemberProfile?: (userId: string) => void;
}

export function MemberRegistrySection({
  user,
  config,
  onRefresh,
  onViewMemberProfile,
}: MemberRegistrySectionProps) {
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isAdmin = user.role === 'admin';

  const [subTab, setSubTab] = useState<'manage' | 'directory'>('manage');
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
        'Action Could Not Be Completed',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    } finally {
      setModalBusy(false);
    }
  }

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
        'Could Not Load Member Registry',
        err instanceof Error ? err.message : 'Failed to load member registry.'
      );
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  function confirmApprovePendingMember(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Approve Signup (${member.name})?`,
      description:
        'Approving activates cooperative membership immediately and dispatches a welcome notification.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
      ],
      confirmLabel: 'Approve Signup',
      run: async () => {
        const res = await api.updateMember(member.id, { status: 'active' });
        setMembers(res.members);
        setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
        await Promise.all([onRefresh(), loadMembers()]);
        showNotice(
          'emerald',
          'Member Approved & Activated',
          `${member.name} (${member.memberCode}) is now an active cooperative member. Welcome notification queued.`
        );
      },
    });
  }

  function confirmDeclinePendingMember(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: `Decline Application (${member.name})?`,
      description: 'Declining rejects and removes this pending membership registration.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
      ],
      confirmLabel: 'Decline Application',
      run: async () => {
        const res = await api.declinePendingMember(member.id);
        setMembers(res.members);
        setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
        await Promise.all([onRefresh(), loadMembers()]);
        showNotice(
          'amber',
          'Pending Registration Declined',
          `Pending member registration for ${member.name} (${member.memberCode}) was declined and removed.`
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
        title: `Approve Profile Update (${req.memberName})?`,
        description: 'Applying immediately updates the member’s encrypted profile record.',
        details: [
          { label: 'Member', value: `${req.memberName} (${req.memberCode})` },
          { label: 'Requested Changes', value: changesSummary || 'Profile update' },
        ],
        confirmLabel: 'Approve Update',
        run: async () => {
          setProfileBusyId(req.id);
          try {
            await api.reviewProfileChangeRequest(req.id, 'approved');
            await Promise.all([onRefresh(), loadMembers()]);
            showNotice(
              'emerald',
              'Profile Update Approved',
              `${req.memberName}'s profile changes have been applied.`
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
        title: `Decline Profile Update (${req.memberName})?`,
        description:
          'Provide a clear correction note explaining why this profile modification request is declined.',
        details: [
          { label: 'Member', value: `${req.memberName} (${req.memberCode})` },
          { label: 'Requested Changes', value: changesSummary || 'Profile update' },
        ],
        inputLabel: 'Reason for Declining (min 3 chars)',
        inputPlaceholder: 'Explain why this update could not be approved…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Decline Profile Update',
        run: async (note) => {
          setProfileBusyId(req.id);
          try {
            await api.reviewProfileChangeRequest(req.id, 'rejected', note.trim());
            await Promise.all([onRefresh(), loadMembers()]);
            showNotice(
              'amber',
              'Profile Update Declined',
              `Profile update request from ${req.memberName} was declined with your feedback note.`
            );
          } finally {
            setProfileBusyId(null);
          }
        },
      });
    }
  }

  const pendingCount = members.filter((m) => m.status === 'pending_approval').length;
  const pendingProfileRequests = profileRequests.filter((r) => r.status === 'pending');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
            <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Admin Governance · Member Lifecycle</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Member Registry ({members.length} accounts · {pendingCount} pending approval)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Approve or decline new member applications, edit profiles, adjust RBAC roles, block or
            suspend accounts, reactivate members, and inspect active member records.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit shrink-0">
          {(
            [
              { id: 'manage', label: 'Approvals & User Control' },
              { id: 'directory', label: 'Verified Member Directory' },
            ] as const
          ).map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="registry-subtab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <AnimatePresence mode="wait">
      {subTab === 'manage' ? (
        <motion.div
          key="registry-manage"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="space-y-6"
        >
          {pendingProfileRequests.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Admin &amp; Manager Approval Queue</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  Pending Profile Update Requests ({pendingProfileRequests.length})
                </h3>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {pendingProfileRequests.map((req) => (
                  <div key={req.id} className="p-4 space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {req.memberName} ({req.memberCode}) ·{' '}
                          <span className="font-mono text-slate-500">
                            {formatDateTime(req.requestedAt)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                          {Object.entries(req.requestedChanges).map(([k, v]) => (
                            <div key={k}>
                              <span className="font-mono text-slate-400">{k}:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-white">
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={profileBusyId === req.id || modalBusy}
                          onClick={() => confirmProfileChangeReview(req, 'rejected')}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={profileBusyId === req.id || modalBusy}
                          onClick={() => confirmProfileChangeReview(req, 'approved')}
                          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          Approve Update
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
        </motion.div>
      ) : (
        <motion.div
          key="registry-directory"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
        >
          <ActiveMembersView
            user={user}
            config={config}
            onViewMemberProfile={onViewMemberProfile}
          />
        </motion.div>
      )}
      </AnimatePresence>

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
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
          >
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3
                  id="registry-member-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Registration &amp; KYC Details · {inspectingMember.name}
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {inspectingMember.memberCode} · {inspectingMember.email} · Applied{' '}
                  {formatDateTime(inspectingMember.joinedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                aria-label="Close registration details"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs">
              {(() => {
                const reg = inspectingMember.registrationDetails;
                const portrait = reg?.photoUrl || inspectingMember.photoUrl;
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          Applicant Photo
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
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                            No photo uploaded
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          Agreement Paper Photo (Optional)
                        </div>
                        {reg?.agreementPhotoUrl ? (
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
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                            Not provided (optional)
                          </div>
                        )}
                      </div>
                    </div>

                    {reg ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Date of Birth</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.dateOfBirth}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Reference (Existing Member)
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.referenceMemberName}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Mobile Number</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.mobile}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">National ID (NID)</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.nid}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Occupation</div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.occupation}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Company / Organization
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.companyOrganization}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Present Address</div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.presentAddress}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Permanent Address
                          </div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.permanentAddress}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500">
                        No extended KYC registration payload stored for this account.
                      </div>
                    )}
                    {reg?.nominees && reg.nominees.length > 0 && (
                      <NomineeDetailsList nominees={reg.nominees} compact />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
              {isAdmin && inspectingMember.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmDeclinePendingMember(inspectingMember)}
                    className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Decline Application</span>
                  </button>
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => confirmApprovePendingMember(inspectingMember)}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Approve Signup</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
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
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        inputMultiline={modal?.mode === 'confirm' ? modal.inputMultiline : false}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
