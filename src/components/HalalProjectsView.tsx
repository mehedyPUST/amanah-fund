'use client';

import { useState, type FormEvent } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Plus,
  ShieldCheck,
  Vote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { DashboardOverview, HalalProject, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, formatShortDate, shortHash } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { StatusText } from './StatusText.tsx';

type ProjectModalState =
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
  const t = useTranslations('HalalProjects');
  const tCommon = useTranslations('Common');
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const ccy = overview?.config.currency || 'BDT';

  const [title, setTitle] = useState('');
  const [sector, setSector] = useState('');
  const [shariahStructure, setShariahStructure] =
    useState<HalalProject['shariahStructure']>('Musharakah');
  const [targetAllocation, setTargetAllocation] = useState('50000');
  const [projectedAnnualReturn, setProjectedAnnualReturn] = useState(() => t('defaultReturnRange'));
  const [riskTier, setRiskTier] = useState<HalalProject['riskTier']>('Balanced');
  const [shariahScholarNote, setShariahScholarNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [voteComments, setVoteComments] = useState<Record<string, string>>({});
  const [votingId, setVotingId] = useState<string | null>(null);
  const [expandedVotesId, setExpandedVotesId] = useState<string | null>(null);
  const [expandedDistId, setExpandedDistId] = useState<string | null>(null);

  const [distFormProjectId, setDistFormProjectId] = useState<string | null>(null);
  const [distPeriodLabel, setDistPeriodLabel] = useState(() => t('defaultPeriodLabel'));
  const [distRealizedProfit, setDistRealizedProfit] = useState('');
  const [distCoopSharePct, setDistCoopSharePct] = useState('70');
  const [distBusy, setDistBusy] = useState(false);

  const [modal, setModal] = useState<ProjectModalState | null>(null);
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
        tCommon('actionCouldNotComplete'),
        err instanceof Error ? err.message : tCommon('unexpectedError')
      );
    } finally {
      setModalBusy(false);
    }
  }

  function translateStructure(val: HalalProject['shariahStructure']) {
    if (val === 'Musharakah' || val === 'Mudarabah' || val === 'Murabahah') {
      return t(`structures.${val}`);
    }
    return val;
  }

  function translateRiskTier(val: HalalProject['riskTier']) {
    if (val === 'Conservative' || val === 'Balanced' || val === 'Growth') {
      return t(`riskTiers.${val}`);
    }
    return val;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numericAllocation = Number(targetAllocation);
    if (!Number.isFinite(numericAllocation) || numericAllocation < 1000) {
      showNotice(
        'red',
        t('invalidAllocationTitle'),
        t('invalidAllocationDesc')
      );
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmProposalTitle'),
      description: t('confirmProposalDesc'),
      details: [
        { label: t('projectTitle'), value: title.trim() },
        { label: t('sector'), value: sector.trim() },
        {
          label: t('contractAndRisk'),
          value: `${translateStructure(shariahStructure)} · ${translateRiskTier(riskTier)}`,
        },
        { label: t('targetAllocation'), value: formatMoney(numericAllocation, ccy) },
        { label: t('projectedReturn'), value: projectedAnnualReturn.trim() },
      ],
      confirmLabel: t('openForVoteBtn'),
      run: async () => {
        setSubmitting(true);
        try {
          await api.createHalalProject({
            title: title.trim(),
            sector: sector.trim(),
            shariahStructure,
            targetAllocation: numericAllocation,
            projectedAnnualReturn: projectedAnnualReturn.trim(),
            riskTier,
            shariahScholarNote: shariahScholarNote.trim(),
          });
          setTitle('');
          setSector('');
          setShariahScholarNote('');
          await onRefresh();
          showNotice(
            'emerald',
            t('proposedTitle'),
            t('proposedDesc')
          );
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  function handlePlacementVote(proj: HalalProject, decision: 'yes' | 'no') {
    const comment = (voteComments[proj.id] || '').trim();
    const decisionWord = decision === 'yes' ? t('yesWord') : t('noWord');
    setModal({
      mode: 'confirm',
      tone: decision === 'yes' ? 'emerald' : 'red',
      title: t('confirmVoteTitle', { decision: decisionWord }),
      description: t('confirmVoteDesc'),
      details: [
        { label: t('venture'), value: proj.title },
        {
          label: t('contract'),
          value: `${translateStructure(proj.shariahStructure)} · ${formatMoney(proj.targetAllocation, ccy)}`,
        },
        { label: t('decision'), value: decisionWord },
        ...(comment ? [{ label: t('voteNote'), value: comment }] : []),
      ],
      confirmLabel: decision === 'yes' ? t('confirmVoteYes') : t('confirmVoteNo'),
      run: async () => {
        setVotingId(proj.id);
        try {
          const res = await api.voteHalalProject(proj.id, decision, comment || undefined);
          const p = res.project;
          const yesCount = p.votes.filter((v) => v.decision === 'yes').length;
          await onRefresh();
          showNotice(
            'emerald',
            p.votingStatus === 'approved' ? t('placementApprovedTitle') : t('voteRecordedTitle'),
            p.votingStatus === 'approved'
              ? t('voteRecordedApprovedDesc', {
                  decision: decisionWord,
                  title: p.title,
                  yesCount,
                  total: p.totalEligibleVoters,
                })
              : t('voteRecordedPendingDesc', {
                  decision: decisionWord,
                  yesCount,
                  required: p.requiredApprovals,
                })
          );
        } finally {
          setVotingId(null);
        }
      },
    });
  }

  function handleDistributeProfit(e: FormEvent, proj: HalalProject) {
    e.preventDefault();
    const profit = Number(distRealizedProfit);
    const sharePct = Number(distCoopSharePct);
    if (!Number.isFinite(profit) || profit <= 0 || !Number.isFinite(sharePct) || sharePct <= 0) {
      showNotice(
        'red',
        t('invalidDistTitle'),
        t('invalidDistDesc')
      );
      return;
    }
    const estPool = Math.round((profit * sharePct) / 100);

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmDistTitle', { title: proj.title }),
      description: t('confirmDistDesc'),
      details: [
        { label: t('periodLabel'), value: distPeriodLabel.trim() },
        { label: t('realizedProfit'), value: formatMoney(profit, ccy) },
        {
          label: t('coopShare'),
          value: t('coopShareValue', { pct: sharePct, amount: formatMoney(estPool, ccy) }),
        },
      ],
      confirmLabel: t('confirmDistBtn'),
      run: async () => {
        setDistBusy(true);
        try {
          const res = await api.distributeHalalProfit(proj.id, {
            periodLabel: distPeriodLabel.trim(),
            realizedProfit: profit,
            coopSharePct: sharePct,
          });
          const latestDist = res.project.distributions?.[0];
          setDistFormProjectId(null);
          setDistRealizedProfit('');
          await onRefresh();
          showNotice(
            'emerald',
            t('distDoneTitle'),
            latestDist
              ? t('distDoneDesc', {
                  amount: formatMoney(latestDist.distributablePool, ccy),
                  period: latestDist.periodLabel,
                  count: latestDist.allocations.length,
                })
              : t('distDoneFallbackDesc')
          );
        } finally {
          setDistBusy(false);
        }
      },
    });
  }

  const totalTarget = projects.reduce((s, p) => s + p.targetAllocation, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Maturity Transition Summary */}
      <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-[0_12px_32px_-16px_rgba(15,23,42,0.14)] transition-all duration-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-center">
          <div className="lg:col-span-8 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {t('maturityDatePrefix', { date: formatShortDate(overview?.config.maturityDate) })}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              {t('heading')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {overview?.config.halalInvestmentThesis}
            </p>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="amanah-card-emerald backdrop-blur-xl p-3 sm:p-4 rounded-2xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">{t('currentPool')}</div>
              <div className="mt-1 text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(overview?.treasury.totalContributionsPool || 0, ccy)}
              </div>
            </div>
            <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl p-3 sm:p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/70 dark:ring-white/5 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">{t('pipelineTarget')}</div>
              <div className="mt-1 text-sm sm:text-base font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {formatMoney(totalTarget, ccy)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
        <section
          className={`${
            isStaff ? 'xl:col-span-8' : 'xl:col-span-12'
          } amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('proposedSectionTitle')}
              </h3>
            </div>
            <span className="text-xs font-mono text-teal-700 dark:text-teal-400">
              {t('liveTallies')}
            </span>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <Skeleton width={210} height={14} />
                      <Skeleton width="55%" height={20} />
                      <Skeleton width="90%" height={14} />
                    </div>
                    <div className="md:w-64 shrink-0">
                      <Skeleton height={74} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/25">
              {t('emptyProjects')}
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
                const myVote = proj.votes.find((v) => v.isSelf || v.voterId === user.id);
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
                    className="p-4 sm:p-5 rounded-2xl bg-white/75 dark:bg-slate-950/65 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/70 dark:ring-white/5 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 space-y-3 sm:space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {translateStructure(proj.shariahStructure)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{proj.sector}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t('riskSuffix', { tier: translateRiskTier(proj.riskTier) })}</span>
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
                          <span>{t('allocationLine', { amount: formatMoney(proj.targetAllocation, ccy) })}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {t('yieldLine', { rate: proj.projectedAnnualReturn })}
                          </span>
                          {typeof proj.realizedProfitTotal === 'number' &&
                            proj.realizedProfitTotal > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 dark:text-amber-400">
                                  {t('realizedPoolLine', {
                                    amount: formatMoney(proj.realizedProfitTotal, ccy),
                                  })}
                                </span>
                              </>
                            )}
                        </div>
                      </div>

                      {/* Real-time 2/3 Majority Meter */}
                      <div className="md:w-64 shrink-0 space-y-2 p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {t('majorityProgress')}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {t('yesFraction', { yes: yesVotes, req: reqApprovals })}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            className={`h-full rounded-full ${
                              proj.votingStatus === 'approved'
                                ? 'bg-emerald-600'
                                : proj.votingStatus === 'rejected'
                                  ? 'bg-rose-600'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${progressPct}%`, originX: 0 }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>{t('yesStat', { yes: yesVotes, pct: yesPctOfMembers })}</span>
                          <span>{t('noStat', { no: noVotes })}</span>
                          <span>{t('membersCount', { count: totalEligible })}</span>
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
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={
                              proj.votingStatus === 'approved'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {proj.votingStatus === 'approved'
                              ? t('approvedSummary', { yes: yesVotes, total: totalEligible })
                              : t('rejectedSummary', { no: noVotes })}
                          </span>
                        </div>
                      ) : myVote ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <Vote className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                          <span>
                            {t('youVotedOn', {
                              decision: myVote.decision === 'yes' ? t('yesWord') : t('noWord'),
                              date: formatDateTime(myVote.castAt),
                              sig: shortHash(myVote.signatureHash),
                            })}
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
                            placeholder={t('voteNotePlaceholder')}
                            className="flex-1 px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                          />
                          <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full sm:w-auto">
                            <button
                              type="button"
                              disabled={votingId === proj.id || modalBusy}
                              onClick={() => handlePlacementVote(proj, 'yes')}
                              className="px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('voteYes')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={votingId === proj.id || modalBusy}
                              onClick={() => handlePlacementVote(proj, 'no')}
                              className="px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white active:scale-[0.98] transition-all duration-150 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('voteNo')}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedVotesId(isExpanded ? null : proj.id)}
                        className="min-h-[38px] sm:min-h-0 px-2.5 sm:px-0 py-1 sm:py-0 rounded-xl sm:rounded-none border border-slate-200 dark:border-slate-700 sm:border-0 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-center"
                      >
                        <span>{t('votesCount', { count: proj.votes.length })}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {proj.votes.length === 0 ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400">{t('noVotesYet')}</div>
                            ) : (
                              proj.votes.map((v) => {
                                const isSelf = Boolean(v.isSelf || v.voterId === user.id);
                                return (
                                  <div
                                    key={v.voterId}
                                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                                      isSelf
                                        ? 'bg-emerald-50/50 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800/70'
                                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-medium text-slate-900 dark:text-white">
                                        {v.voterName}{' '}
                                        <span className="text-slate-500 dark:text-slate-400 font-normal">
                                          · {isSelf ? t('yourBallot') : t('anonymized')}
                                        </span>
                                      </div>
                                      {v.comment && (
                                        <p className="text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                                          “{v.comment}”
                                        </p>
                                      )}
                                      <div className="font-mono text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">
                                        {t('sigShort', { sig: shortHash(v.signatureHash) })}
                                      </div>
                                    </div>
                                    <span
                                      className={`font-semibold uppercase text-[11px] shrink-0 ${
                                        v.decision === 'yes'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-rose-700 dark:text-rose-400'
                                      }`}
                                    >
                                      {v.decision === 'yes' ? t('yesWord') : t('noWord')}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Profit & Dividend Distributions */}
                    {(proj.votingStatus === 'approved' || proj.status !== 'proposed') && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            <span>
                              {t('profitDistributionsCount', { count: (proj.distributions || []).length })}
                            </span>
                          </div>
                          {isStaff && (
                            <button
                              type="button"
                              onClick={() =>
                                setDistFormProjectId(
                                  distFormProjectId === proj.id ? null : proj.id
                                )
                              }
                              className="px-3 py-1.5 sm:py-1 min-h-[38px] sm:min-h-0 rounded-xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/30 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/60 transition-colors cursor-pointer"
                            >
                              {distFormProjectId === proj.id
                                ? tCommon('cancel')
                                : t('recordDistributeBtn')}
                            </button>
                          )}
                        </div>

                        <AnimatePresence initial={false}>
                          {isStaff && distFormProjectId === proj.id && (
                            <motion.form
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.22 }}
                              onSubmit={(e) => handleDistributeProfit(e, proj)}
                              className="p-3.5 sm:p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end overflow-hidden"
                            >
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  {t('periodLabel')}
                                </label>
                                <input
                                  type="text"
                                  required
                                  minLength={2}
                                  value={distPeriodLabel}
                                  onChange={(e) => setDistPeriodLabel(e.target.value)}
                                  placeholder={t('periodPlaceholder')}
                                  className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  {t('realizedProfitLabel', { currency: ccy })}
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  step="any"
                                  required
                                  value={distRealizedProfit}
                                  onChange={(e) => setDistRealizedProfit(e.target.value)}
                                  placeholder={t('realizedProfitPlaceholder')}
                                  className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  {t('coopSharePctLabel')}
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  required
                                  value={distCoopSharePct}
                                  onChange={(e) => setDistCoopSharePct(e.target.value)}
                                  className="w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={distBusy}
                                className="px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 disabled:opacity-50 active:scale-[0.98] transition-all cursor-pointer"
                              >
                                {distBusy ? t('distributing') : t('distributeProRataBtn')}
                              </button>
                            </motion.form>
                          )}
                        </AnimatePresence>

                        {(proj.distributions || []).length > 0 && (
                          <div className="space-y-2">
                            {(proj.distributions || []).map((dist) => {
                              const myAlloc = dist.allocations.find((a) => a.userId === user.id);
                              const isDistOpen = expandedDistId === dist.id;
                              return (
                                <div
                                  key={dist.id}
                                  className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 p-3.5 text-xs space-y-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-slate-900 dark:text-white">
                                        {dist.periodLabel}
                                      </span>
                                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                        ·
                                      </span>
                                      <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                        {t('poolLine', {
                                          pool: formatMoney(dist.distributablePool, ccy),
                                          pct: dist.coopSharePct,
                                          profit: formatMoney(dist.realizedProfit, ccy),
                                        })}
                                      </span>
                                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                        ·
                                      </span>
                                      <span className="font-mono text-slate-500 dark:text-slate-400">
                                        {formatShortDate(dist.distributedAt)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {myAlloc && (
                                        <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                                          {t('yourShareLine', {
                                            amount: formatMoney(myAlloc.payoutAmount, ccy),
                                            pct: myAlloc.contributionWeightPct,
                                          })}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedDistId(isDistOpen ? null : dist.id)
                                        }
                                        className="text-slate-600 dark:text-slate-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>{isDistOpen ? tCommon('hide') : t('breakdown')}</span>
                                        {isDistOpen ? (
                                          <ChevronUp className="w-3 h-3" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  {isDistOpen && (
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {dist.allocations.map((a) => (
                                        <div
                                          key={a.userId}
                                          className={`px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between gap-2 ${
                                            a.userId === user.id
                                              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                                          }`}
                                        >
                                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                                            {a.memberName} ({a.memberCode})
                                          </span>
                                          <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                                            {formatMoney(a.payoutAmount, ccy)} ({a.contributionWeightPct}%)
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
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
          <section className="xl:col-span-4 bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-[0_12px_32px_-16px_rgba(15,23,42,0.14)] transition-all duration-200">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('proposeCardTitle')}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('projectTitle')}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('projectTitlePlaceholder')}
                  className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('sector')}
                </label>
                <input
                  type="text"
                  required
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder={t('sectorPlaceholder')}
                  className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('contractLabel')}
                  </label>
                  <select
                    value={shariahStructure}
                    onChange={(e) =>
                      setShariahStructure(e.target.value as HalalProject['shariahStructure'])
                    }
                    className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    <option value="Musharakah">{t('structures.Musharakah')}</option>
                    <option value="Mudarabah">{t('structures.Mudarabah')}</option>
                    <option value="Murabahah">{t('structures.Murabahah')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('riskTierLabel')}
                  </label>
                  <select
                    value={riskTier}
                    onChange={(e) => setRiskTier(e.target.value as HalalProject['riskTier'])}
                    className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    <option value="Conservative">{t('riskTiers.Conservative')}</option>
                    <option value="Balanced">{t('riskTiers.Balanced')}</option>
                    <option value="Growth">{t('riskTiers.Growth')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('allocationCurrencyLabel', { currency: ccy })}
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={targetAllocation}
                    onChange={(e) => setTargetAllocation(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('projectedReturnLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={projectedAnnualReturn}
                    onChange={(e) => setProjectedAnnualReturn(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('shariahNoteLabel')}
                </label>
                <textarea
                  rows={2}
                  required
                  value={shariahScholarNote}
                  onChange={(e) => setShariahScholarNote(e.target.value)}
                  placeholder={t('shariahNotePlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? t('submittingProposal') : t('openForVoteBtn')}</span>
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <span>{t('requiresTwoThirds')}</span>
            </div>
          </section>
        )}
      </div>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
