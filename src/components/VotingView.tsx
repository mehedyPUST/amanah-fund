'use client';

import { useState } from 'react';
import {
  Check,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { FundConfig, HalalProject, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, shortHash } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface VotingViewProps {
  loans: LoanRequest[];
  projects: HalalProject[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function VotingView({
  loans,
  projects,
  config,
  user,
  loading,
  onRefresh,
}: VotingViewProps) {
  const ccy = config?.currency || 'BDT';
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isVerifiedMember = user.status === 'active';

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'loans' | 'investments'>('all');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  async function handleLoanVote(loanId: string, decision: 'upvote' | 'downvote') {
    if (!isVerifiedMember) {
      setFeedback({
        type: 'error',
        text: 'Only verified active cooperative members can vote on Qard Hasan loan requests.',
      });
      return;
    }
    setBusyId(loanId);
    setFeedback(null);
    try {
      const res = await api.voteLoan(loanId, decision, comments[loanId]);
      const updated = res.loan;
      const upvotes = updated.votes.filter((v) => v.decision === 'approve').length;
      setFeedback({
        type: 'success',
        text:
          updated.status === 'approved_pending_disbursement'
            ? `Your UPVOTE was recorded on ${loanId}. 2/3 majority reached (${upvotes}/${updated.requiredApprovals}) — queued for disbursement!`
            : updated.status === 'rejected'
              ? `Your DOWNVOTE was recorded on ${loanId}. Request can no longer reach 2/3 quorum and has been declined.`
              : `Your cryptographic ${decision.toUpperCase()} has been recorded on ${loanId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit vote.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleProjectVote(projectId: string, decision: 'yes' | 'no') {
    setBusyId(projectId);
    setFeedback(null);
    try {
      const res = await api.voteHalalProject(projectId, decision, comments[projectId]);
      const p = res.project;
      const yesVotes = p.votes.filter((v) => v.decision === 'yes').length;
      setFeedback({
        type: 'success',
        text:
          p.votingStatus === 'approved'
            ? `Vote "${decision.toUpperCase()}" recorded. "${p.title}" reached the 2/3 majority (${yesVotes}/${p.totalEligibleVoters}) and is Approved!`
            : `Your "${decision.toUpperCase()}" ballot on "${p.title}" has been broadcast in real time.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit placement vote.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisburse(loanId: string) {
    setBusyId(loanId);
    setFeedback(null);
    try {
      await api.disburseLoan(loanId);
      setFeedback({
        type: 'success',
        text: `Multi-sig treasury disbursement completed for ${loanId}. Repayment schedule is now active.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to disburse loan.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleGuarantorRespond(loanId: string, decision: 'accept' | 'decline') {
    setBusyId(loanId);
    setFeedback(null);
    try {
      await api.respondAsGuarantor(loanId, decision);
      setFeedback({
        type: 'success',
        text:
          decision === 'accept'
            ? `Guarantor co-signature recorded on ${loanId}.`
            : `Guarantor co-signature declined for ${loanId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to respond as guarantor.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const openProjects = projects.filter((p) => p.votingStatus === 'open');
  const closedProjects = projects.filter((p) => p.votingStatus !== 'open');

  const guarantorPendingForMe = loans.filter(
    (l) =>
      l.status === 'pending_guarantor' &&
      l.guarantors?.some((g) => g.memberId === user.id && g.status === 'pending')
  );
  const pendingOrApprovedLoans = loans.filter(
    (l) => l.status === 'pending_vote' || l.status === 'approved_pending_disbursement'
  );
  const archivedLoans = loans.filter(
    (l) =>
      l.status !== 'pending_vote' &&
      l.status !== 'approved_pending_disbursement' &&
      l.status !== 'pending_guarantor'
  );

  const showInvestments = categoryFilter === 'all' || categoryFilter === 'investments';
  const showLoans = categoryFilter === 'all' || categoryFilter === 'loans';

  return (
    <div className="space-y-6">
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

      {!isVerifiedMember && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Voting is restricted to verified active members. Your account status is currently{' '}
            <strong className="uppercase">{user.status.replace(/_/g, ' ')}</strong>.
          </span>
        </div>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Loan Requests &amp; Anonymized 2/3 Ballot Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Verified active members review Qard Hasan loan requests and cast secure, anonymized
            Upvotes or Downvotes (plus Yes / No on investment placements). Approval requires a{' '}
            {config?.voteThresholdNumerator || 2}/{config?.voteThresholdDenominator || 3} (66.7%)
            supermajority; voter identities remain masked behind cryptographic hashes.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit shrink-0">
          {(
            [
              { id: 'all', label: 'All Ballots' },
              { id: 'loans', label: `Loan Requests (${pendingOrApprovedLoans.length})` },
              { id: 'investments', label: `Investments (${openProjects.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {guarantorPendingForMe.length > 0 && (
        <section className="bg-amber-50/85 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>
              Awaiting Your Guarantor Co-Signature ({guarantorPendingForMe.length})
            </span>
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {guarantorPendingForMe.map((loan) => (
              <div
                key={loan.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {loan.borrowerName} ({loan.borrowerCode}) ·{' '}
                    <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {loan.id} · {loan.purpose}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'accept')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Accept Co-Sign
                  </button>
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'decline')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      ) : (
        <>
          {/* Section A: Fund Investment Placement Ballots (Yes / No) */}
          {showInvestments && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Fund Investment Placement Proposals (Yes / No)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {openProjects.length} open for vote
                </span>
              </div>

              {openProjects.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No proposed investment placements are currently open for voting.
                </div>
              ) : (
                openProjects.map((proj) => {
                  const yesVotes = proj.votes.filter((v) => v.decision === 'yes').length;
                  const noVotes = proj.votes.filter((v) => v.decision === 'no').length;
                  const totalEligible = proj.totalEligibleVoters || 1;
                  const reqApprovals =
                    proj.requiredApprovals || Math.ceil((totalEligible * 2) / 3);
                  const progressPct = Math.min(100, Math.round((yesVotes / reqApprovals) * 100));
                  const yesPct = Math.round((yesVotes / totalEligible) * 100);
                  const myVote = proj.votes.find((v) => v.isSelf || v.voterId === user.id);

                  return (
                    <article
                      key={proj.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              Investment Placement · {proj.shariahStructure}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{proj.sector}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status="pending" />
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {proj.title} — {formatMoney(proj.targetAllocation, ccy)}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {proj.shariahScholarNote}
                          </p>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Projected Return: {proj.projectedAnnualReturn} · Risk: {proj.riskTier}
                          </div>
                        </div>

                        <div className="lg:w-72 shrink-0 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              2/3 Majority Threshold
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {yesVotes} / {reqApprovals} Yes ({yesPct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>Yes: {yesVotes}</span>
                            <span>No: {noVotes}</span>
                            <span>{totalEligible} active members</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        {myVote ? (
                          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <Vote className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                            <span>
                              You voted <strong className="uppercase">{myVote.decision}</strong> on{' '}
                              {formatDateTime(myVote.castAt)} (Sig: {shortHash(myVote.signatureHash)})
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <input
                              type="text"
                              value={comments[proj.id] || ''}
                              onChange={(e) =>
                                setComments((prev) => ({ ...prev, [proj.id]: e.target.value }))
                              }
                              placeholder="Optional placement ballot rationale…"
                              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={busyId === proj.id}
                                onClick={() => handleProjectVote(proj.id, 'yes')}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Vote Yes</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === proj.id}
                                onClick={() => handleProjectVote(proj.id, 'no')}
                                className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Vote No</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          )}

          {/* Section B: Qard Hasan Loan Ballots */}
          {showLoans && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Pending Qard Hasan Loan Requests (Upvote / Downvote · 2/3 Majority)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {pendingOrApprovedLoans.length} active
                </span>
              </div>

              {pendingOrApprovedLoans.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No loan proposals are currently awaiting 2/3 member votes or treasury
                  disbursement.
                </div>
              ) : (
                pendingOrApprovedLoans.map((loan) => {
                  const approveCount = loan.votes.filter((v) => v.decision === 'approve').length;
                  const rejectCount = loan.votes.filter((v) => v.decision === 'reject').length;
                  const remainingNeeded = Math.max(0, loan.requiredApprovals - approveCount);
                  const progressPct = Math.min(
                    100,
                    Math.round((approveCount / loan.requiredApprovals) * 100)
                  );
                  const voterPct = Math.round(
                    (approveCount / Math.max(1, loan.totalEligibleVoters)) * 100
                  );
                  const myVote = loan.votes.find((v) => v.isSelf || v.voterId === user.id);

                  return (
                    <article
                      key={loan.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {loan.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Requested {formatDateTime(loan.requestedAt)}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status={loan.status} />
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {loan.borrowerName} ({loan.borrowerCode}) —{' '}
                            {formatMoney(loan.amount, ccy)}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {loan.purpose}
                          </p>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            Repayment Plan: {loan.installmentMonths} monthly installments of{' '}
                            {formatMoney(loan.monthlyInstallment, ccy)} (0% interest)
                          </div>
                          {loan.guarantors && loan.guarantors.length > 0 && (
                            <div className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                Co-signed by{' '}
                                {loan.guarantors
                                  .filter((g) => g.status === 'accepted')
                                  .map((g) => `${g.memberName} (${g.memberCode})`)
                                  .join(', ') || 'guarantor(s)'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="lg:w-80 shrink-0 space-y-2 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              2/3 Quorum Progress ({voterPct}%)
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {approveCount} / {loan.requiredApprovals} upvotes
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              Upvotes: {approveCount}
                            </span>
                            <span className="text-red-700 dark:text-red-400">
                              Downvotes: {rejectCount}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {remainingNeeded > 0
                                ? `${remainingNeeded} more needed (${loan.totalEligibleVoters} active)`
                                : `Quorum met (${loan.totalEligibleVoters} active)`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {loan.votes.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Anonymized Member Ballots ({loan.votes.length})
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              Identities masked · SHA-256 verified
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {loan.votes.map((v) => {
                              const isUp = v.decision === 'approve';
                              const isSelf = Boolean(v.isSelf || v.voterId === user.id);
                              return (
                                <div
                                  key={`${loan.id}-${v.voterId}`}
                                  className={`px-3 py-2 rounded-lg border flex items-start justify-between gap-2 text-xs ${
                                    isSelf
                                      ? 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25'
                                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                                  }`}
                                >
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                                      {isUp ? (
                                        <ThumbsUp
                                          className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <ThumbsDown
                                          className="w-3.5 h-3.5 text-red-600 shrink-0"
                                          aria-hidden="true"
                                        />
                                      )}
                                      <span className="truncate">{v.voterName}</span>
                                      <span className="text-[11px] text-slate-500">
                                        {isSelf ? '(Your Ballot)' : '(Anonymized)'}
                                      </span>
                                    </div>
                                    {v.comment && (
                                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                        &ldquo;{v.comment}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div
                                      className={`font-semibold text-[11px] ${
                                        isUp
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-red-700 dark:text-red-400'
                                      }`}
                                    >
                                      {isUp ? 'Upvoted' : 'Downvoted'}
                                    </div>
                                    <div className="font-mono text-[10px] text-slate-400">
                                      {shortHash(v.signatureHash)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {loan.status === 'pending_vote' && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                          {myVote ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Vote className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              <span>
                                You cast an{' '}
                                <strong className="uppercase">
                                  {myVote.decision === 'approve' ? 'Upvote' : 'Downvote'}
                                </strong>{' '}
                                on {formatDateTime(myVote.castAt)} (Sig:{' '}
                                {shortHash(myVote.signatureHash)})
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <input
                                type="text"
                                disabled={!isVerifiedMember}
                                value={comments[loan.id] || ''}
                                onChange={(e) =>
                                  setComments((prev) => ({ ...prev, [loan.id]: e.target.value }))
                                }
                                placeholder="Optional ballot rationale (recorded in audit log)…"
                                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={!isVerifiedMember || busyId === loan.id}
                                  onClick={() => handleLoanVote(loan.id, 'upvote')}
                                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Upvote</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!isVerifiedMember || busyId === loan.id}
                                  onClick={() => handleLoanVote(loan.id, 'downvote')}
                                  className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Downvote</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {loan.status === 'approved_pending_disbursement' && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                            <span>
                              2/3 member quorum achieved ({approveCount}/{loan.totalEligibleVoters}
                              ). Ready for Manager/Admin treasury disbursement.
                            </span>
                          </div>
                          {isStaff && (
                            <button
                              type="button"
                              disabled={busyId === loan.id}
                              onClick={() => handleDisburse(loan.id)}
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              {busyId === loan.id
                                ? 'Signing Disbursement…'
                                : 'Execute Multi-Sig Disbursement'}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          )}

          {/* Completed Voting Outcomes */}
          {(closedProjects.length > 0 || archivedLoans.length > 0) && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Completed 2/3 Voting Outcomes
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {closedProjects.map((proj) => {
                  const yesVotes = proj.votes.filter((v) => v.decision === 'yes').length;
                  return (
                    <div
                      key={proj.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          Placement
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {proj.title}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">
                          {formatMoney(proj.targetAllocation, ccy)}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="text-slate-500">
                          {yesVotes}/{proj.totalEligibleVoters} voted Yes
                        </span>
                      </div>
                      <StatusText
                        status={proj.votingStatus === 'approved' ? 'approved' : 'rejected'}
                      />
                    </div>
                  );
                })}
                {archivedLoans.map((loan) => {
                  const approvals = loan.votes.filter((v) => v.decision === 'approve').length;
                  return (
                    <div
                      key={loan.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {loan.id}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {loan.borrowerName}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="text-slate-500">
                          {approvals}/{loan.totalEligibleVoters} approved
                        </span>
                      </div>
                      <StatusText status={loan.status} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
