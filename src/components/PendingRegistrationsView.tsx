'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
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
      run: () => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

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

  async function runConfirmedModal() {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run();
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
      showNotice(
        'red',
        'Could Not Load Registrations',
        err instanceof Error
          ? err.message
          : 'Failed to load pending user registrations from the database.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPendingRegistrations();
  }, [loadPendingRegistrations]);

  function confirmApprove(member: MemberSummary) {
    const reg = member.registrationDetails;
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Approve Membership (${member.name})?`,
      description:
        'Approving activates cooperative access immediately and queues a welcome email notification.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
        ...(reg?.nid ? [{ label: 'National ID (NID)', value: reg.nid }] : []),
        ...(reg?.mobile ? [{ label: 'Mobile', value: reg.mobile }] : []),
      ],
      confirmLabel: 'Approve & Activate Member',
      run: async () => {
        setBusyAction({ id: member.id, type: 'approve' });
        try {
          const res = await api.updateMember(member.id, { status: 'active' });
          setRegistrations((prev) => prev.filter((item) => item.id !== member.id));
          await onRefresh();
          showNotice(
            'emerald',
            'Member Registration Approved',
            res.emailSent
              ? `Approved ${member.name} (${member.memberCode}). Account is now active and welcome email sent to ${member.email}.`
              : `Approved ${member.name} (${member.memberCode}). Account is active and welcome notice queued in-app${res.emailReason ? ` (email skipped: ${res.emailReason})` : ''}.`,
            [
              { label: 'Member', value: `${member.name} (${member.memberCode})` },
              {
                label: 'Welcome Email',
                value: res.emailSent ? `Sent to ${member.email}` : 'In-App Only',
              },
            ]
          );
        } finally {
          setBusyAction(null);
        }
      },
    });
  }

  function confirmReject(member: MemberSummary) {
    const reg = member.registrationDetails;
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: `Reject Application (${member.name})?`,
      description:
        'Rejecting permanently declines this pending registration and removes pending access.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
        ...(reg?.nid ? [{ label: 'National ID (NID)', value: reg.nid }] : []),
      ],
      confirmLabel: 'Reject Application',
      run: async () => {
        setBusyAction({ id: member.id, type: 'reject' });
        try {
          await api.declinePendingMember(member.id);
          setRegistrations((prev) => prev.filter((item) => item.id !== member.id));
          await onRefresh();
          showNotice(
            'amber',
            'Registration Rejected',
            `Rejected registration for ${member.name} (${member.memberCode}) and removed pending access.`
          );
        } finally {
          setBusyAction(null);
        }
      },
    });
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
  }, [registrations, searchQuery]);

  if (!isAdmin) {
    return (
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 sm:p-8 shadow-xs">
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Header & Controls */}
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs transition-all duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Admin-Only Access Verification</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Pending User Registrations{' '}
              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                ({registrations.length})
              </span>
            </h2>
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
                className="pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-56 sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
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
      </section>

      {/* Loading / Empty / Registration Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 space-y-4"
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
        <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-2 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            No Pending User Registrations
          </h3>
        </section>
      ) : filteredRegistrations.length === 0 ? (
        <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-2 shadow-xs">
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
                className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-xs hover:border-amber-300 dark:hover:border-amber-700/70 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
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
                      disabled={isBusy || modalBusy}
                      onClick={() => confirmReject(applicant)}
                      className="px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isBusy && busyAction?.type === 'reject' ? 'Rejecting…' : 'Reject'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || modalBusy}
                      onClick={() => confirmApprove(applicant)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
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

                      {reg.nominees && reg.nominees.length > 0 && (
                        <div className="sm:col-span-2 lg:col-span-3">
                          <NomineeDetailsList nominees={reg.nominees} />
                        </div>
                      )}
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
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-center p-2 text-[11px] text-slate-500 dark:text-slate-400">
                          No photo available
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-slate-500 dark:text-slate-400 font-medium">
                        Agreement Paper
                      </div>
                      {agreementUrl && !brokenImages[agreementKey] ? (
                        isPdfFileUrl(agreementUrl) ? (
                          <a
                            href={agreementUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group aspect-[4/3] rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/30 flex flex-col items-center justify-center gap-1.5 p-2 text-center hover:border-emerald-500 transition-colors"
                          >
                            <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1">
                              <span>View PDF</span>
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
                        )
                      ) : (
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center p-2 text-[11px] text-slate-500 dark:text-slate-400 gap-1">
                          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
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

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
