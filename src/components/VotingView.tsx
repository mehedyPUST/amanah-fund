'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Clock,
  Eye,
  EyeOff,
  Lock,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { useTranslations } from 'next-intl';
import type {
  DecisionPoll,
  FundConfig,
  HalalProject,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, shortHash } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { StatusText } from './StatusText.tsx';
import { useToast } from './ToastProvider.tsx';

interface VotingViewProps {
  loans: LoanRequest[];
  projects: HalalProject[];
  polls?: DecisionPoll[];
  availableLiquidity?: number;
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onViewMemberProfile?: (userId: string) => void;
}

export function VotingView({
  loans,
  projects,
  polls = [],
  availableLiquidity,
  config,
  user,
  loading,
  onRefresh,
  onViewMemberProfile,
}: VotingViewProps) {
  const t = useTranslations('Voting');
  const tCommon = useTranslations('Common');
  const tStatus = useTranslations('Status');
  const toast = useToast();
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isVerifiedMember = user.status === 'active';
  const canCastBallot = isVerifiedMember && !isAdmin;

  const formatCategory = (cat: DecisionPoll['category']) => {
    if (cat === 'policy') return t('catPolicy');
    if (cat === 'qard_hasan') return t('catQardHasan');
    if (cat === 'project') return t('catProject');
    return t('catGeneral');
  };

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'loans' | 'investments' | 'polls'>(
    'all'
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [pollChoices, setPollChoices] = useState<Record<string, string>>({});
  const [expandedAdminLedgers, setExpandedAdminLedgers] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<
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
        run: (inputValue: string) => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
      }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);
  /** Tick every second so deadline countdowns stay live (hydrated post-mount to avoid SSR mismatch) */
  const [nowTick, setNowTick] = useState<number>(0);
  useEffect(() => {
    setNowTick(Date.now());
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  function formatCountdown(deadlineIso: string | undefined): string {
    if (!deadlineIso) return t('noDeadline');
    if (!nowTick) return t('loading');
    const ms = new Date(deadlineIso).getTime() - nowTick;
    if (ms <= 0) return t('deadlinePassed');
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return t('countdownDHMS', { d, h, m, s });
    if (h > 0) return t('countdownHMS', { h, m, s });
    return t('countdownMS', { m, s });
  }

  // Create decision poll drawer state (Manager/Admin)
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollDescription, setPollDescription] = useState('');
  const [pollCategory, setPollCategory] = useState<DecisionPoll['category']>('general');
  const [pollOptionsText, setPollOptionsText] = useState('Approve\nReject\nAbstain');
  const [pollClosesAt, setPollClosesAt] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [rewritingPoll, setRewritingPoll] = useState(false);

  function toggleAdminLedger(id: string) {
    setExpandedAdminLedgers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleLoanVote(loanId: string, decision: 'upvote' | 'downvote') {
    if (isAdmin) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('adminRestrictedTitle'),
        description: t('adminRestrictedDesc'),
      });
      return;
    }
    if (!isVerifiedMember) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: t('verifiedRequiredTitle'),
        description: t('verifiedRequiredDesc'),
      });
      return;
    }
    const loan = loans.find((l) => l.id === loanId);
    if (loan?.voteDeadlineAt && new Date(loan.voteDeadlineAt).getTime() < Date.now()) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: t('deadlinePassedTitle'),
        description: t('deadlinePassedDesc'),
      });
      return;
    }
    const isChange = Boolean(loan?.votes.some((v) => v.isSelf || v.voterId === user.id));
    const choiceLabel = decision === 'upvote' ? t('upvote') : t('downvote');
    setModal({
      mode: 'confirm',
      tone: decision === 'upvote' ? 'emerald' : 'red',
      title: isChange
        ? t('changeBallotTitle', { choice: choiceLabel })
        : t('castSecretBallotTitle', { choice: choiceLabel }),
      description: isChange ? t('changeBallotDesc') : t('castBallotDesc'),
      details: [
        { label: t('detailLoanId'), value: loanId },
        ...(loan
          ? [
              { label: t('detailApplicant'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: t('detailAmount'), value: formatMoney(loan.amount, ccy) },
              { label: t('detailPurpose'), value: loan.purpose },
              {
                label: t('detailRepayment'),
                value: `${loan.installmentMonths} × ${formatMoney(loan.monthlyInstallment, ccy)}`,
              },
            ]
          : []),
        { label: t('detailBallotChoice'), value: choiceLabel },
      ],
      confirmLabel: isChange
        ? decision === 'upvote'
          ? t('changeToUpvote')
          : t('changeToDownvote')
        : decision === 'upvote'
          ? t('confirmUpvote')
          : t('confirmDownvote'),
      run: async () => {
        setBusyId(loanId);
        try {
          await api.voteLoan(loanId, decision, comments[loanId]);
          setModal(null);
          await onRefresh();
          toast.success(
            isChange ? t('ballotUpdatedTitle') : t('secretBallotRecordedTitle'),
            isChange
              ? t('ballotUpdatedDesc', { loanId, choice: choiceLabel })
              : t('ballotRecordedDesc', { loanId, choice: choiceLabel })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('voteFailedTitle'),
            description: err instanceof Error ? err.message : t('voteFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleExtendDeadline(loanId: string) {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('extendDeadlineTitle'),
      description: t('extendDeadlineDesc'),
      details: [{ label: t('detailLoanId'), value: loanId }],
      inputLabel: t('additionalHoursLabel'),
      inputPlaceholder: t('additionalHoursPlaceholder'),
      inputRequired: true,
      confirmLabel: t('extendDeadlineBtn'),
      run: async (hoursInput) => {
        const hours = Math.min(720, Math.max(1, Math.round(Number(hoursInput) || 24)));
        setBusyId(`extend-${loanId}`);
        try {
          await api.extendLoanVoteDeadline(loanId, hours);
          setModal(null);
          await onRefresh();
          toast.success(
            t('deadlineExtendedTitle'),
            t('deadlineExtendedDesc', { loanId, hours })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('extendFailedTitle'),
            description: err instanceof Error ? err.message : t('extendFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleRevealLoanVote(loanId: string) {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('revealLoanTitle'),
      description: t('revealLoanDesc'),
      details: [{ label: t('detailLoanId'), value: loanId }],
      confirmLabel: t('stopRevealBtn'),
      run: async () => {
        setBusyId(`reveal-${loanId}`);
        try {
          const res = await api.revealLoanVote(loanId);
          setModal(null);
          await onRefresh();
          const statusDisplay = tStatus.has(res.loan.status as never)
            ? tStatus(res.loan.status as never)
            : res.loan.status.replace(/_/g, ' ');
          toast.success(
            t('ballotRevealedTitle'),
            t('ballotRevealedDesc', { loanId, status: statusDisplay })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('revealFailedTitle'),
            description: err instanceof Error ? err.message : t('revealLoanFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleProjectVote(projectId: string, decision: 'yes' | 'no') {
    if (isAdmin) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('adminRestrictedTitle'),
        description: t('adminRestrictedDesc'),
      });
      return;
    }
    const proj = projects.find((p) => p.id === projectId);
    const choiceLabel = decision === 'yes' ? t('yesLabel') : t('noLabel');
    setModal({
      mode: 'confirm',
      tone: decision === 'yes' ? 'emerald' : 'red',
      title: t('sealInvestmentTitle', { choice: choiceLabel }),
      description: t('sealInvestmentDesc'),
      details: [
        ...(proj ? [{ label: t('detailProject'), value: proj.title }] : []),
        { label: t('detailDecision'), value: choiceLabel },
      ],
      confirmLabel: decision === 'yes' ? t('confirmVoteYes') : t('confirmVoteNo'),
      run: async () => {
        setBusyId(projectId);
        try {
          const res = await api.voteHalalProject(projectId, decision, comments[projectId]);
          setModal(null);
          await onRefresh();
          toast.success(
            t('investmentSealedTitle'),
            t('investmentSealedDesc', { choice: choiceLabel, title: res.project.title })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('ballotFailedTitle'),
            description: err instanceof Error ? err.message : t('placementVoteFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleRevealProjectVote(projectId: string) {
    const proj = projects.find((p) => p.id === projectId);
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('revealProjectTitle'),
      description: t('revealProjectDesc'),
      details: [{ label: t('detailProposal'), value: proj?.title || projectId }],
      confirmLabel: t('stopRevealBtn'),
      run: async () => {
        setBusyId(`reveal-proj-${projectId}`);
        try {
          const res = await api.revealHalalProjectVote(projectId);
          setModal(null);
          await onRefresh();
          toast.success(
            t('investmentRevealedTitle'),
            t('investmentRevealedDesc', { title: res.project.title })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('revealFailedTitle'),
            description:
              err instanceof Error ? err.message : t('revealProjectFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handlePollVote(pollId: string) {
    const optionId = pollChoices[pollId];
    if (!optionId) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: t('selectOptionTitle'),
        description: t('selectOptionDesc'),
      });
      return;
    }
    const poll = polls.find((p) => p.id === pollId);
    const optionLabel = poll?.options.find((o) => o.id === optionId)?.label || optionId;
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('submitDecisionBallotTitle'),
      description: t('submitDecisionBallotDesc'),
      details: [
        { label: t('detailPoll'), value: poll?.title || pollId },
        { label: t('detailSelectedOption'), value: optionLabel },
      ],
      confirmLabel: t('castSecretVoteBtn'),
      run: async () => {
        setBusyId(`poll-${pollId}`);
        try {
          await api.votePoll(pollId, optionId, comments[pollId]);
          setModal(null);
          await onRefresh();
          toast.success(t('decisionRecordedTitle'), t('decisionRecordedDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('pollVoteFailedTitle'),
            description: err instanceof Error ? err.message : t('pollVoteFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleRevealPoll(pollId: string) {
    const poll = polls.find((p) => p.id === pollId);
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('revealPollTitle'),
      description: t('revealPollDesc'),
      details: [{ label: t('detailPoll'), value: poll?.title || pollId }],
      confirmLabel: t('closeRevealPollBtn'),
      run: async () => {
        setBusyId(`reveal-poll-${pollId}`);
        try {
          await api.revealPoll(pollId);
          setModal(null);
          await onRefresh();
          toast.success(t('pollRevealedTitle'), t('pollRevealedDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('revealFailedTitle'),
            description:
              err instanceof Error ? err.message : t('revealPollFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleCreatePoll(e: FormEvent) {
    e.preventDefault();
    const parsedOptions = pollOptionsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (pollTitle.trim().length < 3 || parsedOptions.length < 2) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidPollTitle'),
        description: t('invalidPollDesc'),
      });
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('launchPollTitle'),
      description: t('launchPollDesc'),
      details: [
        { label: t('detailTitle'), value: pollTitle.trim() },
        { label: t('detailCategory'), value: formatCategory(pollCategory) },
        { label: t('detailOptions'), value: parsedOptions.join(' / ') },
      ],
      confirmLabel: t('launchPollBtn'),
      run: async () => {
        setCreatingPoll(true);
        try {
          await api.createPoll({
            title: pollTitle.trim(),
            description: pollDescription.trim(),
            category: pollCategory,
            options: parsedOptions,
            closesAt: pollClosesAt ? new Date(pollClosesAt).toISOString() : undefined,
          });
          setPollTitle('');
          setPollDescription('');
          setPollClosesAt('');
          setShowCreatePoll(false);
          setModal(null);
          await onRefresh();
          toast.success(t('pollLaunchedTitle'), t('pollLaunchedDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('pollCreateFailedTitle'),
            description: err instanceof Error ? err.message : t('pollCreateFailedDesc'),
          });
        } finally {
          setCreatingPoll(false);
        }
      },
    });
  }

  function handleDisburse(loanId: string) {
    const loan = loans.find((l) => l.id === loanId);
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('disburseTitle'),
      description: t('disburseDesc'),
      details: [
        { label: t('detailLoanId'), value: loanId },
        ...(loan
          ? [
              { label: t('detailBorrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: t('detailPrincipal'), value: formatMoney(loan.amount, ccy) },
            ]
          : []),
      ],
      confirmLabel: t('confirmDisburseBtn'),
      inputLabel: t('disburseTxLabel'),
      inputPlaceholder: t('disburseTxPlaceholder'),
      inputRequired: false,
      run: async (txInput) => {
        setBusyId(loanId);
        try {
          await api.disburseLoan(
            loanId,
            txInput.trim() ? { transactionNumber: txInput.trim() } : undefined
          );
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('disbursedTitle'),
            description: t('disbursedDesc', { loanId }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('disburseFailedTitle'),
            description: err instanceof Error ? err.message : t('disburseFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleGuarantorRespond(loanId: string, decision: 'accept' | 'decline') {
    const loan = loans.find((l) => l.id === loanId);
    setModal({
      mode: 'confirm',
      tone: decision === 'accept' ? 'emerald' : 'red',
      title: decision === 'accept' ? t('acceptGuarantorTitle') : t('declineGuarantorTitle'),
      description: decision === 'accept' ? t('acceptGuarantorDesc') : t('declineGuarantorDesc'),
      details: [
        { label: t('detailLoanId'), value: loanId },
        ...(loan
          ? [
              { label: t('detailBorrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: t('detailAmount'), value: formatMoney(loan.amount, ccy) },
            ]
          : []),
      ],
      confirmLabel: decision === 'accept' ? t('acceptCoSignBtn') : t('declineRequestBtn'),
      run: async () => {
        setBusyId(loanId);
        try {
          await api.respondAsGuarantor(loanId, decision);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: decision === 'accept' ? t('coSignRecordedTitle') : t('coSignDeclinedTitle'),
            description:
              decision === 'accept'
                ? t('coSignRecordedDesc', { loanId })
                : t('coSignDeclinedDesc', { loanId }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('guarantorFailedTitle'),
            description: err instanceof Error ? err.message : t('guarantorFailedDesc'),
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  const openProjects = projects.filter((p) => p.votingStatus === 'open');
  const closedProjects = projects.filter((p) => p.votingStatus !== 'open');

  const openPolls = polls.filter((p) => p.status === 'open');
  const closedPolls = polls.filter((p) => p.status !== 'open');

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
      l.status !== 'pending_guarantor' &&
      l.status !== 'pending_manager_review'
  );

  const showLoans = categoryFilter === 'all' || categoryFilter === 'loans';
  const showInvestments = categoryFilter === 'all' || categoryFilter === 'investments';
  const showPolls = categoryFilter === 'all' || categoryFilter === 'polls';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {isAdmin && (
        <div
          role="note"
          className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl p-3.5 sm:p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2.5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)]"
        >
          <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>
            <strong>{t('adminAuditBannerTitle')}</strong> {t('adminAuditBannerDesc')}
          </span>
        </div>
      )}

      {!isVerifiedMember && !isAdmin && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            {t('restrictedAccountPrefix')}{' '}
            <strong className="uppercase">
              {tStatus.has(user.status as never)
                ? tStatus(user.status as never)
                : user.status.replace(/_/g, ' ')}
            </strong>
            .
          </span>
        </div>
      )}

      <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('mainHeading')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('mainSubtitle')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full lg:w-auto">
            {isStaff && (
              <button
                type="button"
                onClick={() => setShowCreatePoll((v) => !v)}
                className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all duration-150"
              >
                <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showCreatePoll ? t('closePollForm') : t('initiateDecisionPoll')}</span>
              </button>
            )}

            <div className="flex flex-nowrap overflow-x-auto no-scrollbar max-w-full w-full lg:w-fit items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 rounded-xl">
              {(
                [
                  { id: 'all', label: t('tabAll') },
                  { id: 'loans', label: t('tabLoansCount', { count: pendingOrApprovedLoans.length }) },
                  { id: 'polls', label: t('tabPollsCount', { count: openPolls.length }) },
                  { id: 'investments', label: t('tabInvestmentsCount', { count: openProjects.length }) },
                ] as const
              ).map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="voting-category-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-500/20"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isStaff && showCreatePoll && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24 }}
              onSubmit={handleCreatePoll}
              className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden"
            >
            <div>
              <label
                htmlFor="poll-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('pollTitleLabel')}
              </label>
              <input
                id="poll-title"
                type="text"
                required
                value={pollTitle}
                onChange={(e) => setPollTitle(e.target.value)}
                placeholder={t('pollTitlePlaceholder')}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="poll-category"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t('pollCategoryLabel')}
                </label>
                <select
                  id="poll-category"
                  value={pollCategory}
                  onChange={(e) => setPollCategory(e.target.value as DecisionPoll['category'])}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                >
                  <option value="general">{t('catGeneral')}</option>
                  <option value="policy">{t('catPolicy')}</option>
                  <option value="qard_hasan">{t('catQardHasan')}</option>
                  <option value="project">{t('catProject')}</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="poll-closes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t('pollClosingLabel')}
                </label>
                <input
                  id="poll-closes"
                  type="datetime-local"
                  value={pollClosesAt}
                  onChange={(e) => setPollClosesAt(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="poll-desc"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('pollContextLabel')}
              </label>
              <textarea
                id="poll-desc"
                rows={3}
                value={pollDescription}
                onChange={(e) => setPollDescription(e.target.value)}
                placeholder={t('pollContextPlaceholder')}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label
                htmlFor="poll-opts"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('pollOptionsLabel')}
              </label>
              <textarea
                id="poll-opts"
                rows={3}
                required
                value={pollOptionsText}
                onChange={(e) => setPollOptionsText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 sm:flex sm:flex-wrap justify-end gap-2 [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:justify-center">
              <button
                type="button"
                disabled={creatingPoll || rewritingPoll}
                onClick={async () => {
                  if (!pollTitle.trim() && !pollDescription.trim()) {
                    setModal({
                      mode: 'notice',
                      tone: 'amber',
                      title: t('enterDraftFirstTitle'),
                      description: t('enterDraftFirstDesc'),
                    });
                    return;
                  }
                  setRewritingPoll(true);
                  try {
                    const res = await api.rewriteWithAi({
                      context: 'poll',
                      title: pollTitle.trim() ? pollTitle : undefined,
                      text: pollDescription.trim() || pollTitle.trim(),
                      tone: 'clear',
                    });
                    if (res.result.rewrittenTitle && pollTitle.trim()) {
                      setPollTitle(res.result.rewrittenTitle);
                    }
                    if (pollDescription.trim()) {
                      setPollDescription(res.result.rewrittenText);
                    }
                  } catch (err) {
                    setModal({
                      mode: 'notice',
                      tone: 'red',
                      title: t('aiRewriteUnavailableTitle'),
                      description:
                        err instanceof Error ? err.message : t('aiRewriteUnavailableDesc'),
                    });
                  } finally {
                    setRewritingPoll(false);
                  }
                }}
                className="col-span-2 sm:col-span-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/50 dark:bg-teal-950/25 hover:bg-teal-100/60 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-700 dark:text-teal-300 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{rewritingPoll ? t('rewriting') : t('aiRewrite')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreatePoll(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={creatingPoll}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {creatingPoll ? t('launching') : t('launchSecretPoll')}
              </button>
            </div>
            </motion.form>
          )}
        </AnimatePresence>
      </section>

      {!isAdmin && guarantorPendingForMe.length > 0 && (
        <section className="bg-amber-50/85 dark:bg-amber-950/35 backdrop-blur-xl border border-amber-200/80 dark:border-amber-900/60 ring-1 ring-inset ring-white/60 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-3 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>{t('awaitingGuarantorHeading', { count: guarantorPendingForMe.length })}</span>
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {guarantorPendingForMe.map((loan) => (
              <div
                key={loan.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {onViewMemberProfile ? (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(loan.borrowerId)}
                        className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                      >
                        {loan.borrowerName}
                      </button>
                    ) : (
                      loan.borrowerName
                    )}{' '}
                    ({loan.borrowerCode}) ·{' '}
                    <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {loan.id} · {loan.purpose}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:justify-center">
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'accept')}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {t('acceptCoSignBtn')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void handleGuarantorRespond(loan.id, 'decline')}
                    className="px-3.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    {t('decline')}
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
            <div
              key={i}
              className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-5 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)]"
            >
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton width={220} height={14} />
                  <Skeleton width="55%" height={22} />
                  <Skeleton width="85%" height={14} />
                </div>
                <div className="lg:w-80 shrink-0">
                  <Skeleton height={110} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Section 1: Qard Hasan Loan Ballots */}
          {showLoans && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('loanVotingHeading')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {t('activeCount', { count: pendingOrApprovedLoans.length })}
                </span>
              </div>

              {pendingOrApprovedLoans.length === 0 ? (
                <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('emptyLoans')}
                </div>
              ) : (
                pendingOrApprovedLoans.map((loan) => {
                  const isRevealed = Boolean(loan.voteResultRevealed);
                  const canSeeTally = isRevealed || isAdmin;
                  const approveCount =
                    loan.approveCount ?? loan.votes.filter((v) => v.decision === 'approve').length;
                  const rejectCount =
                    loan.rejectCount ?? loan.votes.filter((v) => v.decision === 'reject').length;
                  const totalCast = loan.totalVotesCast ?? loan.votes.length;
                  const remainingNeeded = Math.max(0, loan.requiredApprovals - approveCount);
                  const progressPct = Math.min(
                    100,
                    Math.round((approveCount / Math.max(1, loan.requiredApprovals)) * 100)
                  );
                  const myVote = loan.votes.find((v) => v.isSelf || v.voterId === user.id);
                  const adminLedger = loan.adminVoteLedger || [];
                  const ledgerExpanded = Boolean(expandedAdminLedgers[loan.id]);
                  const deadlinePassed = Boolean(
                    loan.voteDeadlineAt && new Date(loan.voteDeadlineAt).getTime() < nowTick
                  );
                  const votingOpen =
                    loan.status === 'pending_vote' && !isRevealed && !deadlinePassed;
                  const castProgressPct = Math.min(
                    100,
                    Math.round((totalCast / Math.max(1, loan.totalEligibleVoters)) * 100)
                  );

                  return (
                    <article
                      key={loan.id}
                      className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 hover:border-amber-300 dark:hover:border-amber-700/70 rounded-2xl p-4 sm:p-6 space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {loan.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{t('requestedAt', { date: formatDateTime(loan.requestedAt) })}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status={loan.status} />
                            {!isRevealed && loan.status === 'pending_vote' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>
                                  {deadlinePassed ? t('deadlinePassedBadge') : t('pollOngoingBadge')}
                                </span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {onViewMemberProfile ? (
                              <button
                                type="button"
                                onClick={() => onViewMemberProfile(loan.borrowerId)}
                                className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                              >
                                {loan.borrowerName}
                              </button>
                            ) : (
                              loan.borrowerName
                            )}{' '}
                            ({loan.borrowerCode}) — {formatMoney(loan.amount, ccy)}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                            {loan.purpose}
                          </p>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {t('repaymentPlanLine', {
                              months: loan.installmentMonths,
                              amount: formatMoney(loan.monthlyInstallment, ccy),
                            })}
                          </div>
                          {loan.guarantors && loan.guarantors.length > 0 && (
                            <div className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {t('coSignedBy', {
                                  names:
                                    loan.guarantors
                                      .filter((g) => g.status === 'accepted')
                                      .map((g) => `${g.memberName} (${g.memberCode})`)
                                      .join(', ') || t('guarantorsFallback'),
                                })}
                              </span>
                            </div>
                          )}

                          {/* Full applicant summary for voters */}
                          {loan.status === 'pending_vote' && !isRevealed && (
                            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                              <div className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                {t('applicantDetailsHeading')}
                              </div>
                              {[
                                {
                                  label: t('detailApplicant'),
                                  value: `${loan.borrowerName} (${loan.borrowerCode})`,
                                },
                                { label: t('detailPrincipal'), value: formatMoney(loan.amount, ccy) },
                                {
                                  label: t('scheduleLabel'),
                                  value: `${loan.installmentMonths} × ${formatMoney(loan.monthlyInstallment, ccy)}`,
                                },
                                { label: t('detailPurpose'), value: loan.purpose },
                                {
                                  label: t('requestedLabel'),
                                  value: formatDateTime(loan.requestedAt),
                                },
                                {
                                  label: t('eligibilitySnapshotLabel'),
                                  value: loan.eligibilitySnapshot?.eligible
                                    ? t('eligibleAtApplication')
                                    : loan.eligibilitySnapshot?.reasons?.[0] || t('recordedFallback'),
                                },
                              ].map((row) => (
                                <div
                                  key={row.label}
                                  className="px-3 py-1.5 flex items-start justify-between gap-3"
                                >
                                  <span className="text-slate-500 dark:text-slate-400 shrink-0">
                                    {row.label}
                                  </span>
                                  <span className="text-right text-slate-900 dark:text-slate-100 break-all">
                                    {row.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="lg:w-80 shrink-0 space-y-2.5 p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80">
                          {loan.status === 'pending_vote' && !isRevealed && (
                            <div className="flex items-center justify-between gap-2 text-xs pb-2 border-b border-slate-200 dark:border-slate-800">
                              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t('deadlineLabel')}</span>
                              </span>
                              <span
                                className={`font-mono tabular-nums font-semibold ${
                                  deadlinePassed
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {formatCountdown(loan.voteDeadlineAt)}
                              </span>
                            </div>
                          )}
                          {canSeeTally ? (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {isRevealed ? t('revealedVoteResult') : t('adminConfidentialTally')}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {t('upvotesProgress', {
                                    count: approveCount,
                                    required: loan.requiredApprovals,
                                  })}
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500"
                                  style={{ width: `${progressPct}%`, originX: 0 }}
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {t('upvotesCount', { count: approveCount })}
                                </span>
                                <span className="text-rose-700 dark:text-rose-400">
                                  {t('downvotesCount', { count: rejectCount })}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {remainingNeeded > 0
                                    ? t('castOfActive', {
                                        cast: totalCast,
                                        eligible: loan.totalEligibleVoters,
                                      })
                                    : t('quorumMetActive', { eligible: loan.totalEligibleVoters })}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t('secretBallotHidden')}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 dark:text-slate-300">
                                  {t('ballotsCastLabel')}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {totalCast} / {loan.totalEligibleVoters}
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: `${castProgressPct}%`, originX: 0 }}
                                />
                              </div>
                            </div>
                          )}

                          {isStaff && loan.status === 'pending_vote' && !isRevealed && (
                            <div className="space-y-2 pt-1">
                              <button
                                type="button"
                                disabled={busyId === `extend-${loan.id}`}
                                onClick={() => handleExtendDeadline(loan.id)}
                                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {busyId === `extend-${loan.id}`
                                    ? t('extending')
                                    : t('extendDeadlineBtn')}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === `reveal-${loan.id}`}
                                onClick={() => void handleRevealLoanVote(loan.id)}
                                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {busyId === `reveal-${loan.id}`
                                    ? t('revealingResult')
                                    : t('stopVotingRevealResult')}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Admin-only Individual Vote Audit Ledger */}
                      {isAdmin && adminLedger.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleAdminLedger(loan.id)}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {ledgerExpanded
                                ? t('hideAdminVoteLedger', { count: adminLedger.length })
                                : t('inspectAdminVoteLedger', { count: adminLedger.length })}
                            </span>
                          </button>

                          {ledgerExpanded && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                              {adminLedger.map((v) => {
                                const isUp = v.decision === 'approve';
                                return (
                                  <div
                                    key={`${loan.id}-${v.voterId}`}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-start justify-between gap-2 text-xs"
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
                                        <span className="text-[10px] uppercase font-mono text-slate-500 dark:text-slate-400">
                                          ({v.voterRole})
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
                                        {isUp ? t('upvotedLabel') : t('downvotedLabel')}
                                      </div>
                                      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                        {shortHash(v.signatureHash)}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Member/Manager Vote Controls — change allowed until deadline */}
                      {loan.status === 'pending_vote' && !isRevealed && !isAdmin && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                          {myVote && (
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Vote className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                              <span>
                                {t('yourBallotPrefix')}{' '}
                                <strong className="uppercase">
                                  {myVote.decision === 'approve' ? t('upvote') : t('downvote')}
                                </strong>{' '}
                                · {formatDateTime(myVote.castAt)}{' '}
                                {t('sigPrefix', { hash: shortHash(myVote.signatureHash) })}
                              </span>
                            </div>
                          )}
                          {votingOpen ? (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <input
                                type="text"
                                disabled={!canCastBallot}
                                value={comments[loan.id] || ''}
                                onChange={(e) =>
                                  setComments((prev) => ({ ...prev, [loan.id]: e.target.value }))
                                }
                                placeholder={t('optionalRationalePlaceholder')}
                                className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                              />
                              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:justify-center">
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === loan.id}
                                  onClick={() => void handleLoanVote(loan.id, 'upvote')}
                                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{myVote ? t('changeToUpvote') : t('upvote')}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === loan.id}
                                  onClick={() => void handleLoanVote(loan.id, 'downvote')}
                                  className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white active:scale-[0.98] transition-all duration-150 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{myVote ? t('changeToDownvote') : t('downvote')}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            !myVote && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('votingClosedAwaitingReveal')}
                              </p>
                            )
                          )}
                        </div>
                      )}

                      {loan.status === 'approved_pending_disbursement' && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>
                              {t('approvedForDisbursementMsg', {
                                approve: approveCount,
                                total: loan.totalEligibleVoters,
                                amount: formatMoney(loan.amount, ccy),
                                name: loan.borrowerName,
                              })}
                            </span>
                          </div>
                          {isStaff && (
                            isAdmin || loan.borrowerId !== user.id ? (
                              <button
                                type="button"
                                disabled={
                                  busyId === loan.id ||
                                  (typeof availableLiquidity === 'number' &&
                                    loan.amount > availableLiquidity)
                                }
                                onClick={() => handleDisburse(loan.id)}
                                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                {busyId === loan.id
                                  ? t('disbursing')
                                  : t('confirmDeductFromFund')}
                              </button>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                {t('peerAdminDisburseRequired')}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          )}

          {/* Section 2: General & Policy Decision Polls */}
          {showPolls && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('decisionPollsHeading')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {t('ongoingCount', { count: openPolls.length })}
                </span>
              </div>

              {openPolls.length === 0 ? (
                <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('emptyPolls')}
                </div>
              ) : (
                openPolls.map((poll) => {
                  const isRevealed = Boolean(poll.voteResultRevealed);
                  const canSeeTally = isRevealed || isAdmin;
                  const totalCast = poll.totalVotesCast ?? poll.votes.length;
                  const myVote = poll.votes.find((v) => v.isSelf || v.voterId === user.id);
                  const myOptionLabel = myVote
                    ? poll.options.find((o) => o.id === myVote.optionId)?.label || myVote.optionId
                    : null;
                  const adminLedger = poll.adminVoteLedger || [];
                  const ledgerExpanded = Boolean(expandedAdminLedgers[poll.id]);

                  return (
                    <article
                      key={poll.id}
                      className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                              {formatCategory(poll.category)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{t('initiatedBy', { name: poll.createdByName })}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status={poll.status} />
                            {!isRevealed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>{t('pollOngoingBadge')}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {poll.title}
                          </h4>
                          {poll.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                              {poll.description}
                            </p>
                          )}
                        </div>

                        <div className="lg:w-72 shrink-0 p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400">
                              {t('ballotsCastHeading')}
                            </span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-white">
                              {totalCast}
                            </span>
                          </div>
                          {!canSeeTally && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                              <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t('resultsHiddenOngoing')}</span>
                            </p>
                          )}
                          {isStaff && !isRevealed && (
                            <button
                              type="button"
                              disabled={busyId === `reveal-poll-${poll.id}`}
                              onClick={() => void handleRevealPoll(poll.id)}
                              className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {busyId === `reveal-poll-${poll.id}`
                                  ? t('revealing')
                                  : t('stopVotingRevealResults')}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {canSeeTally && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {poll.options.map((opt) => {
                            const count = opt.voteCount ?? 0;
                            const pct =
                              totalCast > 0 ? Math.round((count / totalCast) * 100) : 0;
                            return (
                              <div
                                key={opt.id}
                                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-1.5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-slate-900 dark:text-white">
                                    {opt.label}
                                  </span>
                                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                    {count} ({pct}%)
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <motion.div
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                    className="h-full rounded-full bg-emerald-600"
                                    style={{ width: `${pct}%`, originX: 0 }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isAdmin && adminLedger.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleAdminLedger(poll.id)}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {ledgerExpanded
                                ? t('hidePollAdminLedger', { count: adminLedger.length })
                                : t('inspectPollAdminLedger', { count: adminLedger.length })}
                            </span>
                          </button>
                          {ledgerExpanded && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {adminLedger.map((v) => {
                                const lbl =
                                  poll.options.find((o) => o.id === v.optionId)?.label ||
                                  v.optionId;
                                return (
                                  <div
                                    key={`${poll.id}-${v.voterId}`}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <span className="font-medium text-slate-900 dark:text-white">
                                        {v.voterName}
                                      </span>{' '}
                                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                        ({v.voterRole})
                                      </span>
                                    </div>
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                      {lbl}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {!isAdmin && poll.status === 'open' && !isRevealed && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          {myVote ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Vote className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              <span>
                                {t('pollBallotRecorded', {
                                  option: myOptionLabel || '',
                                  date: formatDateTime(myVote.castAt),
                                  hash: shortHash(myVote.signatureHash),
                                })}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {poll.options.map((opt) => {
                                  const selected = pollChoices[poll.id] === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      disabled={!canCastBallot}
                                      onClick={() =>
                                        setPollChoices((prev) => ({
                                          ...prev,
                                          [poll.id]: opt.id,
                                        }))
                                      }
                                      className={`min-h-[40px] sm:min-h-0 px-3.5 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 ${
                                        selected
                                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  disabled={!canCastBallot}
                                  value={comments[poll.id] || ''}
                                  onChange={(e) =>
                                    setComments((prev) => ({
                                      ...prev,
                                      [poll.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={t('optionalNotePlaceholder')}
                                  className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                                />
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === `poll-${poll.id}`}
                                  onClick={() => void handlePollVote(poll.id)}
                                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  {t('submitSecretVote')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          )}

          {/* Section 3: Fund Investment Placement Ballots */}
          {showInvestments && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('investmentsHeading')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('openForVoteCount', { count: openProjects.length })}
                </span>
              </div>

              {openProjects.length === 0 ? (
                <div className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('emptyInvestments')}
                </div>
              ) : (
                openProjects.map((proj) => {
                  const isRevealed = Boolean(proj.voteResultRevealed);
                  const canSeeTally = isRevealed || isAdmin;
                  const yesVotes =
                    proj.yesCount ?? proj.votes.filter((v) => v.decision === 'yes').length;
                  const noVotes =
                    proj.noCount ?? proj.votes.filter((v) => v.decision === 'no').length;
                  const totalCast = proj.totalVotesCast ?? proj.votes.length;
                  const totalEligible = proj.totalEligibleVoters || 1;
                  const reqApprovals =
                    proj.requiredApprovals || Math.ceil((totalEligible * 2) / 3);
                  const progressPct = Math.min(100, Math.round((yesVotes / reqApprovals) * 100));
                  const yesPct = Math.round((yesVotes / totalEligible) * 100);
                  const myVote = proj.votes.find((v) => v.isSelf || v.voterId === user.id);
                  const adminLedger = proj.adminVoteLedger || [];
                  const ledgerExpanded = Boolean(expandedAdminLedgers[proj.id]);

                  return (
                    <article
                      key={proj.id}
                      className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {t('investmentPlacementPrefix', { structure: proj.shariahStructure })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{proj.sector}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status="pending" />
                            {!isRevealed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>{t('pollOngoingBadge')}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {proj.title} — {formatMoney(proj.targetAllocation, ccy)}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                            {proj.shariahScholarNote}
                          </p>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {t('projectedReturnRisk', {
                              ret: proj.projectedAnnualReturn,
                              risk: proj.riskTier,
                            })}
                          </div>
                        </div>

                        <div className="lg:w-72 shrink-0 space-y-2 p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80">
                          {canSeeTally ? (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {isRevealed ? t('revealedTally') : t('adminTally')}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {t('yesTallyProgress', {
                                    yes: yesVotes,
                                    req: reqApprovals,
                                    pct: yesPct,
                                  })}
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500"
                                  style={{ width: `${progressPct}%`, originX: 0 }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                <span>{t('yesCount', { count: yesVotes })}</span>
                                <span>{t('noCount', { count: noVotes })}</span>
                                <span>{t('activeVotersCount', { count: totalEligible })}</span>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t('pollOngoingBadge')}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t('secretBallotsSubmitted', { count: totalCast })}
                              </p>
                            </div>
                          )}

                          {isStaff && !isRevealed && (
                            <button
                              type="button"
                              disabled={busyId === `reveal-proj-${proj.id}`}
                              onClick={() => void handleRevealProjectVote(proj.id)}
                              className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {busyId === `reveal-proj-${proj.id}`
                                  ? t('revealing')
                                  : t('stopVotingRevealResult')}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isAdmin && adminLedger.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleAdminLedger(proj.id)}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {ledgerExpanded
                                ? t('hideProjectAdminLedger', { count: adminLedger.length })
                                : t('inspectProjectAdminLedger', { count: adminLedger.length })}
                            </span>
                          </button>
                          {ledgerExpanded && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {adminLedger.map((v) => (
                                <div
                                  key={`${proj.id}-${v.voterId}`}
                                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs flex items-center justify-between gap-2"
                                >
                                  <span>{v.voterName}</span>
                                  <span
                                    className={`font-semibold uppercase ${
                                      v.decision === 'yes'
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}
                                  >
                                    {v.decision === 'yes' ? t('yesLabel') : t('noLabel')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {!isAdmin && !isRevealed && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                          {myVote ? (
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Vote className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              <span>
                                {t('youVotedProject', {
                                  decision:
                                    myVote.decision === 'yes' ? t('yesLabel') : t('noLabel'),
                                  date: formatDateTime(myVote.castAt),
                                  hash: shortHash(myVote.signatureHash),
                                })}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <input
                                type="text"
                                disabled={!canCastBallot}
                                value={comments[proj.id] || ''}
                                onChange={(e) =>
                                  setComments((prev) => ({ ...prev, [proj.id]: e.target.value }))
                                }
                                placeholder={t('optionalConfidentialRationale')}
                                className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                              />
                              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:justify-center">
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === proj.id}
                                  onClick={() => void handleProjectVote(proj.id, 'yes')}
                                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{t('voteYes')}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === proj.id}
                                  onClick={() => void handleProjectVote(proj.id, 'no')}
                                  className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white active:scale-[0.98] transition-all text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{t('voteNo')}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          )}

          {/* Completed Voting Outcomes (Revealed Tallies Only) */}
          {(closedProjects.length > 0 || archivedLoans.length > 0 || closedPolls.length > 0) && (
            <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('completedOutcomesHeading')}
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {closedPolls.map((poll) => {
                  const totalCast = poll.totalVotesCast ?? poll.votes.length;
                  return (
                    <div
                      key={poll.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div>
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            {t('outcomeDecisionPoll')}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {poll.title}
                          </span>
                          {(poll.voteResultRevealed || isAdmin) && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {poll.options
                                  .map((o) => `${o.label}: ${o.voteCount ?? 0}`)
                                  .join(' / ')}{' '}
                                {t('castCountParen', { count: totalCast })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <StatusText status={poll.status} />
                    </div>
                  );
                })}
                {closedProjects.map((proj) => {
                  const canSee = Boolean(proj.voteResultRevealed) || isAdmin;
                  const yesVotes =
                    proj.yesCount ?? proj.votes.filter((v) => v.decision === 'yes').length;
                  return (
                    <div
                      key={proj.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          {t('outcomePlacement')}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {proj.title}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">
                          {formatMoney(proj.targetAllocation, ccy)}
                        </span>
                        {canSee && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {t('votedYesRatio', {
                                yes: yesVotes,
                                total: proj.totalEligibleVoters,
                              })}
                            </span>
                          </>
                        )}
                      </div>
                      <StatusText
                        status={proj.votingStatus === 'approved' ? 'approved' : 'rejected'}
                      />
                    </div>
                  );
                })}
                {archivedLoans.map((loan) => {
                  const canSee = Boolean(loan.voteResultRevealed) || isAdmin;
                  const approvals =
                    loan.approveCount ?? loan.votes.filter((v) => v.decision === 'approve').length;
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
                          {onViewMemberProfile ? (
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(loan.borrowerId)}
                              className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {loan.borrowerName}
                            </button>
                          ) : (
                            loan.borrowerName
                          )}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                        {canSee && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {t('approvedRatio', {
                                approved: approvals,
                                total: loan.totalEligibleVoters,
                              })}
                            </span>
                          </>
                        )}
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
      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : t('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : undefined}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async (val) => {
                setModalBusy(true);
                try {
                  await modal.run(val);
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
    </motion.div>
  );
}
