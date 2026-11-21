'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  Sparkles,
  Trash2,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import type {
  CommunityPost,
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
import { formatProfileChangeEntries } from '../utils/profileChanges.ts';
import { useTranslations } from 'next-intl';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { ManagerCollectionGoalChart } from './ManagerCollectionGoalChart.tsx';
import { MemberAuditLogWidget } from './MemberAuditLogWidget.tsx';
import { ProfileChangeDiffPreview } from './ProfileChangeDiffPreview.tsx';
import { StatusText } from './StatusText.tsx';

export type ManagerDeskTab =
  | 'contributions'
  | 'qard-hasan'
  | 'installments'
  | 'ballots'
  | 'meetings-profiles'
  | 'community-drafts';

type DeskModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      customContent?: ReactNode;
      maxWidthClass?: string;
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
    }
  | {
      mode: 'loan-approved-post';
      loan: LoanRequest;
      title: string;
      content: string;
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
  const t = useTranslations('ManagerDesk');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const tStatuses = useTranslations('Status');
  const ccy = config?.currency || 'BDT';
  const roleLabel = (role: string) => (tRoles.has(role) ? tRoles(role) : role);
  const statusLabel = (status: string) =>
    tStatuses.has(status) ? tStatuses(status) : status.replace(/_/g, ' ');
  const pollCategoryLabel = (cat: DecisionPoll['category']) => {
    switch (cat) {
      case 'policy':
        return t('pollCategoryPolicy');
      case 'project':
        return t('pollCategoryProject');
      case 'qard_hasan':
        return t('pollCategoryQardHasan');
      default:
        return t('pollCategoryGeneral');
    }
  };
  const [activeTab, setActiveTab] = useState<ManagerDeskTab>(
    requestedTab?.tab || 'contributions'
  );
  const hasUserSelectedTabRef = useRef(Boolean(requestedTab));
  const [contribSearch, setContribSearch] = useState('');
  const [modal, setModal] = useState<DeskModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [communityDrafts, setCommunityDrafts] = useState<CommunityPost[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'community-drafts') return;
    let cancelled = false;
    setDraftsLoading(true);
    api
      .getCommunityDrafts()
      .then((res) => {
        if (!cancelled) setCommunityDrafts(res.posts || []);
      })
      .catch(() => {
        if (!cancelled) setCommunityDrafts([]);
      })
      .finally(() => {
        if (!cancelled) setDraftsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

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
  const [pollOptions, setPollOptions] = useState<string[]>(() => [
    t('defaultOptionApprove'),
    t('defaultOptionDecline'),
  ]);
  const [pollClosesAt, setPollClosesAt] = useState('');

  // Schedule Meeting state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingWhen, setMeetingWhen] = useState('');
  const [meetingWhere, setMeetingWhere] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [rewritingMeeting, setRewritingMeeting] = useState(false);

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
  const pendingProfileRequests =
    user.role === 'admin'
      ? profileChangeRequests.filter((r) => r.status === 'pending')
      : [];
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
        t('actionFailedTitle'),
        err instanceof Error ? err.message : t('unexpectedError')
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
        title: t('approveContribTitle', { name: c.memberName }),
        description: t('approveContribDesc'),
        details: [
          { label: t('member'), value: `${c.memberName} (${c.memberCode})` },
          { label: t('billingMonth'), value: formatBillingMonth(c.billingMonth) },
          { label: t('amount'), value: formatMoney(c.amount, ccy) },
          { label: t('channelProvider'), value: `${c.channel.toUpperCase()} · ${c.providerName}` },
          { label: t('txNumber'), value: txNo },
          { label: t('senderAccount'), value: c.decryptedDetails?.senderAccount || '—' },
        ],
        inputLabel: t('optionalRemarkLabel'),
        inputPlaceholder: t('optionalRemarkPlaceholder'),
        inputRequired: false,
        confirmLabel: t('approveCreditBtn'),
        run: async (note) => {
          await api.reviewContribution(c.id, 'approved', note || undefined);
          await onRefresh();
          showNotice(
            'emerald',
            t('contribApprovedTitle'),
            t('contribApprovedDesc', {
              amount: formatMoney(c.amount, ccy),
              name: c.memberName,
              txNo,
            })
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: t('denyContribTitle', { name: c.memberName }),
        description: t('denyContribDesc'),
        details: [
          { label: t('member'), value: `${c.memberName} (${c.memberCode})` },
          { label: t('amount'), value: formatMoney(c.amount, ccy) },
          { label: t('txNumber'), value: txNo },
        ],
        inputLabel: t('mandatoryNoteLabel'),
        inputPlaceholder: t('denyContribNotePlaceholder'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('denyNotifyBtn'),
        run: async (note) => {
          await api.reviewContribution(c.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            t('contribDeniedTitle'),
            t('contribDeniedDesc', { name: c.memberName, code: c.memberCode })
          );
        },
      });
    }
  }

  function confirmInitiateLoanVote(loan: LoanRequest) {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('initiateVoteTitle', { id: loan.id }),
      description: t('initiateVoteDesc'),
      details: [
        { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('principal'), value: formatMoney(loan.amount, ccy) },
        {
          label: t('repaymentPlan'),
          value: t('repaymentPlanValue', { months: loan.installmentMonths }),
        },
        { label: t('purpose'), value: loan.purpose },
      ],
      inputLabel: t('votingWindowLabel'),
      inputPlaceholder: t('votingWindowPlaceholder'),
      inputRequired: true,
      initialInputValue: '48',
      confirmLabel: t('openSecretBallotBtn'),
      run: async (hoursInput) => {
        const hours = Math.min(720, Math.max(1, Math.round(Number(hoursInput) || 48)));
        await api.initiateLoanVote(loan.id, { durationHours: hours });
        await onRefresh();
        showNotice(
          'emerald',
          t('votingOpenedTitle'),
          t('votingOpenedDesc', { id: loan.id, hours })
        );
      },
    });
  }

  function confirmDeclineLoanReview(loan: LoanRequest) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('declineLoanTitle', { id: loan.id }),
      description: t('declineLoanDesc'),
      details: [
        { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('requestedAmount'), value: formatMoney(loan.amount, ccy) },
      ],
      inputLabel: t('reasonDecliningLabel'),
      inputPlaceholder: t('reasonDecliningLoanPlaceholder'),
      inputRequired: true,
      inputMultiline: true,
      confirmLabel: t('declineRequestBtn'),
      run: async (note) => {
        await api.adminReviewLoan(loan.id, 'reject', note);
        await onRefresh();
        showNotice(
          'amber',
          t('loanDeclinedTitle'),
          t('loanDeclinedDesc', { id: loan.id, name: loan.borrowerName })
        );
      },
    });
  }

  function confirmDisbursement(loan: LoanRequest) {
    const insufficient = loan.amount > availableLiquidity;
    setModal({
      mode: 'confirm',
      tone: insufficient ? 'amber' : 'emerald',
      title: t('disburseTitle', { id: loan.id }),
      description: insufficient
        ? t('disburseWarnDesc', {
            amount: formatMoney(loan.amount, ccy),
            balance: formatMoney(availableLiquidity, ccy),
          })
        : t('disburseOkDesc', { amount: formatMoney(loan.amount, ccy) }),
      details: [
        { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('disbursementAmount'), value: formatMoney(loan.amount, ccy) },
        { label: t('currentFundBalance'), value: formatMoney(availableLiquidity, ccy) },
        {
          label: t('payoutDestination'),
          value: loan.decryptedSensitiveNotes
            ? `${loan.decryptedSensitiveNotes.channel.toUpperCase()} · ${loan.decryptedSensitiveNotes.provider} (${loan.decryptedSensitiveNotes.disbursementAccount})`
            : t('encryptedPayoutFallback'),
        },
      ],
      inputLabel: t('disburseTxLabel'),
      inputPlaceholder: t('disburseTxPlaceholder'),
      inputRequired: false,
      confirmLabel: t('confirmDisburseBtn'),
      run: async (txNo) => {
        await api.disburseLoan(loan.id, txNo ? { transactionNumber: txNo } : undefined);
        await onRefresh();
        showNotice(
          'emerald',
          t('loanDisbursedTitle'),
          t('loanDisbursedDesc', {
            amount: formatMoney(loan.amount, ccy),
            id: loan.id,
            txPart: txNo ? ` (Tx #${txNo})` : '',
          })
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
        title: t('acceptInstTitle', { num: installmentNumber, id: loan.id }),
        description: t('acceptInstDesc'),
        details: [
          { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: t('installmentAmount'), value: formatMoney(inst?.amount || 0, ccy) },
          { label: t('provider'), value: inst?.repaymentProvider || '—' },
          { label: t('txNumber'), value: txNo },
        ],
        confirmLabel: t('acceptRestoreBtn'),
        run: async () => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'approve');
          await onRefresh();
          showNotice(
            'emerald',
            t('instAcceptedTitle'),
            t('instAcceptedDesc', { num: installmentNumber, id: loan.id, txNo })
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: t('denyInstTitle', { num: installmentNumber, id: loan.id }),
        description: t('denyInstDesc'),
        details: [
          { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: t('txNumber'), value: txNo },
        ],
        inputLabel: t('mandatoryNoteLabel'),
        inputPlaceholder: t('denyInstPlaceholder'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('denySendNoteBtn'),
        run: async (note) => {
          await api.verifyInstallmentRepayment(loan.id, installmentNumber, 'reject', note);
          await onRefresh();
          showNotice(
            'amber',
            t('instDeniedTitle'),
            t('instDeniedDesc', { name: loan.borrowerName, num: installmentNumber })
          );
        },
      });
    }
  }

  function buildLoanApprovalPost(loan: LoanRequest): { title: string; content: string } {
    const amount = formatMoney(loan.amount, ccy);
    const title = t('loanPostTitle', { name: loan.borrowerName, id: loan.id });
    const content = t('loanPostContent', {
      name: loan.borrowerName,
      code: loan.borrowerCode,
      amount,
      months: loan.installmentMonths,
      purpose: loan.purpose,
    });
    return { title, content };
  }

  function openLoanApprovedPostModal(loan: LoanRequest) {
    const { title, content } = buildLoanApprovalPost(loan);
    setModal({
      mode: 'loan-approved-post',
      loan,
      title,
      content,
    });
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
      title: t('revealBallotTitle'),
      description: t('revealBallotDesc'),
      details: [
        { label: t('ballotItem'), value: title },
        { label: t('secretBallotsCast'), value: String(castCount) },
      ],
      confirmLabel: t('stopRevealBtn'),
      run: async () => {
        if (type === 'loan') {
          const prior = loans.find((l) => l.id === id);
          await api.revealLoanVote(id);
          await onRefresh();
          if (prior) {
            openLoanApprovedPostModal(prior);
            return;
          }
        } else if (type === 'poll') {
          await api.revealPoll(id);
        } else {
          await api.revealHalalProjectVote(id);
        }
        await onRefresh();
        showNotice('emerald', t('voteRevealedTitle'), t('voteRevealedDesc', { title }));
      },
    });
  }

  function handleCreatePoll(e: FormEvent) {
    e.preventDefault();
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) {
      showNotice('red', t('invalidPollTitle'), t('invalidPollDesc'));
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('launchPollTitle'),
      description: t('launchPollDesc'),
      details: [
        { label: t('questionTitleLabel'), value: pollTitle.trim() },
        { label: t('category'), value: pollCategoryLabel(pollCategory) },
        { label: t('optionsLabel'), value: cleanedOptions.join(' · ') },
      ],
      confirmLabel: t('launchPollBtn'),
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
        setPollOptions([t('defaultOptionApprove'), t('defaultOptionDecline')]);
        setPollClosesAt('');
        await onRefresh();
        showNotice('emerald', t('pollOpenedTitle'), t('pollOpenedDesc'));
      },
    });
  }

  function handleScheduleMeeting(e: FormEvent) {
    e.preventDefault();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('scheduleMeetingTitle'),
      description: t('scheduleMeetingDesc'),
      details: [
        { label: t('meetingTitleDetail'), value: meetingTitle.trim() },
        { label: t('dateAndTime'), value: formatDateTime(meetingWhen.trim()) },
        { label: t('locationOrLink'), value: meetingWhere.trim() },
      ],
      confirmLabel: t('scheduleNotifyBtn'),
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
        showNotice('emerald', t('meetingScheduledTitle'), t('meetingScheduledDesc'));
      },
    });
  }

  async function handleRewriteMeeting() {
    if (!meetingTitle.trim() && !meetingAgenda.trim()) {
      showNotice('amber', t('draftFirstTitle'), t('draftFirstDesc'));
      return;
    }
    setRewritingMeeting(true);
    try {
      const res = await api.rewriteWithAi({
        context: 'meeting_schedule',
        title: meetingTitle.trim() ? meetingTitle : undefined,
        text: meetingAgenda.trim() || meetingTitle.trim(),
        tone: 'formal',
      });
      if (res.result.rewrittenTitle && meetingTitle.trim()) {
        setMeetingTitle(res.result.rewrittenTitle);
      }
      if (meetingAgenda.trim()) {
        setMeetingAgenda(res.result.rewrittenText);
      } else if (res.result.rewrittenText && !meetingTitle.trim()) {
        setMeetingTitle(res.result.rewrittenText);
      }
    } catch (err) {
      showNotice(
        'red',
        t('aiRewriteUnavailableTitle'),
        err instanceof Error ? err.message : t('aiRewriteUnavailableDesc')
      );
    } finally {
      setRewritingMeeting(false);
    }
  }

  function confirmMeetingStatus(m: CoopMeeting, status: CoopMeeting['status']) {
    setModal({
      mode: 'confirm',
      tone: status === 'cancelled' ? 'red' : 'emerald',
      title:
        status === 'completed' ? t('markMeetingCompletedTitle') : t('cancelMeetingTitle'),
      description: t('updateMeetingStatusDesc', {
        title: m.title,
        date: formatDateTime(m.scheduledFor),
      }),
      confirmLabel: status === 'completed' ? t('markCompletedBtn') : t('cancelMeetingBtn'),
      run: async () => {
        await api.updateMeetingStatus(m.id, status);
        await onRefresh();
        showNotice(
          status === 'completed' ? 'emerald' : 'amber',
          t('meetingStatusUpdatedTitle'),
          t('meetingStatusUpdatedDesc', { title: m.title, status: statusLabel(status) })
        );
      },
    });
  }

  function confirmProfileReqReview(req: ProfileChangeRequest, decision: 'approved' | 'rejected') {
    if (decision === 'approved') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        maxWidthClass: 'max-w-3xl',
        title: t('approveProfileTitle', { name: req.memberName }),
        description: t('approveProfileDesc'),
        customContent: <ProfileChangeDiffPreview request={req} />,
        confirmLabel: t('approveProfileBtn'),
        run: async () => {
          await api.reviewProfileChangeRequest(req.id, 'approved');
          await onRefresh();
          showNotice(
            'emerald',
            t('profileApprovedTitle'),
            t('profileApprovedDesc', { name: req.memberName })
          );
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        maxWidthClass: 'max-w-3xl',
        title: t('declineProfileTitle', { name: req.memberName }),
        description: t('declineProfileDesc'),
        customContent: <ProfileChangeDiffPreview request={req} />,
        inputLabel: t('reasonDecliningLabel'),
        inputPlaceholder: t('declineProfilePlaceholder'),
        inputRequired: true,
        inputMultiline: true,
        confirmLabel: t('declineRequestBtn'),
        run: async (note) => {
          await api.reviewProfileChangeRequest(req.id, 'rejected', note);
          await onRefresh();
          showNotice(
            'amber',
            t('profileDeclinedTitle'),
            t('profileDeclinedDesc', { name: req.memberName })
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
      label: t('tabs.contributions'),
      count: pendingContributions.length,
      Icon: CreditCard,
      activeClass: 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/35 shadow-xs',
      activeTextClass: 'text-emerald-800 dark:text-emerald-300',
      activeIconClass: 'text-emerald-600 dark:text-emerald-400',
      hoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    {
      id: 'qard-hasan',
      label: t('tabs.qardHasan'),
      count: qardHasanActionCount,
      Icon: HandCoins,
      activeClass: 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/35 shadow-xs',
      activeTextClass: 'text-teal-800 dark:text-teal-300',
      activeIconClass: 'text-teal-600 dark:text-teal-400',
      hoverClass: 'hover:border-teal-300 dark:hover:border-teal-800',
    },
    {
      id: 'installments',
      label: t('tabs.installments'),
      count: pendingInstallments.length,
      Icon: ShieldCheck,
      activeClass: 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/35 shadow-xs',
      activeTextClass: 'text-emerald-800 dark:text-emerald-300',
      activeIconClass: 'text-emerald-600 dark:text-emerald-400',
      hoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    {
      id: 'ballots',
      label: t('tabs.ballots'),
      count: ballotsCount,
      Icon: Vote,
      activeClass: 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/35 shadow-xs',
      activeTextClass: 'text-amber-800 dark:text-amber-300',
      activeIconClass: 'text-amber-600 dark:text-amber-400',
      hoverClass: 'hover:border-amber-300 dark:hover:border-amber-800',
    },
    {
      id: 'meetings-profiles',
      label: t('tabs.meetingsProfiles'),
      count: meetingsProfilesCount,
      Icon: CalendarPlus,
      activeClass: 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/35 shadow-xs',
      activeTextClass: 'text-teal-800 dark:text-teal-300',
      activeIconClass: 'text-teal-600 dark:text-teal-400',
      hoverClass: 'hover:border-teal-300 dark:hover:border-teal-800',
    },
    {
      id: 'community-drafts',
      label: t('tabs.communityDrafts'),
      count: communityDrafts.length,
      Icon: ClipboardCheck,
      activeClass: 'border-slate-500 bg-slate-100/85 dark:bg-slate-800/75 shadow-xs',
      activeTextClass: 'text-slate-900 dark:text-white',
      activeIconClass: 'text-teal-600 dark:text-teal-400',
      hoverClass: 'hover:border-slate-300 dark:hover:border-slate-700',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3 sm:space-y-5"
    >
      {/* Manager Desk Header + Interactive Queue KPI Cards */}
      <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] space-y-3 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{t('title')}</span>
            </div>
            <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white">
              {t('headerSubtitle')}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenManagerCycle && (
              <button
                type="button"
                onClick={onOpenManagerCycle}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-teal-50/70 dark:hover:bg-teal-950/30 hover:border-teal-300 dark:hover:border-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <CalendarClock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>{t('rotationTimeline')}</span>
              </button>
            )}
            <div className="text-xs font-mono tabular-nums px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/35 dark:to-teal-950/35 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300">
              {t('availableFundBalanceLabel', { amount: formatMoney(availableLiquidity, ccy) })}
            </div>
          </div>
        </div>

        {/* Clickable Queue Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {tabs.map((tab, idx) => {
            const active = activeTab === tab.id;
            const Icon = tab.Icon;
            const idleGradient = (
              ['amanah-card-emerald', 'bg-white/95 dark:bg-slate-900/92 border-slate-200/85 dark:border-slate-800/85', 'amanah-card-teal', 'amanah-card-amber', 'bg-white/95 dark:bg-slate-900/92 border-slate-200/85 dark:border-slate-800/85'] as const
            )[idx % 5];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  hasUserSelectedTabRef.current = true;
                  setActiveTab(tab.id);
                }}
                className={`p-3 sm:p-3.5 rounded-2xl border backdrop-blur-xl ring-1 ring-inset ring-white/70 dark:ring-white/5 text-left transition-all cursor-pointer active:scale-[0.99] ${
                  active
                    ? tab.activeClass
                    : `${idleGradient} shadow-xs hover:shadow-md`
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
          className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('pendingContribHeading', { count: pendingContributions.length })}
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
                placeholder={t('searchContribPlaceholder')}
                className="w-full min-h-[44px] sm:min-h-0 pl-8 pr-3 py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
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
            <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-center text-slate-500 dark:text-slate-400">
              {pendingContributions.length === 0
                ? t('allContribProcessed')
                : t('noContribMatch')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
              {filteredPendingContributions.map((c) => {
                const txNo = c.decryptedDetails?.referenceId || c.maskedReference;
                return (
                  <div
                    key={c.id}
                    className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 hover:bg-emerald-50/20 dark:hover:bg-slate-800/30 transition-colors"
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
                        <span className="font-mono text-teal-700 dark:text-teal-400">
                          {formatBillingMonth(c.billingMonth)}
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 font-mono">
                        {c.channel.toUpperCase()} · {c.providerName} · Tx #{txNo} ·{' '}
                        {t('senderPrefix', { account: c.decryptedDetails?.senderAccount || '—' })}
                      </div>
                      {c.decryptedDetails?.notes && (
                        <div className="text-slate-500 dark:text-slate-400">
                          {t('memberNotePrefix', { note: c.decryptedDetails.notes })}
                        </div>
                      )}
                      {c.receiptPhotoUrl && (
                        <a
                          href={c.receiptPhotoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                        >
                          <span>{t('inspectReceiptSlip')}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full lg:w-auto">
                      {user.role === 'admin' || c.userId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmContributionDecision(c, 'approved')}
                            className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('approve')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmContributionDecision(c, 'rejected')}
                            className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-all active:scale-[0.98]"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('denyWithNote')}</span>
                          </button>
                        </>
                      ) : (
                        <span className="col-span-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-center">
                          {t('peerAdminRequired')}
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
          <section className="bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('stage1Heading', { count: pendingReviewLoans.length })}
              </h3>
            </div>

            {pendingReviewLoans.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {t('stage1Empty')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
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
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>{' '}
                        {t('monthsInline', { months: loan.installmentMonths })}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{loan.purpose}</p>
                      {loan.decryptedSensitiveNotes && (
                        <div className="font-mono text-slate-500 dark:text-slate-400">
                          {t('payoutPrefix', {
                            details: `${loan.decryptedSensitiveNotes.channel.toUpperCase()} · ${loan.decryptedSensitiveNotes.provider} · ${loan.decryptedSensitiveNotes.disbursementAccount}`,
                          })}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmInitiateLoanVote(loan)}
                            className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Vote className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('initiateVote')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmDeclineLoanReview(loan)}
                            className="min-h-[44px] sm:min-h-0 justify-center px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                          >
                            {t('decline')}
                          </button>
                        </>
                      ) : (
                        <span className="col-span-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30">
                          {t('selfSubmittedVoteNote')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {pendingGuarantorLoans.length > 0 && (
            <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('guarantorHeading', { count: pendingGuarantorLoans.length })}
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
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
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>{' '}
                        {t('monthsInline', { months: loan.installmentMonths })}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{loan.purpose}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>{t('guarantorsLabel')}</span>
                        {(loan.guarantors || []).map((g) => (
                          <span
                            key={g.memberId}
                            className={`px-2 py-0.5 rounded border ${
                              g.status === 'accepted'
                                ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30'
                                : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30'
                            }`}
                          >
                            {g.memberName} ({g.memberCode}): {statusLabel(g.status)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-white/80 dark:bg-slate-900/80 shrink-0">
                      {t('waitingGuarantorBadge')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Stage 2: Ongoing Ballots */}
          <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('stage2Heading', { count: votingLoans.length })}
              </h3>
            </div>

            {votingLoans.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {t('stage2Empty')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
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
                        {t('pollOngoingLoanCount', {
                          cast: loan.totalVotesCast ?? loan.votes.length,
                          eligible: loan.totalEligibleVoters,
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'loan',
                          loan.id,
                          t('qardHasanBallotTitle', { id: loan.id, name: loan.borrowerName }),
                          loan.totalVotesCast ?? loan.votes.length
                        )
                      }
                      className="min-h-[44px] sm:min-h-0 w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('stopRevealBtn')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Stage 3: Approved Awaiting Disbursement Confirmation */}
          <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('stage3Heading', { count: pendingDisbursementLoans.length })}
              </h3>
            </div>

            {pendingDisbursementLoans.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {t('stage3Empty')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
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
                              <span>{t('exceedsBalance')}</span>
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
                            {t('payoutPrefix', {
                              details: `${loan.decryptedSensitiveNotes.channel.toUpperCase()} · ${loan.decryptedSensitiveNotes.provider} · ${loan.decryptedSensitiveNotes.disbursementAccount}`,
                            })}
                          </div>
                        )}
                      </div>
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <button
                          type="button"
                          disabled={modalBusy}
                          onClick={() => confirmDisbursement(loan)}
                          className="min-h-[44px] sm:min-h-0 w-full lg:w-auto justify-center px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('confirmDisburseBtn')}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 shrink-0">
                          {t('selfSubmittedPayoutNote')}
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
          className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
        >
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('installmentsHeading', { count: pendingInstallments.length })}
            </h3>
          </div>

          {pendingInstallments.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-center text-slate-500 dark:text-slate-400">
              {t('installmentsEmpty')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
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
                        ({loan.borrowerCode}) ·{' '}
                        {t('installmentRowLabel', { id: loan.id, num: inst.installmentNumber })} ·{' '}
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
                          <span>{t('viewRepaymentSlip')}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full lg:w-auto">
                      {user.role === 'admin' || loan.borrowerId !== user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() =>
                              confirmInstallmentDecision(loan, inst.installmentNumber, 'approve')
                            }
                            className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('accept')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() =>
                              confirmInstallmentDecision(loan, inst.installmentNumber, 'reject')
                            }
                            className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('denyWithNote')}</span>
                          </button>
                        </>
                      ) : (
                        <span className="col-span-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-center">
                          {t('peerAdminRequired')}
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
          <section className="xl:col-span-5 bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <Vote className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('initiatePollEyebrow')}</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('initiatePollHeading')}
            </h3>

            <form onSubmit={handleCreatePoll} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('pollQuestionLabel')}
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  placeholder={t('pollQuestionPlaceholder')}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('category')}
                  </label>
                  <select
                    value={pollCategory}
                    onChange={(e) => setPollCategory(e.target.value as DecisionPoll['category'])}
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  >
                    <option value="general">{t('pollCategoryGeneral')}</option>
                    <option value="policy">{t('pollCategoryPolicy')}</option>
                    <option value="project">{t('pollCategoryProject')}</option>
                    <option value="qard_hasan">{t('pollCategoryQardHasan')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('targetCloseDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={pollClosesAt}
                    onChange={(e) => setPollClosesAt(e.target.value)}
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('contextDescLabel')}
                </label>
                <textarea
                  rows={2}
                  value={pollDesc}
                  onChange={(e) => setPollDesc(e.target.value)}
                  placeholder={t('contextDescPlaceholder')}
                  className="w-full px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('ballotOptionsHeader', { count: pollOptions.length })}</span>
                  {pollOptions.length < 6 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ''])}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>{t('addOption')}</span>
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
                      placeholder={t('optionPlaceholder', { num: idx + 1 })}
                      className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer inline-flex items-center justify-center transition-colors"
                        aria-label={t('removeOptionAria')}
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
                className="w-full min-h-[44px] sm:min-h-0 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
              >
                {t('reviewLaunchPollBtn')}
              </button>
            </form>
          </section>

          <section className="xl:col-span-7 amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('ongoingBallotsHeading', { count: ballotsCount })}
              </h3>
            </div>

            {ballotsCount === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {t('noActiveBallots')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
                {votingLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {t('qardHasanBallotPrefix', { name: loan.borrowerName, id: loan.id })} ·{' '}
                        <span className="font-mono">{formatMoney(loan.amount, ccy)}</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        {t('ballotsCastSecret', { cast: loan.totalVotesCast ?? loan.votes.length })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() =>
                        confirmRevealBallot(
                          'loan',
                          loan.id,
                          t('qardHasanBallotTitle', { id: loan.id, name: loan.borrowerName }),
                          loan.totalVotesCast ?? loan.votes.length
                        )
                      }
                      className="min-h-[44px] sm:min-h-0 w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('stopRevealBtn')}</span>
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
                        {t('decisionPollPrefix', { title: poll.title })}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        {t('ballotsCastCount', { cast: poll.totalVotesCast ?? poll.votes.length })}
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
                      className="min-h-[44px] sm:min-h-0 w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('stopRevealBtn')}</span>
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
                        {t('ventureProposalPrefix', {
                          title: proj.title,
                          amount: formatMoney(proj.targetAllocation, ccy),
                        })}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono">
                        {t('ballotsCastCount', { cast: proj.totalVotesCast ?? proj.votes.length })}
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
                      className="min-h-[44px] sm:min-h-0 w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('stopRevealBtn')}</span>
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
          <section
            className={`${
              user.role === 'admin' ? 'xl:col-span-6' : 'xl:col-span-12'
            } amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]`}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <CalendarPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('meetingSchedulerEyebrow')}</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('scheduleMeetingHeading')}
            </h3>

            <form onSubmit={handleScheduleMeeting} className="space-y-3">
              <input
                type="text"
                required
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder={t('meetingTitlePlaceholder')}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="datetime-local"
                  required
                  value={meetingWhen}
                  onChange={(e) => setMeetingWhen(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors"
                />
                <input
                  type="text"
                  required
                  value={meetingWhere}
                  onChange={(e) => setMeetingWhere(e.target.value)}
                  placeholder={t('meetingWherePlaceholder')}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors"
                />
              </div>
              <textarea
                rows={3}
                value={meetingAgenda}
                onChange={(e) => setMeetingAgenda(e.target.value)}
                placeholder={t('meetingAgendaPlaceholder')}
                className="w-full px-3 py-2 text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-colors"
              />
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                <button
                  type="submit"
                  disabled={modalBusy || rewritingMeeting}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
                >
                  {t('scheduleNotifyAllBtn')}
                </button>
                <button
                  type="button"
                  disabled={modalBusy || rewritingMeeting}
                  onClick={() => void handleRewriteMeeting()}
                  className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/50 dark:bg-teal-950/25 hover:bg-teal-100/60 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-700 dark:text-teal-300 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{rewritingMeeting ? t('rewriting') : t('aiRewriteBtn')}</span>
                </button>
              </div>
            </form>

            {meetings.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('scheduledMeetingsHeading', { count: meetings.length })}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35 text-xs">
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
                            className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors"
                          >
                            {t('done')}
                          </button>
                          <button
                            type="button"
                            disabled={modalBusy}
                            onClick={() => confirmMeetingStatus(m, 'cancelled')}
                            className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                          >
                            {tCommon('cancel')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {user.role === 'admin' && (
            <section className="xl:col-span-6 bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('profileRequestsEyebrow')}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('pendingProfileHeading', { count: pendingProfileRequests.length })}
              </h3>

              {pendingProfileRequests.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  {t('noProfileRequests')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35 text-xs">
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
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {roleLabel(req.memberRole)}
                          </span>
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {formatShortDate(req.requestedAt)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/60 font-mono text-[11px] space-y-0.5 text-slate-700 dark:text-slate-300">
                        {formatProfileChangeEntries(req.requestedChanges).map((item) => (
                          <div key={item.key}>
                            <span className="text-slate-500 dark:text-slate-400">{item.label}:</span>{' '}
                            {item.value}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 sm:flex items-center gap-2">
                        <button
                          type="button"
                          disabled={modalBusy}
                          onClick={() => confirmProfileReqReview(req, 'approved')}
                          className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('approve')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={modalBusy}
                          onClick={() => confirmProfileReqReview(req, 'rejected')}
                          className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-medium inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('decline')}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </motion.div>
      )}

      {activeTab === 'community-drafts' && (
        <motion.div
          key="tab-community-drafts"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="space-y-4"
        >
          <section className="bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('communityDraftsHeading', { count: communityDrafts.length })}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {t('communityDraftsDesc')}
              </p>
            </div>

            {draftsLoading ? (
              <div className="space-y-3">
                <Skeleton height={72} />
                <Skeleton height={72} />
              </div>
            ) : communityDrafts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                {t('noSavedDrafts')}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl overflow-hidden bg-white/55 dark:bg-slate-950/35">
                {communityDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {draft.title}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                          {t('draftBadge')}
                        </span>
                        {draft.relatedLoanId && (
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {draft.relatedLoanId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap">
                        {draft.content}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-500">
                        {t('savedAt', { date: formatDateTime(draft.createdAt) })}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
                      <button
                        type="button"
                        disabled={modalBusy}
                        onClick={async () => {
                          setModalBusy(true);
                          try {
                            await api.publishCommunityDraft(draft.id);
                            setCommunityDrafts((prev) => prev.filter((d) => d.id !== draft.id));
                            await onRefresh();
                            showNotice(
                              'emerald',
                              t('draftPublishedTitle'),
                              t('draftPublishedDesc', { title: draft.title })
                            );
                          } catch (err) {
                            const msg =
                              err instanceof Error ? err.message : t('publishFailedDesc');
                            showNotice('red', t('publishFailedTitle'), msg);
                          } finally {
                            setModalBusy(false);
                          }
                        }}
                        className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('publish')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={modalBusy}
                        onClick={async () => {
                          setModalBusy(true);
                          try {
                            await api.deleteCommunityPost(draft.id, 'Discarded draft');
                            setCommunityDrafts((prev) => prev.filter((d) => d.id !== draft.id));
                            showNotice('slate', t('draftDiscardedTitle'), t('draftDiscardedDesc'));
                          } catch (err) {
                            const msg =
                              err instanceof Error ? err.message : t('deleteDraftFailedDesc');
                            showNotice('red', t('deleteFailedTitle'), msg);
                          } finally {
                            setModalBusy(false);
                          }
                        }}
                        className="min-h-[44px] sm:min-h-0 justify-center px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        {t('discard')}
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
        open={Boolean(modal) && modal?.mode !== 'loan-approved-post'}
        mode={modal?.mode === 'loan-approved-post' ? 'notice' : modal?.mode || 'notice'}
        tone={modal?.mode === 'loan-approved-post' ? 'emerald' : modal?.tone || 'emerald'}
        title={modal?.mode === 'loan-approved-post' ? '' : modal?.title || ''}
        description={modal?.mode === 'loan-approved-post' ? '' : modal?.description || ''}
        details={modal?.mode === 'loan-approved-post' ? undefined : modal?.details}
        customContent={modal?.mode === 'confirm' ? modal.customContent : undefined}
        maxWidthClass={modal?.mode === 'confirm' ? modal.maxWidthClass : undefined}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : t('okGotIt')}
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

      {/* Post-approval community announcement modal */}
      {modal?.mode === 'loan-approved-post' && (
        <LoanApprovedPostModal
          loan={modal.loan}
          initialTitle={modal.title}
          initialContent={modal.content}
          busy={modalBusy}
          onClose={() => {
            if (!modalBusy) setModal(null);
          }}
          onPostNow={async (title, content) => {
            setModalBusy(true);
            try {
              await api.createCommunityPost({
                category: 'Announcements',
                title,
                content,
                relatedLoanId: modal.loan.id,
              });
              await onRefresh();
              setModal(null);
              showNotice('emerald', t('postPublishedTitle'), t('postPublishedDesc'));
            } catch (err) {
              const msg = err instanceof Error ? err.message : t('postPublishFailedDesc');
              showNotice('red', t('couldNotPublishTitle'), msg);
            } finally {
              setModalBusy(false);
            }
          }}
          onSaveDraft={async (title, content) => {
            setModalBusy(true);
            try {
              await api.createCommunityPost({
                category: 'Announcements',
                title,
                content,
                status: 'draft',
                relatedLoanId: modal.loan.id,
              });
              await onRefresh();
              setModal(null);
              showNotice('emerald', t('draftSavedTitle'), t('draftSavedDesc'));
            } catch (err) {
              const msg = err instanceof Error ? err.message : t('saveDraftFailedDesc');
              showNotice('red', t('couldNotSaveDraftTitle'), msg);
            } finally {
              setModalBusy(false);
            }
          }}
        />
      )}
    </motion.div>
  );
}

/** Inline modal for posting a loan-approval community announcement now or later. */
function LoanApprovedPostModal({
  loan,
  initialTitle,
  initialContent,
  busy,
  onClose,
  onPostNow,
  onSaveDraft,
}: {
  loan: LoanRequest;
  initialTitle: string;
  initialContent: string;
  busy: boolean;
  onClose: () => void;
  onPostNow: (title: string, content: string) => Promise<void>;
  onSaveDraft: (title: string, content: string) => Promise<void>;
}) {
  const t = useTranslations('ManagerDesk');
  const tCommon = useTranslations('Common');
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
        onClick={() => {
          if (!busy) onClose();
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-approved-post-title"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl ring-1 ring-inset ring-white/80 dark:ring-white/10 shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="space-y-1 min-w-0">
            <h2
              id="loan-approved-post-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              {t('shareLoanApprovalTitle')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('shareLoanApprovalDesc', { id: loan.id })}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 transition-colors"
            aria-label={tCommon('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('meetingTitleDetail')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={140}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('contentLabel')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
              rows={8}
              maxLength={4000}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y transition-colors"
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-5 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 transition-colors"
          >
            {t('dismiss')}
          </button>
          <button
            type="button"
            disabled={busy || title.trim().length < 3 || content.trim().length < 3}
            onClick={() => void onSaveDraft(title.trim(), content.trim())}
            className="px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer disabled:opacity-50 transition-colors"
          >
            {busy ? t('saving') : t('saveForLater')}
          </button>
          <button
            type="button"
            disabled={busy || title.trim().length < 3 || content.trim().length < 3}
            onClick={() => void onPostNow(title.trim(), content.trim())}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98]"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{busy ? t('posting') : t('postNow')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
