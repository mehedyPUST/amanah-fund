'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { MemberSummary, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';

interface PendingRegistrationsViewProps {
  user: PublicUser;
  onRefresh: () => Promise<void>;
}

export function PendingRegistrationsView({ user, onRefresh }: PendingRegistrationsViewProps) {
  const isAdmin = user.role === 'admin';

  const [registrations, setRegistrations] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyAction, setBusyAction] = useState<{ id: string; type: 'approve' | 'reject' } | null>(
    null
  );
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadPendingRegistrations = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getPendingRegistrations();
      setRegistrations(res.registrations);
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to load pending user registrations from the database.',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPendingRegistrations();
  }, [loadPendingRegistrations]);

  async function handleApprove(member: MemberSummary) {
    setBusyAction({ id: member.id, type: 'approve' });
    setFeedback(null);
    try {
      await api.updateMember(member.id, { status: 'active' });
      setRegistrations((prev) => prev.filter((item) => item.id !== member.id));
      setFeedback({
        type: 'success',
        text: `Approved ${member.name} (${member.memberCode}). Account is now active and welcome notice queued.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to approve user registration.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReject(member: MemberSummary) {
    setBusyAction({ id: member.id, type: 'reject' });
    setFeedback(null);
    try {
      await api.declinePendingMember(member.id);
      setRegistrations((prev) => prev.filter((item) => item.id !== member.id));
      setFeedback({
        type: 'success',
        text: `Rejected registration for ${member.name} (${member.memberCode}) and removed pending access.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reject user registration.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((m) => {
      const reg = m.registrationDetails;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        (reg?.nid || '').toLowerCase().includes(q) ||
        (reg?.mobile || '').toLowerCase().includes(q) ||
        (reg?.referenceMemberName || '').toLowerCase().includes(q) ||
        (reg?.occupation || '').toLowerCase().includes(q) ||
        (reg?.companyOrganization || '').toLowerCase().includes(q) ||
        (reg?.presentAddress || '').toLowerCase().includes(q) ||
        (reg?.permanentAddress || '').toLowerCase().includes(q)
      );
    });
  }, [registrations, searchQuery]);

  if (!isAdmin) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Administrator Access Required
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Pending user registration records contain National ID (NID), residential addresses, and
              verification documents restricted strictly to cooperative administrators.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Admin-Only Access Verification</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Pending User Registrations{' '}
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                ({registrations.length})
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review full applicant KYC credentials—National ID, residential addresses, occupation,
              and member reference—before approving or rejecting cooperative access.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, NID, address…"
                aria-label="Search pending registrations"
                className="pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-56 sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadPendingRegistrations()}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

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
      </section>

      {/* Loading / Empty / Registration Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
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
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            No Pending User Registrations
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Every submitted cooperative membership application has been reviewed. New sign-ups from
            the registration page will appear here automatically for approval.
          </p>
        </section>
      ) : filteredRegistrations.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            No Matching Applicants
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No pending registration matches &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-2 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Clear Search
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {filteredRegistrations.map((applicant) => {
            const reg = applicant.registrationDetails;
            const photoUrl = reg?.photoUrl || applicant.photoUrl;
            const agreementUrl = reg?.agreementPhotoUrl;
            const isBusy = busyAction?.id === applicant.id;
            const photoKey = `photo-${applicant.id}`;
            const agreementKey = `agreement-${applicant.id}`;

            return (
              <article
                key={applicant.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs hover:border-amber-300 dark:hover:border-amber-700/70 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
              >
                {/* Applicant Header & Primary Approve / Reject Actions */}
                <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-4 min-w-0">
                    {photoUrl && !brokenImages[photoKey] ? (
                      <a
                        href={photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open applicant photo in new tab"
                        className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800 block"
                      >
                        <img
                          src={photoUrl}
                          alt={`${applicant.name} portrait`}
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
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                          {applicant.memberCode}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          ·
                        </span>
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                          Pending Approval
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <span>{applicant.email}</span>
                        {(applicant.authProvider === 'google' ||
                          applicant.authProvider === 'both') && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans font-medium text-emerald-700 dark:text-emerald-400">
                              Google Verified
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>Applied {formatDateTime(applicant.joinedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleReject(applicant)}
                      className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isBusy && busyAction?.type === 'reject' ? 'Rejecting…' : 'Reject'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleApprove(applicant)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isBusy && busyAction?.type === 'approve' ? 'Approving…' : 'Approve'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Full KYC Details & Verification Attachments (Flat Grid, Hairline Dividers) */}
                <div className="p-5 sm:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {reg ? (
                    <dl className="xl:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-xs">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">National ID (NID)</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white break-all">
                          {reg.nid}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Mobile Number</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {reg.mobile}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Date of Birth</dt>
                        <dd className="mt-1 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {reg.dateOfBirth}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Reference (Existing Member)
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.referenceMemberName}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Occupation</dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.occupation}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Company / Organization
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {reg.companyOrganization}
                        </dd>
                      </div>

                      <div className="sm:col-span-2 lg:col-span-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Present Address</dt>
                          <dd className="mt-1 text-slate-900 dark:text-slate-100 leading-relaxed">
                            {reg.presentAddress}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Permanent Address</dt>
                          <dd className="mt-1 text-slate-900 dark:text-slate-100 leading-relaxed">
                            {reg.permanentAddress}
                          </dd>
                        </div>
                      </div>
                    </dl>
                  ) : (
                    <div className="xl:col-span-8 text-xs text-slate-500 dark:text-slate-400 flex items-center">
                      Extended KYC registration payload was not attached to this account record.
                    </div>
                  )}

                  {/* Document Verification Previews */}
                  <div className="xl:col-span-4 xl:border-l xl:border-slate-100 dark:xl:border-slate-800 xl:pl-6 grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="text-slate-500 dark:text-slate-400 font-medium">
                        Applicant Photo
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
                            alt={`${applicant.name} verification portrait`}
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
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-center p-2 text-[11px] text-slate-400">
                          No photo available
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-slate-500 dark:text-slate-400 font-medium">
                        Agreement Paper
                      </div>
                      {agreementUrl && !brokenImages[agreementKey] ? (
                        <a
                          href={agreementUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 aspect-[4/3]"
                        >
                          <img
                            src={agreementUrl}
                            alt={`${applicant.name} signed agreement paper`}
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
                      ) : (
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center p-2 text-[11px] text-slate-400 gap-1">
                          <FileText className="w-4 h-4 text-slate-400" aria-hidden="true" />
                          <span>Optional (none)</span>
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
    </div>
  );
}
