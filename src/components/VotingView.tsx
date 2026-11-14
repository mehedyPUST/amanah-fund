import { useState } from 'react';
import { Check, ShieldCheck, Vote, X } from 'lucide-react';
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

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'investments' | 'loans'>('all');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  async function handleLoanVote(loanId: string, decision: 'approve' | 'reject') {
    setBusyId(loanId);
    setFeedback(null);
    try {
      await api.voteLoan(loanId, decision, comments[loanId]);
      setFeedback({
        type: 'success',
        text: `Your cryptographic ${decision.toUpperCase()} vote has been recorded on ${loanId}.`,
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

  const openProjects = projects.filter((p) => p.votingStatus === 'open');
  const closedProjects = projects.filter((p) => p.votingStatus !== 'open');

  const pendingOrApprovedLoans = loans.filter(
    (l) => l.status === 'pending_vote' || l.status === 'approved_pending_disbursement'
  );
  const archivedLoans = loans.filter(
    (l) => l.status !== 'pending_vote' && l.status !== 'approved_pending_disbursement'
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
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Real-Time 2/3 Member Voting Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cast Yes / No votes on proposed fund investment placements and approve Qard Hasan loan
            requests. Approval requires at least {config?.voteThresholdNumerator || 2}/
            {config?.voteThresholdDenominator || 3} (66.7%) member agreement.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit shrink-0">
          {(
            [
              { id: 'all', label: 'All Ballots' },
              { id: 'investments', label: `Investments (${openProjects.length})` },
              { id: 'loans', label: `Loans (${pendingOrApprovedLoans.length})` },
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
                  const totalEligible = proj.totalEligibleVoters || 6;
                  const reqApprovals =
                    proj.requiredApprovals || Math.ceil((totalEligible * 2) / 3);
                  const progressPct = Math.min(100, Math.round((yesVotes / reqApprovals) * 100));
                  const yesPct = Math.round((yesVotes / totalEligible) * 100);
                  const myVote = proj.votes.find((v) => v.voterId === user.id);

                  return (
                    <article
                      key={proj.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4"
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
                                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Vote Yes</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === proj.id}
                                onClick={() => handleProjectVote(proj.id, 'no')}
                                className="px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
                  Qard Hasan Loan Proposals & Disbursements
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
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
                  const progressPct = Math.min(
                    100,
                    Math.round((approveCount / loan.requiredApprovals) * 100)
                  );
                  const myVote = loan.votes.find((v) => v.voterId === user.id);

                  return (
                    <article
                      key={loan.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
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
                        </div>

                        <div className="lg:w-72 shrink-0 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              2/3 Quorum Progress
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {approveCount} / {loan.requiredApprovals} approvals
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>{loan.totalEligibleVoters} active members</span>
                            <span>{rejectCount} reject</span>
                          </div>
                        </div>
                      </div>

                      {loan.status === 'pending_vote' && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                          {myVote ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Vote className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              <span>
                                You voted <strong className="uppercase">{myVote.decision}</strong>{' '}
                                on {formatDateTime(myVote.castAt)} (Sig:{' '}
                                {shortHash(myVote.signatureHash)})
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <input
                                type="text"
                                value={comments[loan.id] || ''}
                                onChange={(e) =>
                                  setComments((prev) => ({ ...prev, [loan.id]: e.target.value }))
                                }
                                placeholder="Optional ballot rationale (recorded in audit log)…"
                                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={busyId === loan.id}
                                  onClick={() => handleLoanVote(loan.id, 'approve')}
                                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Vote Approve</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === loan.id}
                                  onClick={() => handleLoanVote(loan.id, 'reject')}
                                  className="px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Vote Reject</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {loan.status === 'approved_pending_disbursement' && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-sky-700 dark:text-sky-400 font-medium inline-flex items-center gap-1.5">
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
                              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
