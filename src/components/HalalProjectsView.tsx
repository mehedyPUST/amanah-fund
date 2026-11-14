'use client';

import { useState, type FormEvent } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, Plus, ShieldCheck, Vote, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { DashboardOverview, HalalProject, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, formatShortDate, shortHash } from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface HalalProjectsViewProps {
  projects: HalalProject[];
  overview: DashboardOverview | null;
  user: PublicUser;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function HalalProjectsView({
  projects,
  overview,
  user,
  loading,
  onRefresh,
}: HalalProjectsViewProps) {
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const ccy = overview?.config.currency || 'BDT';

  const [title, setTitle] = useState('');
  const [sector, setSector] = useState('');
  const [shariahStructure, setShariahStructure] =
    useState<HalalProject['shariahStructure']>('Musharakah');
  const [targetAllocation, setTargetAllocation] = useState('50000');
  const [projectedAnnualReturn, setProjectedAnnualReturn] = useState('10% – 13% p.a.');
  const [riskTier, setRiskTier] = useState<HalalProject['riskTier']>('Balanced');
  const [shariahScholarNote, setShariahScholarNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [voteComments, setVoteComments] = useState<Record<string, string>>({});
  const [votingId, setVotingId] = useState<string | null>(null);
  const [expandedVotesId, setExpandedVotesId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await api.createHalalProject({
        title,
        sector,
        shariahStructure,
        targetAllocation: Number(targetAllocation),
        projectedAnnualReturn,
        riskTier,
        shariahScholarNote,
      });
      setTitle('');
      setSector('');
      setShariahScholarNote('');
      setFeedback({
        type: 'success',
        text: 'Investment placement proposed and opened for real-time 2/3 member voting.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create project proposal.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePlacementVote(projectId: string, decision: 'yes' | 'no') {
    setVotingId(projectId);
    setFeedback(null);
    try {
      const res = await api.voteHalalProject(projectId, decision, voteComments[projectId]);
      const p = res.project;
      const yesCount = p.votes.filter((v) => v.decision === 'yes').length;
      setFeedback({
        type: 'success',
        text:
          p.votingStatus === 'approved'
            ? `Vote "${decision.toUpperCase()}" recorded. Placement reached 2/3 majority (${yesCount}/${p.totalEligibleVoters}) and is now Approved!`
            : `Your "${decision.toUpperCase()}" vote has been recorded in real time (${yesCount}/${p.requiredApprovals} required).`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to record vote.',
      });
    } finally {
      setVotingId(null);
    }
  }

  const totalTarget = projects.reduce((s, p) => s + p.targetAllocation, 0);

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

      {/* Maturity Transition Summary */}
      <section className="bg-gradient-to-br from-amber-50/65 via-white to-white dark:from-amber-950/25 dark:via-slate-900 dark:to-slate-900 border border-amber-200/80 dark:border-amber-900/50 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Calendar className="w-4 h-4" aria-hidden="true" />
              <span>
                Pre-Specified Maturity Date: {formatShortDate(overview?.config.maturityDate)}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Halal Ventures & 2/3 Member Voting
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {overview?.config.halalInvestmentThesis}
            </p>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Current Pool</div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(overview?.treasury.totalContributionsPool || 0, ccy)}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Pipeline Target</div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {formatMoney(totalTarget, ccy)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section
          className={`${
            isStaff ? 'xl:col-span-8' : 'xl:col-span-12'
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Proposed & Approved Investment Placements
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                A placement is approved when at least two-thirds (2/3) of active members vote Yes
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
              Live 2/3 Majority Tallies
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={130} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No Halal investment projects proposed yet.
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((proj) => {
                const yesVotes = proj.votes.filter((v) => v.decision === 'yes').length;
                const noVotes = proj.votes.filter((v) => v.decision === 'no').length;
                const totalEligible = proj.totalEligibleVoters || 1;
                const reqApprovals = proj.requiredApprovals || Math.ceil((totalEligible * 2) / 3);
                const yesPctOfMembers = Math.round((yesVotes / totalEligible) * 100);
                const progressPct = Math.min(100, Math.round((yesVotes / reqApprovals) * 100));
                const myVote = proj.votes.find((v) => v.voterId === user.id);
                const isExpanded = expandedVotesId === proj.id;

                const votingStatusLabel =
                  proj.votingStatus === 'approved'
                    ? 'approved'
                    : proj.votingStatus === 'rejected'
                      ? 'rejected'
                      : 'pending';

                return (
                  <article
                    key={proj.id}
                    className="p-4 sm:p-5 rounded-xl bg-slate-50/65 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {proj.shariahStructure}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{proj.sector}</span>
                          <span aria-hidden="true">·</span>
                          <span>{proj.riskTier} Risk</span>
                          <span aria-hidden="true">·</span>
                          <StatusText status={votingStatusLabel} />
                        </div>
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                          {proj.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {proj.shariahScholarNote}
                        </p>
                        <div className="pt-0.5 flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          <span>Allocation: {formatMoney(proj.targetAllocation, ccy)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Yield: {proj.projectedAnnualReturn}
                          </span>
                        </div>
                      </div>

                      {/* Real-time 2/3 Majority Meter */}
                      <div className="md:w-64 shrink-0 space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            2/3 Majority Progress
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {yesVotes} / {reqApprovals} Yes
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              proj.votingStatus === 'approved'
                                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500'
                                : proj.votingStatus === 'rejected'
                                  ? 'bg-red-600'
                                  : 'bg-gradient-to-r from-amber-500 to-amber-400'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>
                            Yes: {yesVotes} ({yesPctOfMembers}%)
                          </span>
                          <span>No: {noVotes}</span>
                          <span>{totalEligible} members</span>
                        </div>
                      </div>
                    </div>

                    {/* Voting Action Area */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {proj.votingStatus !== 'open' ? (
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <ShieldCheck
                            className={`w-4 h-4 ${
                              proj.votingStatus === 'approved'
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={
                              proj.votingStatus === 'approved'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }
                          >
                            {proj.votingStatus === 'approved'
                              ? `Approved by 2/3 majority (${yesVotes} of ${totalEligible} members voted Yes)`
                              : `Rejected (${noVotes} No votes made 2/3 majority unreachable)`}
                          </span>
                        </div>
                      ) : myVote ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <Vote className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                          <span>
                            You voted <strong className="uppercase">{myVote.decision}</strong> on{' '}
                            {formatDateTime(myVote.castAt)} (Sig: {shortHash(myVote.signatureHash)})
                          </span>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                          <input
                            type="text"
                            value={voteComments[proj.id] || ''}
                            onChange={(e) =>
                              setVoteComments((prev) => ({
                                ...prev,
                                [proj.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional vote note…"
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={votingId === proj.id}
                              onClick={() => handlePlacementVote(proj.id, 'yes')}
                              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Vote Yes</span>
                            </button>
                            <button
                              type="button"
                              disabled={votingId === proj.id}
                              onClick={() => handlePlacementVote(proj.id, 'no')}
                              className="px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Vote No</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedVotesId(isExpanded ? null : proj.id)}
                        className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-center"
                      >
                        <span>Votes ({proj.votes.length})</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {proj.votes.length === 0 ? (
                          <div className="text-xs text-slate-500">No votes cast yet.</div>
                        ) : (
                          proj.votes.map((v) => (
                            <div
                              key={v.voterId}
                              className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-white">
                                  {v.voterName}{' '}
                                  <span className="text-slate-500 font-normal capitalize">
                                    · {v.voterRole}
                                  </span>
                                </div>
                                {v.comment && (
                                  <p className="text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                                    “{v.comment}”
                                  </p>
                                )}
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  Sig {shortHash(v.signatureHash)}
                                </div>
                              </div>
                              <span
                                className={`font-semibold uppercase text-[11px] shrink-0 ${
                                  v.decision === 'yes'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-red-700 dark:text-red-400'
                                }`}
                              >
                                {v.decision}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {isStaff && (
          <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Propose Investment Placement
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Managers & Admins can propose Shariah-compliant ventures for 2/3 member voting.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Solar Irrigation Cooperative"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Sector
                </label>
                <input
                  type="text"
                  required
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="e.g. Clean Energy / Agriculture"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Contract
                  </label>
                  <select
                    value={shariahStructure}
                    onChange={(e) =>
                      setShariahStructure(e.target.value as HalalProject['shariahStructure'])
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Musharakah">Musharakah</option>
                    <option value="Mudarabah">Mudarabah</option>
                    <option value="Murabahah">Murabahah</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Risk Tier
                  </label>
                  <select
                    value={riskTier}
                    onChange={(e) => setRiskTier(e.target.value as HalalProject['riskTier'])}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Conservative">Conservative</option>
                    <option value="Balanced">Balanced</option>
                    <option value="Growth">Growth</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Allocation ({ccy})
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={targetAllocation}
                    onChange={(e) => setTargetAllocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Projected Return
                  </label>
                  <input
                    type="text"
                    required
                    value={projectedAnnualReturn}
                    onChange={(e) => setProjectedAnnualReturn(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Shariah Screening Note
                </label>
                <textarea
                  rows={2}
                  required
                  value={shariahScholarNote}
                  onChange={(e) => setShariahScholarNote(e.target.value)}
                  placeholder="Asset-backed structure & compliance basis"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Submitting Proposal…' : 'Open for 2/3 Member Vote'}</span>
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Requires 2/3 member Yes votes for approval.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
