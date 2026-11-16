'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  Eye,
  HandCoins,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import type {
  Contribution,
  CoopMeeting,
  DashboardOverview,
  DecisionPoll,
  FundConfig,
  HalalProject,
  LoanRequest,
  ProfileChangeRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatBillingMonth, formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ManagerCollectionGoalChart } from './ManagerCollectionGoalChart.tsx';
import { MemberAuditLogWidget } from './MemberAuditLogWidget.tsx';
import { StatusText } from './StatusText.tsx';

export type ManagerDeskTab =
  | 'contributions'
  | 'qard-hasan'
  | 'installments'
  | 'ballots'
  | 'meetings-profiles';

type DeskModalState =
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
      inputMultiline?: boolean;
      initialInputValue?: string;
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red' | 'slate';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

interface ManagerDeskViewProps {
  user: PublicUser;
  config: FundConfig | null;
  treasury?: DashboardOverview['treasury'] | null;
  loading?: boolean;
  availableLiquidity: number;
  contributions: Contribution[];
  loans: LoanRequest[];
  halalProjects: HalalProject[];
  polls: DecisionPoll[];
  meetings: CoopMeeting[];
  profileChangeRequests: ProfileChangeRequest[];
  requestedTab?: { tab: ManagerDeskTab; key: number } | null;
  onViewMemberProfile?: (memberId: string) => void;
  onOpenManagerCycle?: () => void;
  onRefresh: () => Promise<void>;
}

