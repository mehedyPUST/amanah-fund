'use client';

import { useState, type FormEvent } from 'react';
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import type {
  Contribution,
  CoopMeeting,
  DecisionPoll,
  FundConfig,
  HalalProject,
  LoanRequest,
  ProfileChangeRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatBillingMonth, formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface ManagerDeskViewProps {
  user: PublicUser;
  config: FundConfig | null;
  availableLiquidity: number;
  contributions: Contribution[];
  loans: LoanRequest[];
  halalProjects: HalalProject[];
  polls: DecisionPoll[];
  meetings: CoopMeeting[];
  profileChangeRequests: ProfileChangeRequest[];
  onRefresh: () => Promise<void>;
}

export function ManagerDeskView({
  user,
  config,
  availableLiquidity,
  contributions,
  loans,
  halalProjects,
  polls,
  meetings,
  profileChangeRequests,
  onRefresh,
}: ManagerDeskViewProps) {
  const ccy = config?.currency || 'BDT';
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Per-item correction notes for contributions, installments, profile requests
  const [contribNotes, setContribNotes] = useState<Record<string, string>>({});
  const [installmentNotes, setInstallmentNotes] = useState<Record<string, string>>({});
  const [profileNotes, setProfileNotes] = useState<Record<string, string>>({});

  // Create Decision Poll state
  const [pollTitle, setPollTitle] = useState('');
  const [pollDesc, setPollDesc] = useState('');
  const [pollCategory, setPollCategory] = useState<DecisionPoll['category']>('general');
  const [pollOptions, setPollOptions] = useState<string[]>(['Approve', 'Decline']);
  const [pollClosesAt, setPollClosesAt] = useState('');

  // Schedule Meeting state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingWhen, setMeetingWhen] = useState('');
  const [meetingWhere, setMeetingWhere] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');

  const pendingContributions = contributions.filter((c) => c.status === 'pending');
  const pendingReviewLoans = loans.filter((l) => l.status === 'pending_manager_review');
  const pendingDisbursementLoans = loans.filter(
    (l) => l.status === 'approved_pending_disbursement'
  );
  const votingLoans = loans.filter((l) => l.status === 'pending_vote');
  const openPolls = polls.filter((p) => p.status === 'open');
  const openProjects = halalProjects.filter((p) => p.votingStatus === 'open');
  const pendingInstallments = loans.flatMap((loan) =>
    loan.installments
      .filter((inst) => inst.status === 'pending_verification')
      .map((inst) => ({ loan, inst }))
  );
  const pendingProfileRequests = profileChangeRequests.filter(
    (r) => r.status === 'pending' && (user.role === 'admin' || r.userId !== user.id)
  );

  async function handleContributionDecision(id: string, decision: 'approved' | 'rejected') {
    const note = (contribNotes[id] || '').trim();
    if (decision === 'rejected' && !note) {
      setFeedback({
        type: 'error',
        text: 'Please enter a correction message explaining why this contribution is denied.',
      });
      return;
    }
    setBusyKey(`contrib-${id}`);
    setFeedback(null);
    try {
      await api.reviewContribution(id, decision, note || undefined);
      setContribNotes((prev) => ({ ...prev, [id]: '' }));
      setFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? 'Contribution approved and added to fund balance.'
            : 'Contribution denied with correction message sent to member.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review contribution.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInstallmentDecision(
    loanId: string,
    installmentNumber: number,
    decision: 'approve' | 'reject'
  ) {
    const key = `${loanId}#${installmentNumber}`;
    const note = (installmentNotes[key] || '').trim();
    if (decision === 'reject' && !note) {
      setFeedback({
        type: 'error',
        text: 'Please enter a correction note before denying an installment payment.',
      });
      return;
    }
    setBusyKey(`inst-${key}`);
    setFeedback(null);
    try {
      await api.verifyInstallmentRepayment(loanId, installmentNumber, decision, note || undefined);
      setInstallmentNotes((prev) => ({ ...prev, [key]: '' }));
      setFeedback({
        type: 'success',
        text:
          decision === 'approve'
            ? `Installment #${installmentNumber} verified and restored to fund balance.`
            : `Installment #${installmentNumber} denied with correction note sent to borrower.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to verify installment.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInitiateLoanVote(loanId: string) {
    setBusyKey(`init-${loanId}`);
    setFeedback(null);
    try {
      await api.initiateLoanVote(loanId);
      setFeedback({
        type: 'success',
        text: `Secret Opinion Ballot vote initiated for ${loanId}. Members have been notified.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not initiate Qard Hasan vote.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeclineLoanReview(loanId: string) {
    setBusyKey(`decl-${loanId}`);
    setFeedback(null);
    try {
      await api.adminReviewLoan(loanId, 'reject', 'Declined during Manager pre-vote review.');
      setFeedback({
        type: 'success',
        text: `Qard Hasan request ${loanId} declined and borrower notified.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not decline loan request.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleConfirmDisbursement(loanId: string) {
    setBusyKey(`disb-${loanId}`);
    setFeedback(null);
    try {
      await api.disburseLoan(loanId);
      setFeedback({
        type: 'success',
        text: `Qard Hasan ${loanId} confirmed and disbursed. Principal deducted from central fund balance and borrower notified.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not confirm disbursement.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRevealLoanVote(loanId: string) {
    setBusyKey(`rev-loan-${loanId}`);
    setFeedback(null);
    try {
      await api.revealLoanVote(loanId);
      setFeedback({
        type: 'success',
        text: `Voting stopped and results revealed for Qard Hasan ${loanId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reveal Qard Hasan vote results.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRevealProjectVote(projectId: string) {
    setBusyKey(`rev-proj-${projectId}`);
    setFeedback(null);
    try {
      await api.revealHalalProjectVote(projectId);
      setFeedback({
        type: 'success',
        text: `Voting stopped and results revealed for investment proposal ${projectId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reveal investment vote results.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRevealPoll(pollId: string) {
    setBusyKey(`rev-poll-${pollId}`);
    setFeedback(null);
    try {
      await api.revealPoll(pollId);
      setFeedback({
        type: 'success',
        text: 'Decision poll stopped and results revealed to all members.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reveal poll results.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreatePoll(e: FormEvent) {
    e.preventDefault();
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) {
      setFeedback({ type: 'error', text: 'Provide at least 2 poll options.' });
      return;
    }
    setBusyKey('create-poll');
    setFeedback(null);
    try {
      await api.createPoll({
        title: pollTitle.trim(),
        description: pollDesc.trim() || undefined,
        category: pollCategory,
        options: cleanedOptions,
        closesAt: pollClosesAt || undefined,
      });
      setPollTitle('');
      setPollDesc('');
      setPollOptions(['Approve', 'Decline']);
      setPollClosesAt('');
      setFeedback({
        type: 'success',
        text: 'Decision vote initiated. Members have been notified to cast secret ballots.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not initiate decision poll.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleScheduleMeeting(e: FormEvent) {
    e.preventDefault();
    setBusyKey('create-meeting');
    setFeedback(null);
    try {
      await api.createMeeting({
        title: meetingTitle.trim(),
        agenda: meetingAgenda.trim() || undefined,
        scheduledFor: meetingWhen.trim(),
        locationOrLink: meetingWhere.trim(),
      });
      setMeetingTitle('');
      setMeetingWhen('');
      setMeetingWhere('');
      setMeetingAgenda('');
      setFeedback({
        type: 'success',
        text: 'Cooperative meeting scheduled and notice dispatched to all active members.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not schedule meeting.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleMeetingStatus(id: string, status: CoopMeeting['status']) {
    setBusyKey(`mtg-${id}`);
    setFeedback(null);
    try {
      await api.updateMeetingStatus(id, status);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update meeting status.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleProfileReqReview(id: string, decision: 'approved' | 'rejected') {
    const note = (profileNotes[id] || '').trim();
    if (decision === 'rejected' && !note) {
      setFeedback({
        type: 'error',
        text: 'Please provide a reason when declining a profile update request.',
      });
      return;
    }
    setBusyKey(`prof-${id}`);
    setFeedback(null);
    try {
      await api.reviewProfileChangeRequest(id, decision, note || undefined);
      setProfileNotes((prev) => ({ ...prev, [id]: '' }));
      setFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? 'Member profile update approved and applied.'
            : 'Profile update request declined.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review profile change request.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Manager Governance Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Manager Governance &amp; Treasury Verification Desk</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Approvals, Secret Ballot Control, Meeting Scheduler &amp; Fund Disbursements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Verify Bank/MFS contributions and Hasan installments, initiate or reveal Opinion Ballots,
            confirm Qard Hasan fund deductions, and schedule cooperative meetings.
          </p>
        </div>
        <div className="text-xs font-mono shrink-0 px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300">
          Available Fund Balance: {formatMoney(availableLiquidity, ccy)}
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

      {/* 1. Contribution Verification Queue */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Pending Monthly Contributions ({pendingContributions.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect decrypted transfer details and approve to credit the fund balance, or deny with a
              correction note.
            </p>
          </div>
        </div>

        {pendingContributions.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            All submitted contributions have been processed.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {pendingContributions.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {c.memberName} ({c.memberCode}) ·{' '}
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {formatMoney(c.amount, ccy)}
                      </span>{' '}
                      · <span className="font-mono">{formatBillingMonth(c.billingMonth)}</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 font-mono">
                      {c.channel.toUpperCase()} · {c.providerName} · TrxID:{' '}
                      {c.decryptedDetails?.referenceId || c.maskedReference} · Sender:{' '}
                      {c.decryptedDetails?.senderAccount || '—'}
                    </div>
                    {c.decryptedDetails?.notes && (
                      <div className="text-slate-500 dark:text-slate-400">
                        Member note: {c.decryptedDetails.notes}
                      </div>
                    )}
                    {c.receiptPhotoUrl && (
                      <a
                        href={c.receiptPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                      >
                        <span>Inspect Attached Receipt Slip</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={contribNotes[c.id] || ''}
                      onChange={(e) =>
                        setContribNotes((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="Correction note (required to deny)…"
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 min-w-[220px]"
                    />
                    <button
                      type="button"
                      disabled={busyKey === `contrib-${c.id}`}
                      onClick={() => void handleContributionDecision(c.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `contrib-${c.id}`}
                      onClick={() => void handleContributionDecision(c.id, 'rejected')}
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Deny</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Qard Hasan Applications & Disbursements */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Qard Hasan Initiation &amp; Disbursement Confirmation (
            {pendingReviewLoans.length + pendingDisbursementLoans.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Initiate 2/3 member voting on reviewed requests, and confirm approved Qard Hasan loans to
            deduct from the central fund balance.
          </p>
        </div>

        {pendingReviewLoans.length === 0 && pendingDisbursementLoans.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            No Qard Hasan applications awaiting Manager vote initiation or disbursement confirmation.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {pendingReviewLoans.map((loan) => (
              <div
                key={loan.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {loan.id}
                    </span>
                    <StatusText status={loan.status} />
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white text-sm">
                    {loan.borrowerName} ({loan.borrowerCode}) ·{' '}
                    <span className="font-mono">{formatMoney(loan.amount, ccy)}</span> (
                    {loan.installmentMonths} months)
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{loan.purpose}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyKey === `init-${loan.id}`}
                    onClick={() => void handleInitiateLoanVote(loan.id)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Vote className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Initiate Vote</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyKey === `decl-${loan.id}`}
                    onClick={() => void handleDeclineLoanReview(loan.id)}
                    className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}

            {pendingDisbursementLoans.map((loan) => (
              <div
                key={loan.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-emerald-50/35 dark:bg-emerald-950/10"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {loan.id}
                    </span>
                    <StatusText status={loan.status} />
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white text-sm">
                    {loan.borrowerName} ({loan.borrowerCode}) ·{' '}
                    <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                  </div>
                  {loan.decryptedSensitiveNotes && (
                    <div className="font-mono text-slate-600 dark:text-slate-400">
                      Payout: {loan.decryptedSensitiveNotes.channel.toUpperCase()} ·{' '}
                      {loan.decryptedSensitiveNotes.provider} ·{' '}
                      {loan.decryptedSensitiveNotes.disbursementAccount}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyKey === `disb-${loan.id}`}
                  onClick={() => void handleConfirmDisbursement(loan.id)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Confirm Disbursement &amp; Deduct Balance</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Pending Hasan Installment Verifications */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Qard Hasan Installment Verification Queue ({pendingInstallments.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Accept verified installment receipts to restore central balance, or deny with a mandatory
            correction note.
          </p>
        </div>

        {pendingInstallments.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            No Qard Hasan installment receipts awaiting verification.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {pendingInstallments.map(({ loan, inst }) => {
              const key = `${loan.id}#${inst.installmentNumber}`;
              return (
                <div
                  key={key}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {loan.borrowerName} ({loan.borrowerCode}) · {loan.id} Installment #
                      {inst.installmentNumber} ·{' '}
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {formatMoney(inst.amount, ccy)}
                      </span>
                    </div>
                    <div className="font-mono text-slate-600 dark:text-slate-400">
                      {inst.repaymentChannel?.toUpperCase()} · {inst.repaymentProvider} · Ref:{' '}
                      {inst.decryptedReceipt?.referenceId || inst.maskedReference}
                    </div>
                    {inst.receiptPhotoUrl && (
                      <a
                        href={inst.receiptPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                      >
                        <span>View Repayment Slip</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={installmentNotes[key] || ''}
                      onChange={(e) =>
                        setInstallmentNotes((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder="Correction note (required to deny)…"
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 min-w-[210px]"
                    />
                    <button
                      type="button"
                      disabled={busyKey === `inst-${key}`}
                      onClick={() =>
                        void handleInstallmentDecision(loan.id, inst.installmentNumber, 'approve')
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `inst-${key}`}
                      onClick={() =>
                        void handleInstallmentDecision(loan.id, inst.installmentNumber, 'reject')
                      }
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Deny</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Initiate Decision Vote + Active Secret Ballots to Reveal */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Vote className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Initiate Decision Poll</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Open Secret Member Vote for Cooperative Decision
          </h3>

          <form onSubmit={handleCreatePoll} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Decision Question / Title
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={pollTitle}
                onChange={(e) => setPollTitle(e.target.value)}
                placeholder="e.g. Increase annual emergency cap?"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={pollCategory}
                  onChange={(e) => setPollCategory(e.target.value as DecisionPoll['category'])}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="general">General Decision</option>
                  <option value="policy">Policy / Rules</option>
                  <option value="project">Venture / Project</option>
                  <option value="qard_hasan">Qard Hasan Policy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Close Date (Optional)
                </label>
                <input
                  type="date"
                  value={pollClosesAt}
                  onChange={(e) => setPollClosesAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Context / Description
              </label>
              <textarea
                rows={2}
                value={pollDesc}
                onChange={(e) => setPollDesc(e.target.value)}
                placeholder="Explain the cooperative decision or options..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Ballot Options ({pollOptions.length}/6)</span>
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ''])}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    <span>Add Option</span>
                  </button>
                )}
              </div>
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) =>
                        prev.map((item, i) => (i === idx ? e.target.value : item))
                      )
                    }
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label="Remove option"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={busyKey === 'create-poll'}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {busyKey === 'create-poll' ? 'Opening Secret Vote…' : 'Launch Decision Vote'}
            </button>
          </form>
        </section>

        {/* Ongoing Secret Votes -> Stop & Reveal */}
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Ongoing Secret Ballots ({votingLoans.length + openPolls.length + openProjects.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Individual votes remain strictly private. Click &ldquo;Stop &amp; Reveal Result&rdquo;
              when ready to close voting and publish aggregate results to members.
            </p>
          </div>

          {votingLoans.length + openPolls.length + openProjects.length === 0 ? (
            <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              No active ballots currently running.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {votingLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Qard Hasan · {loan.borrowerName} ({loan.id}) ·{' '}
                      <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono">
                      Poll Ongoing · {loan.totalVotesCast ?? loan.votes.length} ballot(s) cast (secret
                      until revealed)
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === `rev-loan-${loan.id}`}
                    onClick={() => void handleRevealLoanVote(loan.id)}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop &amp; Reveal Result</span>
                  </button>
                </div>
              ))}

              {openPolls.map((poll) => (
                <div
                  key={poll.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Decision Poll · {poll.title}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono">
                      Poll Ongoing · {poll.totalVotesCast ?? poll.votes.length} ballot(s) cast
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === `rev-poll-${poll.id}`}
                    onClick={() => void handleRevealPoll(poll.id)}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop &amp; Reveal Result</span>
                  </button>
                </div>
              ))}

              {openProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Venture Proposal · {proj.title} ({formatMoney(proj.targetAllocation, ccy)})
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono">
                      Poll Ongoing · {proj.totalVotesCast ?? proj.votes.length} ballot(s) cast
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === `rev-proj-${proj.id}`}
                    onClick={() => void handleRevealProjectVote(proj.id)}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop &amp; Reveal Result</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 5. Schedule Cooperative Meeting & Pending Profile Updates */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CalendarPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Meeting Scheduler</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Schedule Cooperative Meeting
          </h3>

          <form onSubmit={handleScheduleMeeting} className="space-y-3">
            <input
              type="text"
              required
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Meeting title (e.g. Monthly Shariah & Treasury Review)"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="datetime-local"
                required
                value={meetingWhen}
                onChange={(e) => setMeetingWhen(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                value={meetingWhere}
                onChange={(e) => setMeetingWhere(e.target.value)}
                placeholder="Room / Google Meet / Zoom link"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <textarea
              rows={2}
              value={meetingAgenda}
              onChange={(e) => setMeetingAgenda(e.target.value)}
              placeholder="Meeting agenda & discussion points…"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={busyKey === 'create-meeting'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {busyKey === 'create-meeting'
                ? 'Scheduling & Notifying Members…'
                : 'Schedule Meeting & Notify All Members'}
            </button>
          </form>

          {meetings.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Scheduled Meetings ({meetings.length})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                {meetings.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="truncate">{m.title}</span>
                        <StatusText status={m.status} />
                      </div>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(m.scheduledFor)} · {m.locationOrLink}
                      </div>
                    </div>
                    {m.status === 'scheduled' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busyKey === `mtg-${m.id}`}
                          onClick={() => void handleMeetingStatus(m.id, 'completed')}
                          className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 cursor-pointer"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `mtg-${m.id}`}
                          onClick={() => void handleMeetingStatus(m.id, 'cancelled')}
                          className="px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Pending Profile Update Approvals */}
        <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Profile Update Requests</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Pending Member Profile Change Requests ({pendingProfileRequests.length})
          </h3>

          {pendingProfileRequests.length === 0 ? (
            <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              No pending profile modification requests awaiting approval.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              {pendingProfileRequests.map((req) => (
                <div key={req.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {req.memberName} ({req.memberCode}) ·{' '}
                      <span className="capitalize font-normal text-slate-500">{req.memberRole}</span>
                    </span>
                    <span className="font-mono text-slate-400">
                      {formatShortDate(req.requestedAt)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 font-mono text-[11px] space-y-0.5 text-slate-700 dark:text-slate-300">
                    {Object.entries(req.requestedChanges).map(([k, v]) =>
                      v ? (
                        <div key={k}>
                          <span className="text-slate-400">{k}:</span> {String(v)}
                        </div>
                      ) : null
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={profileNotes[req.id] || ''}
                      onChange={(e) =>
                        setProfileNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      placeholder="Note (required to decline)…"
                      className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      disabled={busyKey === `prof-${req.id}`}
                      onClick={() => void handleProfileReqReview(req.id, 'approved')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `prof-${req.id}`}
                      onClick={() => void handleProfileReqReview(req.id, 'rejected')}
                      className="px-3 py-1.5 rounded border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
