'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { ActiveMembersView } from './ActiveMembersView.tsx';
import { AdminUserManagementPanel } from './AdminUserManagementPanel.tsx';
import { PendingRegistrationsView } from './PendingRegistrationsView.tsx';

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
  const [rejectingProfileReqId, setRejectingProfileReqId] = useState<string | null>(null);
  const [profileRejectNote, setProfileRejectNote] = useState('');
  const [profileBusyId, setProfileBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspectingMember, setInspectingMember] = useState<MemberSummary | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

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
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load member registry.',
      });
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function handleMemberChange(
    memberId: string,
    payload: { role?: UserRole; status?: UserStatus }
  ) {
    setFeedback(null);
    try {
      const res = await api.updateMember(memberId, payload);
      setMembers(res.members);
      setInspectingMember((prev) => (prev?.id === memberId ? null : prev));
      setFeedback({
        type: 'success',
        text:
          payload.status === 'active'
            ? 'Member approved and activated. Welcome notification queued.'
            : 'Member registry record updated.',
      });
      await Promise.all([onRefresh(), loadMembers()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update member.',
      });
    }
  }

  async function handleDeclinePending(memberId: string) {
    setFeedback(null);
    try {
      const res = await api.declinePendingMember(memberId);
      setMembers(res.members);
      setInspectingMember((prev) => (prev?.id === memberId ? null : prev));
      setFeedback({ type: 'success', text: 'Pending member registration declined and removed.' });
      await Promise.all([onRefresh(), loadMembers()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to decline pending registration.',
      });
    }
  }

  async function handleReviewProfileChange(
    requestId: string,
    decision: 'approved' | 'rejected',
    note?: string
  ) {
    if (decision === 'rejected' && (!note || note.trim().length < 3)) {
      setFeedback({
        type: 'error',
        text: 'Please provide a brief correction note explaining why the profile change is declined.',
      });
      return;
    }
    setProfileBusyId(requestId);
    setFeedback(null);
    try {
      await api.reviewProfileChangeRequest(requestId, decision, note?.trim());
      setRejectingProfileReqId(null);
      setProfileRejectNote('');
      setFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? 'Member profile update approved and applied.'
            : 'Profile update request declined with feedback.',
      });
      await Promise.all([onRefresh(), loadMembers()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review profile change request.',
      });
    } finally {
      setProfileBusyId(null);
    }
  }

  const pendingCount = members.filter((m) => m.status === 'pending_approval').length;
  const pendingProfileRequests = profileRequests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
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
          <button
            type="button"
            onClick={() => setSubTab('manage')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'manage'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Approvals &amp; User Control
          </button>
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'directory'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Verified Member Directory
          </button>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {subTab === 'manage' ? (
        <div className="space-y-6">
          {pendingProfileRequests.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
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
                          disabled={profileBusyId === req.id}
                          onClick={() => {
                            setRejectingProfileReqId(req.id);
                            setProfileRejectNote('');
                          }}
                          className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white cursor-pointer disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={profileBusyId === req.id}
                          onClick={() => void handleReviewProfileChange(req.id, 'approved')}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                        >
                          Approve Update
                        </button>
                      </div>
                    </div>

                    {rejectingProfileReqId === req.id && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <input
                          type="text"
                          value={profileRejectNote}
                          onChange={(e) => setProfileRejectNote(e.target.value)}
                          placeholder="Reason for declining profile edit…"
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void handleReviewProfileChange(req.id, 'rejected', profileRejectNote)
                          }
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium cursor-pointer"
                        >
                          Confirm Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingProfileReqId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
              onFeedback={setFeedback}
            />
          )}
        </div>
      ) : (
        <ActiveMembersView
          user={user}
          config={config}
          onViewMemberProfile={onViewMemberProfile}
        />
      )}

      {/* Admin Inspection Modal: Full Applicant / Member Registration Details */}
      {inspectingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registry-member-modal-title"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
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
                  </>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
              {isAdmin && inspectingMember.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDeclinePending(inspectingMember.id)}
                    className="px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Decline Application</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleMemberChange(inspectingMember.id, { status: 'active' })
                    }
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
          </div>
        </div>
      )}
    </div>
  );
}
