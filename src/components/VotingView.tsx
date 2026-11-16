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
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
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
  const ccy = config?.currency || 'BDT';
  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'admin' || user.role === 'manager';
  const isVerifiedMember = user.status === 'active';
  const canCastBallot = isVerifiedMember && !isAdmin;

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
  /** Tick every second so deadline countdowns stay live */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  function formatCountdown(deadlineIso: string | undefined): string {
    if (!deadlineIso) return 'No deadline set';
    const ms = new Date(deadlineIso).getTime() - nowTick;
    if (ms <= 0) return 'Deadline passed';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  // Create decision poll drawer state (Manager/Admin)
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollDescription, setPollDescription] = useState('');
  const [pollCategory, setPollCategory] = useState<DecisionPoll['category']>('general');
  const [pollOptionsText, setPollOptionsText] = useState('Approve\nReject\nAbstain');
  const [pollClosesAt, setPollClosesAt] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);

  function toggleAdminLedger(id: string) {
    setExpandedAdminLedgers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleLoanVote(loanId: string, decision: 'upvote' | 'downvote') {
    if (isAdmin) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Ballot Restricted for Administrators',
        description: 'Administrators oversee ballot integrity and do not cast member votes.',
      });
      return;
    }
    if (!isVerifiedMember) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: 'Verified Membership Required',
        description:
          'Only verified active cooperative members can vote on Qard Hasan loan requests.',
      });
      return;
    }
    const loan = loans.find((l) => l.id === loanId);
    if (loan?.voteDeadlineAt && new Date(loan.voteDeadlineAt).getTime() < Date.now()) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: 'Voting Deadline Passed',
        description: 'The ballot window has closed. You can no longer cast or change your vote.',
      });
      return;
    }
    const isChange = Boolean(loan?.votes.some((v) => v.isSelf || v.voterId === user.id));
    setModal({
      mode: 'confirm',
      tone: decision === 'upvote' ? 'emerald' : 'red',
      title: isChange
        ? `Change Ballot to ${decision === 'upvote' ? 'Upvote' : 'Downvote'}?`
        : `Cast Secret ${decision === 'upvote' ? 'Upvote' : 'Downvote'} Ballot?`,
      description: isChange
        ? 'Your previous sealed ballot will be replaced. You may change again until the deadline or until results are revealed.'
        : 'Your ballot is cryptographically signed and sealed until Manager reveals the tally. You may change it until the deadline.',
      details: [
        { label: 'Loan ID', value: loanId },
        ...(loan
          ? [
              { label: 'Applicant', value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: 'Amount', value: formatMoney(loan.amount, ccy) },
              { label: 'Purpose', value: loan.purpose },
              {
                label: 'Repayment',
                value: `${loan.installmentMonths} × ${formatMoney(loan.monthlyInstallment, ccy)}`,
              },
            ]
          : []),
        { label: 'Ballot Choice', value: decision.toUpperCase() },
      ],
      confirmLabel: isChange
        ? decision === 'upvote'
          ? 'Change to Upvote'
          : 'Change to Downvote'
        : decision === 'upvote'
          ? 'Confirm Upvote'
          : 'Confirm Downvote',
      run: async () => {
        setBusyId(loanId);
        try {
          await api.voteLoan(loanId, decision, comments[loanId]);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: isChange ? 'Ballot Updated' : 'Secret Ballot Recorded',
            description: isChange
              ? `Your ballot on ${loanId} was changed to ${decision.toUpperCase()}. Results stay sealed until reveal.`
              : `Your secret ${decision.toUpperCase()} ballot has been recorded on ${loanId}. You may change it until the deadline.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Vote Submission Failed',
            description: err instanceof Error ? err.message : 'Failed to submit vote.',
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
      title: 'Extend Voting Deadline?',
      description:
        'Add more time before results are revealed. Members can continue casting or changing ballots until the new deadline.',
      details: [{ label: 'Loan ID', value: loanId }],
      inputLabel: 'Additional hours',
      inputPlaceholder: 'e.g. 24',
      inputRequired: true,
      confirmLabel: 'Extend Deadline',
      run: async (hoursInput) => {
        const hours = Math.min(720, Math.max(1, Math.round(Number(hoursInput) || 24)));
        setBusyId(`extend-${loanId}`);
        try {
          await api.extendLoanVoteDeadline(loanId, hours);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Deadline Extended',
            description: `Ballot window for ${loanId} extended by ${hours} hours.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Extend Failed',
            description: err instanceof Error ? err.message : 'Failed to extend deadline.',
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
      title: 'Stop Voting & Reveal Ballot Result?',
      description:
        'This closes secret balloting on this loan proposal and publishes final upvote/downvote tallies to all members.',
      details: [{ label: 'Loan ID', value: loanId }],
      confirmLabel: 'Stop & Reveal Result',
      run: async () => {
        setBusyId(`reveal-${loanId}`);
        try {
          const res = await api.revealLoanVote(loanId);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Ballot Result Revealed',
            description: `Vote results for ${loanId} are now stopped & revealed (${res.loan.status.replace(/_/g, ' ')}).`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Reveal Failed',
            description: err instanceof Error ? err.message : 'Failed to reveal loan vote results.',
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
        title: 'Ballot Restricted for Administrators',
        description: 'Administrators oversee ballot integrity and do not cast member votes.',
      });
      return;
    }
    const proj = projects.find((p) => p.id === projectId);
    setModal({
      mode: 'confirm',
      tone: decision === 'yes' ? 'emerald' : 'red',
      title: `Seal "${decision.toUpperCase()}" Investment Ballot?`,
      description:
        'Confirm your secret placement vote. Tallies stay hidden until revealed by Manager/Admin.',
      details: [
        ...(proj ? [{ label: 'Project', value: proj.title }] : []),
        { label: 'Decision', value: decision.toUpperCase() },
      ],
      confirmLabel: decision === 'yes' ? 'Confirm Vote Yes' : 'Confirm Vote No',
      run: async () => {
        setBusyId(projectId);
        try {
          const res = await api.voteHalalProject(projectId, decision, comments[projectId]);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Investment Ballot Sealed',
            description: `Your "${decision.toUpperCase()}" ballot on "${res.project.title}" has been sealed in the ballot box.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Ballot Failed',
            description: err instanceof Error ? err.message : 'Failed to submit placement vote.',
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
      title: 'Stop Investment Vote & Reveal Result?',
      description:
        'Closing voting reveals the final Yes/No tally for this Halal investment placement proposal.',
      details: [{ label: 'Proposal', value: proj?.title || projectId }],
      confirmLabel: 'Stop & Reveal Result',
      run: async () => {
        setBusyId(`reveal-proj-${projectId}`);
        try {
          const res = await api.revealHalalProjectVote(projectId);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Investment Vote Revealed',
            description: `Investment vote results for "${res.project.title}" are now stopped & revealed.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Reveal Failed',
            description:
              err instanceof Error ? err.message : 'Failed to reveal investment vote results.',
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
        title: 'Select a Ballot Option',
        description: 'Please select an option before submitting your ballot.',
      });
      return;
    }
    const poll = polls.find((p) => p.id === pollId);
    const optionLabel = poll?.options.find((o) => o.id === optionId)?.label || optionId;
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Submit Secret Decision Ballot?',
      description: 'Confirm casting your sealed vote on this cooperative decision poll.',
      details: [
        { label: 'Poll', value: poll?.title || pollId },
        { label: 'Selected Option', value: optionLabel },
      ],
      confirmLabel: 'Cast Secret Vote',
      run: async () => {
        setBusyId(`poll-${pollId}`);
        try {
          await api.votePoll(pollId, optionId, comments[pollId]);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Decision Ballot Recorded',
            description:
              'Your secret decision ballot has been recorded. Tallies remain hidden until Manager/Admin reveals results.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Vote Failed',
            description: err instanceof Error ? err.message : 'Failed to submit decision vote.',
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
      title: 'Close Poll & Reveal Verified Tallies?',
      description: 'Closing this decision poll makes verified tallies visible to all members.',
      details: [{ label: 'Poll', value: poll?.title || pollId }],
      confirmLabel: 'Close & Reveal Poll',
      run: async () => {
        setBusyId(`reveal-poll-${pollId}`);
        try {
          await api.revealPoll(pollId);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Decision Poll Revealed',
            description:
              'Decision poll closed and verified results are now visible to all members.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Reveal Failed',
            description:
              err instanceof Error ? err.message : 'Failed to reveal decision poll results.',
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
        title: 'Invalid Poll Configuration',
        description:
          'Provide a clear poll title and at least two ballot options (one per line or comma-separated).',
      });
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Launch Secret Decision Poll?',
      description: 'Members will be notified to cast secret ballots once launched.',
      details: [
        { label: 'Title', value: pollTitle.trim() },
        { label: 'Category', value: pollCategory.replace(/_/g, ' ') },
        { label: 'Options', value: parsedOptions.join(' / ') },
      ],
      confirmLabel: 'Launch Poll',
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
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Decision Poll Launched',
            description: 'Decision poll launched and cooperative members have been notified.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Poll Creation Failed',
            description: err instanceof Error ? err.message : 'Failed to launch decision poll.',
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
      title: 'Confirm Qard Hasan Disbursement?',
      description:
        'Confirming deducts principal from available treasury liquidity, signs a SHA-256 disbursement voucher, and notifies the borrower.',
      details: [
        { label: 'Loan ID', value: loanId },
        ...(loan
          ? [
              { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: 'Principal', value: formatMoney(loan.amount, ccy) },
            ]
          : []),
      ],
      confirmLabel: 'Confirm & Disburse',
      inputLabel: 'Disbursement Transaction Number (TrxID / Bank Ref)',
      inputPlaceholder: 'e.g. TRX-99887766 or Bank Ref (auto-generated if blank)',
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
            title: 'Qard Hasan Disbursed',
            description: `Qard Hasan disbursement confirmed for ${loanId}. Fund balance deducted and borrower notified.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Disbursement Failed',
            description: err instanceof Error ? err.message : 'Failed to disburse loan.',
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
      title:
        decision === 'accept'
          ? 'Accept Guarantor Co-Signature?'
          : 'Decline Guarantor Co-Signature?',
      description:
        decision === 'accept'
          ? 'Co-signing vouches for this member loan request in the cooperative ledger.'
          : 'Declining informs the borrower and stops this guarantor nomination.',
      details: [
        { label: 'Loan ID', value: loanId },
        ...(loan
          ? [
              { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
              { label: 'Amount', value: formatMoney(loan.amount, ccy) },
            ]
          : []),
      ],
      confirmLabel: decision === 'accept' ? 'Accept Co-Sign' : 'Decline Request',
      run: async () => {
        setBusyId(loanId);
        try {
          await api.respondAsGuarantor(loanId, decision);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: decision === 'accept' ? 'Co-Signature Recorded' : 'Co-Signature Declined',
            description:
              decision === 'accept'
                ? `Guarantor co-signature recorded on ${loanId}.`
                : `Guarantor co-signature declined for ${loanId}.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Guarantor Response Failed',
            description: err instanceof Error ? err.message : 'Failed to respond as guarantor.',
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
          className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/25 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2.5"
        >
          <Lock className="w-4 h-4 text-indigo-700 dark:text-indigo-400 shrink-0" aria-hidden="true" />
          <span>
            <strong>Administrator Ballot Audit View:</strong> Only Administrators can inspect
            individual member votes in the confidential audit ledger. Admins do not cast member
            ballots.
          </span>
        </div>
      )}

      {!isVerifiedMember && !isAdmin && (
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

      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Opinion Ballot — Qard Hasan, Investment &amp; Decision Polls
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Secret ballots stay sealed until revealed by a manager.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isStaff && (
              <button
                type="button"
                onClick={() => setShowCreatePoll((v) => !v)}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showCreatePoll ? 'Close Poll Form' : 'Initiate Decision Poll'}</span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Ballots' },
                  { id: 'loans', label: `Qard Hasan (${pendingOrApprovedLoans.length})` },
                  { id: 'polls', label: `Decision Polls (${openPolls.length})` },
                  { id: 'investments', label: `Investments (${openProjects.length})` },
                ] as const
              ).map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="voting-category-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
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
                Decision Poll Title
              </label>
              <input
                id="poll-title"
                type="text"
                required
                value={pollTitle}
                onChange={(e) => setPollTitle(e.target.value)}
                placeholder="e.g. Approve Eid Emergency Qard Hasan Buffer"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="poll-category"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Category
                </label>
                <select
                  id="poll-category"
                  value={pollCategory}
                  onChange={(e) => setPollCategory(e.target.value as DecisionPoll['category'])}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="general">General Decision</option>
                  <option value="policy">Policy / Rules</option>
                  <option value="qard_hasan">Qard Hasan Matter</option>
                  <option value="project">Project / Venture</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="poll-closes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Optional Closing Date
                </label>
                <input
                  id="poll-closes"
                  type="datetime-local"
                  value={pollClosesAt}
                  onChange={(e) => setPollClosesAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="poll-desc"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Context / Description
              </label>
              <textarea
                id="poll-desc"
                rows={3}
                value={pollDescription}
                onChange={(e) => setPollDescription(e.target.value)}
                placeholder="Background context for cooperative members…"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="poll-opts"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Ballot Options (one per line)
              </label>
              <textarea
                id="poll-opts"
                rows={3}
                required
                value={pollOptionsText}
                onChange={(e) => setPollOptionsText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePoll(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingPoll}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {creatingPoll ? 'Launching…' : 'Launch Secret Poll'}
              </button>
            </div>
            </motion.form>
          )}
        </AnimatePresence>
      </section>

      {!isAdmin && guarantorPendingForMe.length > 0 && (
        <section className="bg-amber-50/75 dark:bg-amber-950/30 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <UserCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>Awaiting Your Guarantor Co-Signature ({guarantorPendingForMe.length})</span>
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
            <div
              key={i}
              className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-4"
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
                  Qard Hasan Approval Voting
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {pendingOrApprovedLoans.length} active
                </span>
              </div>

              {pendingOrApprovedLoans.length === 0 ? (
                <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No Qard Hasan proposals are currently open for voting or awaiting disbursement.
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
                      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-300 dark:hover:border-amber-700/70 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs transition-all duration-200"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {loan.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Requested {formatDateTime(loan.requestedAt)}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status={loan.status} />
                            {!isRevealed && loan.status === 'pending_vote' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>{deadlinePassed ? 'Deadline Passed' : 'Poll Ongoing'}</span>
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

                          {/* Full applicant summary for voters */}
                          {loan.status === 'pending_vote' && !isRevealed && (
                            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                              <div className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                                Applicant Application Details
                              </div>
                              {[
                                {
                                  label: 'Applicant',
                                  value: `${loan.borrowerName} (${loan.borrowerCode})`,
                                },
                                { label: 'Principal', value: formatMoney(loan.amount, ccy) },
                                {
                                  label: 'Schedule',
                                  value: `${loan.installmentMonths} × ${formatMoney(loan.monthlyInstallment, ccy)}`,
                                },
                                { label: 'Purpose', value: loan.purpose },
                                {
                                  label: 'Requested',
                                  value: formatDateTime(loan.requestedAt),
                                },
                                {
                                  label: 'Eligibility snapshot',
                                  value: loan.eligibilitySnapshot?.eligible
                                    ? 'Eligible at application'
                                    : loan.eligibilitySnapshot?.reasons?.[0] || 'Recorded',
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

                        <div className="lg:w-80 shrink-0 space-y-2.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          {loan.status === 'pending_vote' && !isRevealed && (
                            <div className="flex items-center justify-between gap-2 text-xs pb-2 border-b border-slate-200 dark:border-slate-800">
                              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Deadline</span>
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
                                  {isRevealed ? 'Revealed Vote Result' : 'Admin Confidential Tally'}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {approveCount} / {loan.requiredApprovals} upvotes
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
                                  Upvotes: {approveCount}
                                </span>
                                <span className="text-rose-700 dark:text-rose-400">
                                  Downvotes: {rejectCount}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {remainingNeeded > 0
                                    ? `${totalCast} cast (${loan.totalEligibleVoters} active)`
                                    : `Quorum met (${loan.totalEligibleVoters} active)`}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Secret Ballot — Results Hidden</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 dark:text-slate-300">
                                  Ballots cast
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
                                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-indigo-500"
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
                                className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {busyId === `extend-${loan.id}`
                                    ? 'Extending…'
                                    : 'Extend Deadline'}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === `reveal-${loan.id}`}
                                onClick={() => void handleRevealLoanVote(loan.id)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {busyId === `reveal-${loan.id}`
                                    ? 'Revealing Result…'
                                    : 'Stop Voting & Reveal Result'}
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
                              {ledgerExpanded ? 'Hide' : 'Inspect'} Confidential Admin Vote Ledger (
                              {adminLedger.length})
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
                                        {isUp ? 'Upvoted' : 'Downvoted'}
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
                                Your ballot:{' '}
                                <strong className="uppercase">
                                  {myVote.decision === 'approve' ? 'Upvote' : 'Downvote'}
                                </strong>{' '}
                                · {formatDateTime(myVote.castAt)} (Sig:{' '}
                                {shortHash(myVote.signatureHash)})
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
                                placeholder="Optional secret rationale (visible only to Admin audit)…"
                                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === loan.id}
                                  onClick={() => void handleLoanVote(loan.id, 'upvote')}
                                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{myVote ? 'Change to Upvote' : 'Upvote'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === loan.id}
                                  onClick={() => void handleLoanVote(loan.id, 'downvote')}
                                  className="px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white transition-all duration-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{myVote ? 'Change to Downvote' : 'Downvote'}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            !myVote && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Voting closed. Awaiting manager reveal.
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
                              Approved for Qard Hasan disbursement ({approveCount}/
                              {loan.totalEligibleVoters} upvotes). Confirming deducts{' '}
                              {formatMoney(loan.amount, ccy)} from central fund balance and notifies{' '}
                              {loan.borrowerName}.
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
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs transition-all duration-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                {busyId === loan.id
                                  ? 'Disbursing…'
                                  : 'Confirm & Deduct from Fund'}
                              </button>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                Peer / Admin Disbursement Required
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
                  Cooperative Decision Polls
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {openPolls.length} ongoing
                </span>
              </div>

              {openPolls.length === 0 ? (
                <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No cooperative decision polls are currently open.
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
                      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                              {poll.category.replace(/_/g, ' ')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Initiated by {poll.createdByName}</span>
                            <span aria-hidden="true">·</span>
                            <StatusText status={poll.status} />
                            {!isRevealed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>Poll Ongoing</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {poll.title}
                          </h4>
                          {poll.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {poll.description}
                            </p>
                          )}
                        </div>

                        <div className="lg:w-72 shrink-0 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Ballots Cast</span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-white">
                              {totalCast}
                            </span>
                          </div>
                          {!canSeeTally && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                              <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Results hidden while poll is ongoing.</span>
                            </p>
                          )}
                          {isStaff && !isRevealed && (
                            <button
                              type="button"
                              disabled={busyId === `reveal-poll-${poll.id}`}
                              onClick={() => void handleRevealPoll(poll.id)}
                              className="w-full px-3 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {busyId === `reveal-poll-${poll.id}`
                                  ? 'Revealing…'
                                  : 'Stop Voting & Reveal Results'}
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
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-teal-500"
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
                              {ledgerExpanded ? 'Hide' : 'Inspect'} Admin Vote Audit Ledger (
                              {adminLedger.length})
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
                                Your ballot was recorded for{' '}
                                <strong>{myOptionLabel}</strong> on{' '}
                                {formatDateTime(myVote.castAt)} (Sig:{' '}
                                {shortHash(myVote.signatureHash)}).
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
                                      className={`px-3.5 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 ${
                                        selected
                                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
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
                                  placeholder="Optional confidential note…"
                                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === `poll-${poll.id}`}
                                  onClick={() => void handlePollVote(poll.id)}
                                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  Submit Secret Vote
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
                  Halal Investment Placement Proposals (Yes / No)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {openProjects.length} open for vote
                </span>
              </div>

              {openProjects.length === 0 ? (
                <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No proposed investment placements are currently open for voting.
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
                      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs transition-all duration-200"
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
                            {!isRevealed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                                <Lock className="w-3 h-3" aria-hidden="true" />
                                <span>Poll Ongoing</span>
                              </span>
                            )}
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

                        <div className="lg:w-72 shrink-0 space-y-2 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          {canSeeTally ? (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {isRevealed ? 'Revealed Tally' : 'Admin Tally'}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {yesVotes} / {reqApprovals} Yes ({yesPct}%)
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
                                <span>Yes: {yesVotes}</span>
                                <span>No: {noVotes}</span>
                                <span>{totalEligible} active</span>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Poll Ongoing</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {totalCast} secret ballot{totalCast === 1 ? '' : 's'} submitted.
                                Results stay sealed until revealed.
                              </p>
                            </div>
                          )}

                          {isStaff && !isRevealed && (
                            <button
                              type="button"
                              disabled={busyId === `reveal-proj-${proj.id}`}
                              onClick={() => void handleRevealProjectVote(proj.id)}
                              className="w-full px-3 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {busyId === `reveal-proj-${proj.id}`
                                  ? 'Revealing…'
                                  : 'Stop Voting & Reveal Result'}
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
                              {ledgerExpanded ? 'Hide' : 'Inspect'} Confidential Admin Ledger (
                              {adminLedger.length})
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
                                    {v.decision}
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
                                You voted <strong className="uppercase">{myVote.decision}</strong>{' '}
                                on {formatDateTime(myVote.castAt)} (Sig:{' '}
                                {shortHash(myVote.signatureHash)})
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
                                placeholder="Optional confidential rationale…"
                                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === proj.id}
                                  onClick={() => void handleProjectVote(proj.id, 'yes')}
                                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Vote Yes</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCastBallot || busyId === proj.id}
                                  onClick={() => void handleProjectVote(proj.id, 'no')}
                                  className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Vote No</span>
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
            <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Completed &amp; Revealed Ballot Outcomes
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
                            Decision Poll
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
                                ({totalCast} cast)
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
                        {canSee && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {yesVotes}/{proj.totalEligibleVoters} voted Yes
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
                              {approvals}/{loan.totalEligibleVoters} approved
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
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
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