export function ManagerDeskView({
  user,
  config,
  treasury = null,
  loading = false,
  availableLiquidity,
  contributions,
  loans,
  halalProjects,
  polls,
  meetings,
  profileChangeRequests,
  requestedTab = null,
  onViewMemberProfile,
  onOpenManagerCycle,
  onRefresh,
}: ManagerDeskViewProps) {
  const ccy = config?.currency || 'BDT';
  const [activeTab, setActiveTab] = useState<ManagerDeskTab>(
    requestedTab?.tab || 'contributions'
  );
  const hasUserSelectedTabRef = useRef(Boolean(requestedTab));
  const [contribSearch, setContribSearch] = useState('');
  const [modal, setModal] = useState<DeskModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  useEffect(() => {
    if (requestedTab?.tab) {
      setActiveTab(requestedTab.tab);
      hasUserSelectedTabRef.current = true;
    }
  }, [requestedTab]);

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
  const filteredPendingContributions = pendingContributions.filter((c) => {
    const q = contribSearch.trim().toLowerCase();
    if (!q) return true;
    const txNo = (c.decryptedDetails?.referenceId || c.maskedReference).toLowerCase();
    return (
      c.memberName.toLowerCase().includes(q) ||
      c.memberCode.toLowerCase().includes(q) ||
      c.providerName.toLowerCase().includes(q) ||
      txNo.includes(q) ||
      c.billingMonth.includes(q)
    );
  });

  const pendingGuarantorLoans = loans.filter((l) => l.status === 'pending_guarantor');
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
  const scheduledMeetings = meetings.filter((m) => m.status === 'scheduled');

  const qardHasanActionCount =
    pendingReviewLoans.length +
    pendingDisbursementLoans.length +
    votingLoans.length +
    pendingGuarantorLoans.length;
  const ballotsCount = votingLoans.length + openPolls.length + openProjects.length;
  const meetingsProfilesCount = scheduledMeetings.length + pendingProfileRequests.length;

  useEffect(() => {
    if (loading || hasUserSelectedTabRef.current) return;
    if (pendingContributions.length > 0) return;
    if (qardHasanActionCount > 0) {
      setActiveTab('qard-hasan');
    } else if (pendingInstallments.length > 0) {
      setActiveTab('installments');
    } else if (ballotsCount > 0) {
      setActiveTab('ballots');
    } else if (meetingsProfilesCount > 0) {
      setActiveTab('meetings-profiles');
    }
  }, [
    loading,
    pendingContributions.length,
    qardHasanActionCount,
    pendingInstallments.length,
    ballotsCount,
    meetingsProfilesCount,
  ]);

  function showNotice(
    tone: 'emerald' | 'amber' | 'red' | 'slate',
    title: string,
    description: string,
    details?: ActionModalDetailItem[]
  ) {
    setModal({ mode: 'notice', tone, title, description, details });
  }

  async function runConfirmedModal(inputValue: string) {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
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

  function confirmContributionDecision(c: Contribution, decision: 'approved' | 'rejected') {
    const txNo = c.decryptedDetails?.referenceId || c.maskedReference;
    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: `Approve Contribution (${c.memberName})`,
        description:
          'Approving verifies the Transaction Number and adds this deposit immediately to the central fund balance.',
        details: [
          { label: 'Member', value: `${c.memberName} (${c.memberCode})` },
          { label: 'Billing Month', value: formatBillingMonth(c.billingMonth) },
          { label: 'Amount', value: formatMoney(c.amount, ccy) },
          { label: 'Channel & Bank/MFS', value: `${c.channel.toUpperCase()} · ${c.providerName}` },
          { label: 'Transaction Number', value: txNo },
          { label: 'Sender Account', value: c.decryptedDetails?.senderAccount || '—' },
        ],
        inputLabel: 'Optional Verification Remark',
        inputPlaceholder: 'Verified against treasury statement…',
        inputRequired: false,
        confirmLabel: 'Approve & Credit Balance',
        run: async (note) => {
          await api.reviewContribution(c.id, 'approved', note || undefined);
          await onRefresh();
          showNotice(
            'emerald',
            'Contribution Approved',
            `${formatMoney(c.amount, ccy)} from ${c.memberName} (Tx #${txNo}) has been credited to the cooperative fund balance.`
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Deny Contribution (${c.memberName})`,
        description:
          'Enter a clear correction message so the member knows what to fix before resubmitting.',
        details: [
          { label: 'Member', value: `${c.memberName} (${c.memberCode})` },
          { label: 'Amount', value: formatMoney(c.amount, ccy) },
          { label: 'Transaction Number', value: txNo },
        ],
        inputLabel: 'Mandatory Correction Note',
        inputPlaceholder: 'e.g. Transaction Number did not appear on bank statement…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Deny & Notify Member',
        run: async (note) => {
          await api.reviewContribution(c.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            'Contribution Denied',
            `Correction message sent to ${c.memberName} (${c.memberCode}).`
          );
        },
      });
    }
  }

  function confirmInitiateLoanVote(loan: LoanRequest) {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Initiate 2/3 Secret Ballot (${loan.id})`,
      description:
        'Opening the Opinion Ballot notifies all eligible members to vote privately. Set how long voting stays open — members may change their ballot until the deadline. Results stay sealed until you reveal them.',
      details: [
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Principal', value: formatMoney(loan.amount, ccy) },
        { label: 'Repayment Plan', value: `${loan.installmentMonths} months · 0% interest` },
        { label: 'Purpose', value: loan.purpose },
      ],
      inputLabel: 'Voting window (hours)',
      inputPlaceholder: 'e.g. 48',
      inputRequired: true,
      initialInputValue: '48',
      confirmLabel: 'Open Secret 2/3 Ballot',
      run: async (hoursInput) => {
        const hours = Math.min(720, Math.max(1, Math.round(Number(hoursInput) || 48)));
        await api.initiateLoanVote(loan.id, { durationHours: hours });
        await onRefresh();
        showNotice(
          'emerald',
          'Opinion Ballot Opened',
          `Secret voting is live for ${loan.id} for ${hours} hours. Members can change votes until the deadline.`
        );
      },
    });
  }

  function confirmDeclineLoanReview(loan: LoanRequest) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: `Decline Qard Hasan Application (${loan.id})`,
      description:
        'Declining stops this request during Manager pre-vote review and notifies the borrower with your note.',
      details: [
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Requested Amount', value: formatMoney(loan.amount, ccy) },
      ],
      inputLabel: 'Reason for Declining',
      inputPlaceholder: 'Explain why this request was declined…',
      inputRequired: true,
      inputMultiline: true,
      confirmLabel: 'Decline Request',
      run: async (note) => {
        await api.adminReviewLoan(loan.id, 'reject', note);
        await onRefresh();
        showNotice(
          'amber',
          'Qard Hasan Request Declined',
          `Application ${loan.id} was declined and ${loan.borrowerName} has been notified.`
        );
      },
    });
  }

  function confirmDisbursement(loan: LoanRequest) {
    const insufficient = loan.amount > availableLiquidity;
    setModal({
      mode: 'confirm',
      tone: insufficient ? 'amber' : 'emerald',
      title: `Confirm Qard Hasan Disbursement (${loan.id})`,
      description: insufficient
        ? `Warning: Requested amount (${formatMoney(loan.amount, ccy)}) exceeds current available balance (${formatMoney(availableLiquidity, ccy)}). Confirming will verify if treasury allows payout.`
        : `Disbursing transfers ${formatMoney(loan.amount, ccy)} to the borrower's encrypted account and immediately deducts it from the central fund balance.`,
      details: [
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Disbursement Amount', value: formatMoney(loan.amount, ccy) },
        { label: 'Current Fund Balance', value: formatMoney(availableLiquidity, ccy) },
        {
          label: 'Payout Destination',
          value: loan.decryptedSensitiveNotes
            ? `${loan.decryptedSensitiveNotes.channel.toUpperCase()} · ${loan.decryptedSensitiveNotes.provider} (${loan.decryptedSensitiveNotes.disbursementAccount})`
            : 'Encrypted Bank / MFS Payout',
        },
      ],
      inputLabel: 'Disbursement Transaction Number (TrxID / Bank Ref)',
      inputPlaceholder: 'Enter bank reference or MFS TrxID for audit ledger…',
      inputRequired: false,
      confirmLabel: 'Confirm Disbursement & Deduct Balance',
      run: async (txNo) => {
        await api.disburseLoan(loan.id, txNo ? { transactionNumber: txNo } : undefined);
        await onRefresh();
        showNotice(
          'emerald',
          'Qard Hasan Disbursed',
          `${formatMoney(loan.amount, ccy)} deducted from central fund balance for ${loan.id}${txNo ? ` (Tx #${txNo})` : ''}. Borrower notified.`
        );
      },
    });
  }

  function confirmInstallmentDecision(
    loan: LoanRequest,
    installmentNumber: number,
    decision: 'approve' | 'reject'
  ) {
    const inst = loan.installments.find((i) => i.installmentNumber === installmentNumber);
    const txNo = inst?.decryptedReceipt?.referenceId || inst?.maskedReference || '—';
    if (decision === 'approve') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: `Accept Installment #${installmentNumber} (${loan.id})`,
        description:
          'Accepting verifies the repayment Transaction Number, lowers the borrower’s remaining balance, and restores funds to treasury liquidity.',
        details: [
          { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: 'Installment Amount', value: formatMoney(inst?.amount || 0, ccy) },
          { label: 'Provider', value: inst?.repaymentProvider || '—' },
          { label: 'Transaction Number', value: txNo },
        ],
        confirmLabel: 'Accept & Restore Balance',
        run: async () => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'approve');
          await onRefresh();
          showNotice(
            'emerald',
            'Installment Accepted',
            `Installment #${installmentNumber} for ${loan.id} (Tx #${txNo}) verified and restored to fund balance.`
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Deny Installment #${installmentNumber} (${loan.id})`,
        description:
          'Provide a required correction note explaining what the borrower must fix before resubmitting.',
        details: [
          { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: 'Transaction Number', value: txNo },
        ],
        inputLabel: 'Mandatory Correction Note',
        inputPlaceholder: 'e.g. TrxID not received or amount mismatch…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Deny & Send Correction Note',
        run: async (note) => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'reject', note);
          await onRefresh();
          showNotice(
            'amber',
            'Installment Denied',
            `Correction note sent to ${loan.borrowerName} for Installment #${installmentNumber}.`
          );
        },
      });
    }
  }

  function confirmRevealBallot(
    type: 'loan' | 'poll' | 'project',
    id: string,
    title: string,
    castCount: number
  ) {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: 'Stop Voting & Reveal Results?',
      description:
        'Stopping the ballot closes voting permanently and publishes the aggregate tally to all cooperative members.',
      details: [
        { label: 'Ballot Item', value: title },
        { label: 'Secret Ballots Cast', value: String(castCount) },
      ],
      confirmLabel: 'Stop & Reveal Result',
      run: async () => {
        if (type === 'loan') await api.revealLoanVote(id);
        else if (type === 'poll') await api.revealPoll(id);
        else await api.revealHalalProjectVote(id);
        await onRefresh();
        showNotice(
          'emerald',
          'Vote Result Revealed',
          `Voting has closed for "${title}". Final results are now visible to all members.`
        );
      },
    });
  }

  function handleCreatePoll(e: FormEvent) {
    e.preventDefault();
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) {
      showNotice('red', 'Invalid Poll Options', 'Please provide at least 2 distinct poll options.');
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Launch Secret Decision Vote?',
      description:
        'Publishing opens an anonymized ballot and dispatches notifications to all active members.',
      details: [
        { label: 'Question / Title', value: pollTitle.trim() },
        { label: 'Category', value: pollCategory },
        { label: 'Options', value: cleanedOptions.join(' · ') },
      ],
      confirmLabel: 'Launch Decision Vote',
      run: async () => {
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
        await onRefresh();
        showNotice(
          'emerald',
          'Decision Poll Opened',
          'Members have been notified and can now cast their secret ballots in Opinion Ballot.'
        );
      },
    });
  }

  function handleScheduleMeeting(e: FormEvent) {
    e.preventDefault();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Schedule Cooperative Meeting?',
      description:
        'Scheduling creates a meeting notice on member dashboards and notifications.',
      details: [
        { label: 'Title', value: meetingTitle.trim() },
        { label: 'Date & Time', value: formatDateTime(meetingWhen.trim()) },
        { label: 'Location / Link', value: meetingWhere.trim() },
      ],
      confirmLabel: 'Schedule & Notify Members',
      run: async () => {
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
        await onRefresh();
        showNotice(
          'emerald',
          'Meeting Scheduled',
          'Cooperative meeting notice dispatched to all active members.'
        );
      },
    });
  }

  function confirmMeetingStatus(m: CoopMeeting, status: CoopMeeting['status']) {
    setModal({
      mode: 'confirm',
      tone: status === 'cancelled' ? 'red' : 'emerald',
      title:
        status === 'completed'
          ? `Mark Meeting Completed?`
          : `Cancel Scheduled Meeting?`,
      description: `Update status of "${m.title}" (${formatDateTime(m.scheduledFor)}).`,
      confirmLabel: status === 'completed' ? 'Mark Completed' : 'Cancel Meeting',
      run: async () => {
        await api.updateMeetingStatus(m.id, status);
        await onRefresh();
        showNotice(
          status === 'completed' ? 'emerald' : 'amber',
          'Meeting Status Updated',
          `"${m.title}" marked as ${status}.`
        );
      },
    });
  }

  function confirmProfileReqReview(req: ProfileChangeRequest, decision: 'approved' | 'rejected') {
    const changesSummary = Object.entries(req.requestedChanges)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' | ');

    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: `Approve Profile Update (${req.memberName})`,
        description: 'Applying immediately updates the member’s profile record.',
        details: [
          { label: 'Member', value: `${req.memberName} (${req.memberCode})` },
          { label: 'Requested Changes', value: changesSummary || 'Profile update' },
        ],
        confirmLabel: 'Approve Profile Update',
        run: async () => {
          await api.reviewProfileChangeRequest(req.id, 'approved');
          await onRefresh();
          showNotice(
            'emerald',
            'Profile Update Approved',
            `${req.memberName}'s profile changes have been applied.`
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Decline Profile Update (${req.memberName})`,
        description: 'Provide a reason explaining why this profile modification request is declined.',
        details: [
          { label: 'Member', value: `${req.memberName} (${req.memberCode})` },
          { label: 'Requested Changes', value: changesSummary || 'Profile update' },
        ],
        inputLabel: 'Reason for Declining',
        inputPlaceholder: 'Explain why this update could not be approved…',
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: 'Decline Request',
        run: async (note) => {
          await api.reviewProfileChangeRequest(req.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            'Profile Update Declined',
            `Declined profile modification request from ${req.memberName}.`
          );
        },
      });
    }
  }

  const tabs: Array<{
    id: ManagerDeskTab;
    label: string;
    count: number;
    Icon: typeof CreditCard;
    activeClass: string;
    activeTextClass: string;
    activeIconClass: string;
    hoverClass: string;
  }> = [
    {
      id: 'contributions',
      label: 'Contributions',
      count: pendingContributions.length,
      Icon: CreditCard,
      activeClass: 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/35 shadow-xs',
      activeTextClass: 'text-emerald-800 dark:text-emerald-300',
      activeIconClass: 'text-emerald-600 dark:text-emerald-400',
      hoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    {
      id: 'qard-hasan',
      label: 'Qard Hasan',
      count: qardHasanActionCount,
      Icon: HandCoins,
      activeClass: 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/35 shadow-xs',
      activeTextClass: 'text-teal-800 dark:text-teal-300',
      activeIconClass: 'text-teal-600 dark:text-teal-400',
      hoverClass: 'hover:border-teal-300 dark:hover:border-teal-800',
    },
    {
      id: 'installments',
      label: 'Installments',
      count: pendingInstallments.length,
      Icon: ShieldCheck,
      activeClass: 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/35 shadow-xs',
      activeTextClass: 'text-indigo-800 dark:text-indigo-300',
      activeIconClass: 'text-indigo-600 dark:text-indigo-400',
      hoverClass: 'hover:border-indigo-300 dark:hover:border-indigo-800',
    },
    {
      id: 'ballots',
      label: 'Votes & Reveals',
      count: ballotsCount,
      Icon: Vote,
      activeClass: 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/35 shadow-xs',
      activeTextClass: 'text-amber-800 dark:text-amber-300',
      activeIconClass: 'text-amber-600 dark:text-amber-400',
      hoverClass: 'hover:border-amber-300 dark:hover:border-amber-800',
    },
    {
      id: 'meetings-profiles',
      label: 'Meetings & Profiles',
      count: meetingsProfilesCount,
      Icon: CalendarPlus,
      activeClass: 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/35 shadow-xs',
      activeTextClass: 'text-indigo-800 dark:text-indigo-300',
      activeIconClass: 'text-indigo-600 dark:text-indigo-400',
      hoverClass: 'hover:border-indigo-300 dark:hover:border-indigo-800',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Manager Desk Header + Interactive Queue KPI Cards */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Manager Governance &amp; Treasury Verification Desk</span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              Approvals, Qard Hasan Workflow, Secret Ballots &amp; Cooperative Notices
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenManagerCycle && (
              <button
                type="button"
                onClick={onOpenManagerCycle}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-teal-50/70 dark:hover:bg-teal-950/30 hover:border-teal-300 dark:hover:border-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <CalendarClock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>Rotation Timeline</span>
              </button>
            )}
            <div className="text-xs font-mono tabular-nums px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/35 dark:to-teal-950/35 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300">
              Available Fund Balance: {formatMoney(availableLiquidity, ccy)}
            </div>
          </div>
        </div>

        {/* Clickable Queue Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  hasUserSelectedTabRef.current = true;
                  setActiveTab(tab.id);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer active:scale-[0.99] ${
                  active
                    ? tab.activeClass
                    : `border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 ${tab.hoverClass}`
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-medium truncate ${
                      active ? tab.activeTextClass : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </span>
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? tab.activeIconClass : 'text-slate-400 dark:text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {loading ? <Skeleton width={32} height={24} /> : tab.count}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <AnimatePresence mode="wait">
      {/* TAB 1: Pending Monthly Contributions */}
      {activeTab === 'contributions' && (
        <motion.section
          key="tab-contributions"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Pending Monthly Contributions ({pendingContributions.length})
              </h3>
            </div>
            <div className="relative w-full sm:w-64">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={contribSearch}
                onChange={(e) => setContribSearch(e.target.value)}
                placeholder="Search member, bank, Tx#…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <Skeleton width={260} height={14} />
                    <Skeleton width={340} height={12} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton width={90} height={32} borderRadius={8} />
                    <Skeleton width={116} height={32} borderRadius={8} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPendingContributions.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-center text-slate-500 dark:text-slate-400">
              {pendingContributions.length === 0
                ? 'All submitted contributions have been processed.'
                : 'No pending contributions match your search.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {filteredPendingContributions.map((c) => {
                const txNo = c.decryptedDetails?.referenceId || c.maskedReference;
                return (
                  <div
                    key={c.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-emerald-50/20 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="space-y-1 text-xs min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                        {onViewMemberProfile ? (
                          <button
                            type="button"
                            onClick={() => onViewMemberProfile(c.userId)}
                            className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                          >
                            {c.memberName}
                          </button>
                        ) : (
                          <span>{c.memberName}</span>
                        )}
                        <span className="font-mono text-slate-500 dark:text-slate-400">({c.memberCode})</span>
                        <span>·</span>
                        <span className="font-mono text-emerald-700 dark:text-emerald-400">
                          {formatMoney(c.amount, ccy)}
                        </span>
                        <span>·</span>
                        <span className="font-mono text-indigo-700 dark:text-indigo-400">
                          {formatBillingMonth(c.billingMonth)}
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 font-mono">
                        {c.channel.toUpperCase()} · {c.providerName} · Tx #{txNo} · Sender:{' '}
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
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                        >
                          <span>Inspect Attached Receipt Slip</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {user.role === 'admin' || c.userId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmContributionDecision(c, 'approved')}
                            className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-all active:scale-[0.98]"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmContributionDecision(c, 'rejected')}
                            className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-all active:scale-[0.98]"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Deny with Note</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30">
                          Peer / Admin Review Required
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      )}

      {/* TAB 2: Qard Hasan 3-Stage Workflow */}
      {activeTab === 'qard-hasan' && (
        <motion.div
          key="tab-qard-hasan"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="space-y-6"
        >
          {/* Stage 1: Awaiting Vote Initiation */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Stage 1 · Applications Awaiting Vote Initiation ({pendingReviewLoans.length})
              </h3>
            </div>

            {pendingReviewLoans.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No Qard Hasan requests awaiting vote initiation.
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
                        )}{' '}
                        ({loan.borrowerCode}) ·{' '}
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span> (
                        {loan.installmentMonths} months)
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{loan.purpose}</p>
                      {loan.decryptedSensitiveNotes && (
                        <div className="font-mono text-slate-500 dark:text-slate-400">
                          Payout: {loan.decryptedSensitiveNotes.channel.toUpperCase()} ·{' '}
                          {loan.decryptedSensitiveNotes.provider} ·{' '}
                          {loan.decryptedSensitiveNotes.disbursementAccount}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmInitiateLoanVote(loan)}
                            className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <Vote className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Initiate 2/3 Vote</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmDeclineLoanReview(loan)}
                            className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30">
                          Submitted by you · Another Manager or Admin must initiate 2/3 vote
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {pendingGuarantorLoans.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-amber-200/90 dark:border-amber-900/60 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Awaiting Guarantor Co-Signature ({pendingGuarantorLoans.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {pendingGuarantorLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-amber-50/35 dark:bg-amber-950/15"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {loan.id}
                        </span>
                        <StatusText status={loan.status} />
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-white text-sm">
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
                        )}{' '}
                        ({loan.borrowerCode}) ·{' '}
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span> (
                        {loan.installmentMonths} months)
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{loan.purpose}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>Guarantors:</span>
                        {(loan.guarantors || []).map((g) => (
                          <span
                            key={g.memberId}
                            className={`px-2 py-0.5 rounded border ${
                              g.status === 'accepted'
                                ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30'
                                : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30'
                            }`}
                          >
                            {g.memberName} ({g.memberCode}): {g.status}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-white/80 dark:bg-slate-900/80 shrink-0">
                      Waiting on Guarantor Co-Sign
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Stage 2: Ongoing Ballots */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Stage 2 · Ongoing Secret Qard Hasan Ballots ({votingLoans.length})
              </h3>
            </div>

            {votingLoans.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No Qard Hasan applications currently in active voting.
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
                        {loan.id} ·{' '}
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
                        )}{' '}
                        ({loan.borrowerCode}) ·{' '}
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        Poll Ongoing · {loan.totalVotesCast ?? loan.votes.length} of{' '}
                        {loan.totalEligibleVoters} ballot(s) cast secretly
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'loan',
                          loan.id,
                          `Qard Hasan ${loan.id} (${loan.borrowerName})`,
                          loan.totalVotesCast ?? loan.votes.length
                        )
                      }
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

          {/* Stage 3: Approved Awaiting Disbursement Confirmation */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Stage 3 · Approved &amp; Awaiting Disbursement ({pendingDisbursementLoans.length})
              </h3>
            </div>

            {pendingDisbursementLoans.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No approved Qard Hasan loans waiting for disbursement confirmation.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {pendingDisbursementLoans.map((loan) => {
                  const shortLiquidity = loan.amount > availableLiquidity;
                  return (
                    <div
                      key={loan.id}
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-emerald-50/30 dark:bg-emerald-950/10"
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {loan.id}
                          </span>
                          <StatusText status={loan.status} />
                          {shortLiquidity && (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Exceeds current balance</span>
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
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
                          )}{' '}
                          ({loan.borrowerCode}) ·{' '}
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
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <button
                          type="button"
                          disabled={modalBusy}
                          onClick={() => confirmDisbursement(loan)}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Confirm Disbursement &amp; Deduct Balance</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 shrink-0">
                          Submitted by you · Another Manager or Admin must confirm payout
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </motion.div>
      )}

      {/* TAB 3: Pending Hasan Installments */}
      {activeTab === 'installments' && (
        <motion.section
          key="tab-installments"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Qard Hasan Installment Verification Queue ({pendingInstallments.length})
            </h3>
          </div>

          {pendingInstallments.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-center text-slate-500 dark:text-slate-400">
              No Qard Hasan installment receipts awaiting verification.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {pendingInstallments.map(({ loan, inst }) => {
                const key = `${loan.id}#${inst.installmentNumber}`;
                const txNo = inst.decryptedReceipt?.referenceId || inst.maskedReference;
                return (
                  <div
                    key={key}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold text-slate-900 dark:text-white">
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
                        )}{' '}
                        ({loan.borrowerCode}) · {loan.id} Installment #{inst.installmentNumber} ·{' '}
                        <span className="font-mono text-emerald-700 dark:text-emerald-400">
                          {formatMoney(inst.amount, ccy)}
                        </span>
                      </div>
                      <div className="font-mono text-slate-600 dark:text-slate-400">
                        {inst.repaymentChannel?.toUpperCase()} · {inst.repaymentProvider} · Tx #{txNo}
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

                    <div className="flex items-center gap-2 shrink-0">
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() =>
                              confirmInstallmentDecision(loan, inst.installmentNumber, 'approve')
                            }
                            className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() =>
                              confirmInstallmentDecision(loan, inst.installmentNumber, 'reject')
                            }
                            className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Deny with Note</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30">
                          Peer / Admin Review Required
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      )}

      {/* TAB 4: Decision Polls & Secret Ballots */}
      {activeTab === 'ballots' && (
        <motion.div
          key="tab-ballots"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
                        className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
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
                disabled={modalBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 transition-all active:scale-[0.99]"
              >
                Review &amp; Launch Decision Vote
              </button>
            </form>
          </section>

          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Ongoing Secret Ballots ({ballotsCount})
              </h3>
            </div>

            {ballotsCount === 0 ? (
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
                        Poll Ongoing · {loan.totalVotesCast ?? loan.votes.length} ballot(s) cast (secret until revealed)
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'loan',
                          loan.id,
                          `Qard Hasan ${loan.id}`,
                          loan.totalVotesCast ?? loan.votes.length
                        )
                      }
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
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'poll',
                          poll.id,
                          poll.title,
                          poll.totalVotesCast ?? poll.votes.length
                        )
                      }
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
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'project',
                          proj.id,
                          proj.title,
                          proj.totalVotesCast ?? proj.votes.length
                        )
                      }
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
        </motion.div>
      )}

      {/* TAB 5: Meetings & Profile Change Requests */}
      {activeTab === 'meetings-profiles' && (
        <motion.div
          key="tab-meetings-profiles"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
          <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
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
                disabled={modalBusy}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                Schedule Meeting &amp; Notify All Members
              </button>
            </form>

            {meetings.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scheduled Meetings ({meetings.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                  {meetings.slice(0, 8).map((m) => (
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
                            disabled={modalBusy}
                            onClick={() => confirmMeetingStatus(m, 'completed')}
                            className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmMeetingStatus(m, 'cancelled')}
                            className="px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
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

          <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
                        {onViewMemberProfile ? (
                          <button
                            type="button"
                            onClick={() => onViewMemberProfile(req.userId)}
                            className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                          >
                            {req.memberName}
                          </button>
                        ) : (
                          req.memberName
                        )}{' '}
                        ({req.memberCode}) ·{' '}
                        <span className="capitalize font-normal text-slate-500 dark:text-slate-400">
                          {req.memberRole}
                        </span>
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {formatShortDate(req.requestedAt)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 font-mono text-[11px] space-y-0.5 text-slate-700 dark:text-slate-300">
                      {Object.entries(req.requestedChanges).map(([k, v]) =>
                        v ? (
                          <div key={k}>
                            <span className="text-slate-500 dark:text-slate-400">{k}:</span> {String(v)}
                          </div>
                        ) : null
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={modalBusy}
                        onClick={() => confirmProfileReqReview(req, 'approved')}
                        className="px-3 py-1.5 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={modalBusy}
                        onClick={() => confirmProfileReqReview(req, 'rejected')}
                        className="px-3 py-1.5 rounded border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
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
        </motion.div>
      )}
      </AnimatePresence>

      {/* Manager Oversight: Monthly Collection Progress vs Goals + Member Audit Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 flex flex-col [&>section]:flex-1">
          <ManagerCollectionGoalChart
            contributions={contributions}
            config={config}
            treasury={treasury}
            loading={loading}
          />
        </div>
        <div className="xl:col-span-5 flex flex-col [&>section]:flex-1">
          <MemberAuditLogWidget onViewMemberProfile={onViewMemberProfile} />
        </div>
      </div>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        inputMultiline={modal?.mode === 'confirm' ? modal.inputMultiline : false}
        initialInputValue={modal?.mode === 'confirm' ? modal.initialInputValue || '' : ''}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
