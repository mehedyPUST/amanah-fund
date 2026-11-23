'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  HandCoins,
  KeyRound,
  Mail,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type {
  AuditLogEntry,
  Contribution,
  FundConfig,
  LoanRequest,
  MemberSummary,
  MonthlyCashflowPoint,
  PublicUser,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, isPdfFileUrl } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { AdminAuditLog } from './AdminAuditLog.tsx';
import { AdminUserManagementPanel } from './AdminUserManagementPanel.tsx';
import { AuditTrendsCharts } from './AuditTrendsCharts.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';

interface AdminReportsViewProps {
  config: FundConfig | null;
  user: PublicUser;
  contributions: Contribution[];
  loans: LoanRequest[];
  monthlySeries: MonthlyCashflowPoint[];
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function AdminReportsView({
  config,
  user,
  contributions,
  loans,
  monthlySeries,
  workspace,
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefresh,
}: AdminReportsViewProps) {
  const t = useTranslations('Admin.reports');
  const tPending = useTranslations('Admin.pending');
  const tCommon = useTranslations('Common');
  const isAdmin = user.role === 'admin';
  const ccy = config?.currency || 'BDT';

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [inspectingMember, setInspectingMember] = useState<MemberSummary | null>(null);
  const [adminSection, setAdminSection] = useState<'all' | 'users' | 'analytics' | 'policy'>('all');
  const [pdfMonthKey, setPdfMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [emailingPdf, setEmailingPdf] = useState(false);

  // Admin policy form state
  const [maxLoansPerYear, setMaxLoansPerYear] = useState(String(config?.maxLoansPerYear ?? 3));
  const [maturityDate, setMaturityDate] = useState(config?.maturityDate || '2028-12-31');
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState(
    String(config?.monthlyContributionAmount ?? 5000)
  );
  const [maxLoanAmount, setMaxLoanAmount] = useState(String(config?.maxLoanAmount ?? 75000));
  const [currency, setCurrency] = useState<FundConfig['currency']>(config?.currency || 'BDT');
  const [halalThesis, setHalalThesis] = useState(config?.halalInvestmentThesis || '');

  const [savingPolicy, setSavingPolicy] = useState(false);
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
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);

  function suggestNextAmanahMemberId(): string {
    let maxNum = 0;
    for (const m of members) {
      if (m.status === 'pending_approval') continue;
      const code = m.activationCredentials?.memberCode || m.memberCode;
      const match = code.match(/(?:AMANAH-)?AC-?(\d+)$/i) || code.match(/(\d+)$/);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }
    return `AC${String(Math.max(1, maxNum + 1)).padStart(3, '0')}`;
  }

  async function loadAdminData() {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([api.getMembers(), api.getAuditLogs()]);
      setMembers(mRes.members);
      setLogs(aRes.logs);
      setChainValid(aRes.chainValid);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('loadFailedTitle'),
        description: err instanceof Error ? err.message : t('loadFailedDesc'),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, []);

  useEffect(() => {
    if (config) {
      setMaxLoansPerYear(String(config.maxLoansPerYear));
      setMaturityDate(config.maturityDate);
      setMonthlyContributionAmount(String(config.monthlyContributionAmount));
      setMaxLoanAmount(String(config.maxLoanAmount));
      setCurrency(config.currency);
      setHalalThesis(config.halalInvestmentThesis);
    }
  }, [config]);

  function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmPolicyTitle'),
      description: t('confirmPolicyDesc'),
      details: [
        { label: t('loansPerMemberYear'), value: `${maxLoansPerYear}` },
        { label: t('halalMaturityDate'), value: maturityDate },
        {
          label: t('monthlyTarget'),
          value: formatMoney(Number(monthlyContributionAmount || 0), currency),
        },
        { label: t('maxLoanCap'), value: formatMoney(Number(maxLoanAmount || 0), currency) },
        { label: t('currency'), value: currency },
      ],
      confirmLabel: t('savePolicyBtn'),
      run: async () => {
        setSavingPolicy(true);
        try {
          await api.updateConfig({
            maxLoansPerYear: Number(maxLoansPerYear),
            maturityDate,
            monthlyContributionAmount: Number(monthlyContributionAmount),
            maxLoanAmount: Number(maxLoanAmount),
            currency,
            halalInvestmentThesis: halalThesis,
          });
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('policyUpdatedTitle'),
            description: t('policyUpdatedDesc', {
              limit: maxLoansPerYear,
              maturity: maturityDate,
            }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('policyFailedTitle'),
            description: err instanceof Error ? err.message : t('policyFailedDesc'),
          });
        } finally {
          setSavingPolicy(false);
        }
      },
    });
  }

  function confirmApproveMember(member: MemberSummary) {
    const suggestedCode = suggestNextAmanahMemberId();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('approveTitle'),
      description: t('approveDesc'),
      details: [
        { label: t('applicant'), value: member.name },
        { label: t('email'), value: member.email },
      ],
      inputLabel: t('memberIdInputLabel'),
      inputPlaceholder: t('memberIdInputPlaceholder'),
      inputRequired: true,
      initialInputValue: suggestedCode,
      confirmLabel: t('generateSendBtn'),
      run: async (memberCodeInput: string) => {
        try {
          const res = await api.issueMemberActivation(member.id, {
            memberCode: memberCodeInput.trim() || undefined,
          });
          setMembers(res.members);
          const updated = res.members.find((item) => item.id === member.id) || null;
          setInspectingMember((prev) => (prev?.id === member.id ? updated : prev));
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('codesIssuedTitle'),
            description: res.emailSent
              ? t('codesIssuedEmailSent', {
                  code: res.memberCode,
                  name: member.name,
                  email: member.email,
                })
              : t('codesIssuedEmailFailed', {
                  code: res.memberCode,
                  name: member.name,
                  reason: res.emailReason ? ` (${res.emailReason})` : '',
                }),
            details: [
              { label: t('applicant'), value: member.name },
              { label: t('officialMemberId'), value: res.memberCode },
              { label: t('activationOtp6'), value: tPending('otpPrivateEmailOnly') },
            ],
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('approvalFailedTitle'),
            description: err instanceof Error ? err.message : t('approvalFailedDesc'),
          });
        }
      },
    });
  }

  async function handleResendActivation(member: MemberSummary) {
    setModalBusy(true);
    try {
      const res = await api.resendActivationEmail(member.id);
      setMembers(res.members);
      await Promise.all([onRefresh(), loadAdminData()]);
      setModal({
        mode: 'notice',
        tone: res.emailSent ? 'emerald' : 'amber',
        title: res.emailSent ? t('resendEmailTitle') : t('emailDeliveryFailedTitle'),
        description: res.emailSent
          ? t('resendEmailSent', { code: res.memberCode, email: member.email })
          : t('resendEmailFailed', {
              reason: res.emailReason ? ` (${res.emailReason})` : '',
            }),
        details: [
          { label: t('officialMemberId'), value: res.memberCode },
          { label: t('activationOtp6'), value: tPending('otpPrivateEmailOnly') },
        ],
      });
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('resendFailedTitle'),
        description: err instanceof Error ? err.message : t('resendFailedDesc'),
      });
    } finally {
      setModalBusy(false);
    }
  }

  function confirmDeclinePending(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('declineTitle'),
      description: t('declineDesc'),
      details: [
        { label: t('applicant'), value: `${member.name} (${member.memberCode})` },
        { label: t('email'), value: member.email },
      ],
      confirmLabel: t('declineBtn'),
      run: async () => {
        try {
          const res = await api.declinePendingMember(member.id);
          setMembers(res.members);
          setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('declinedTitle'),
            description: t('declinedDesc', { name: member.name, code: member.memberCode }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('declineFailedTitle'),
            description: err instanceof Error ? err.message : t('declineFailedDesc'),
          });
        }
      },
    });
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(api.getCsvReportExportUrl(type));
  }

  const [loanReviewBusyId, setLoanReviewBusyId] = useState<string | null>(null);

  function confirmAdminLoanReview(loan: LoanRequest, decision: 'approve' | 'reject') {
    setModal({
      mode: 'confirm',
      tone: decision === 'approve' ? 'emerald' : 'red',
      title: decision === 'approve' ? t('loanApproveTitle') : t('loanDeclineTitle'),
      description: decision === 'approve' ? t('loanApproveDesc') : t('loanDeclineDesc'),
      details: [
        { label: t('loanId'), value: loan.id },
        { label: t('borrower'), value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: t('principal'), value: formatMoney(loan.amount, ccy) },
      ],
      confirmLabel: decision === 'approve' ? t('approveDisburseBtn') : t('declineLoanBtn'),
      run: async () => {
        setLoanReviewBusyId(loan.id);
        try {
          await api.adminReviewLoan(loan.id, decision);
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: decision === 'approve' ? t('loanApprovedTitle') : t('loanDeclinedTitle'),
            description:
              decision === 'approve'
                ? t('loanApprovedDesc', { id: loan.id })
                : t('loanDeclinedDesc', { id: loan.id }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('loanReviewFailedTitle'),
            description: err instanceof Error ? err.message : t('loanReviewFailedDesc'),
          });
        } finally {
          setLoanReviewBusyId(null);
        }
      },
    });
  }

  const pendingMembers = members
    .filter((m) => m.status === 'pending_approval' || m.status === 'pending_activation')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending_approval' ? -1 : 1;
      return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
    });
  const pendingReviewLoans = loans.filter((l) => l.status === 'pending_vote');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Admin Panel Section Switcher (with dedicated Manage Users option) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl px-4 py-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
          {t('workspaceTitle')}
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 rounded-xl">
          {(
            [
              { id: 'all', label: t('sectionAll') },
              { id: 'users', label: t('sectionUsers', { count: members.length }) },
              { id: 'analytics', label: t('sectionAnalytics') },
              { id: 'policy', label: t('sectionPolicy') },
            ] as const
          ).map((sec) => {
            const active = adminSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setAdminSection(sec.id)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="admin-reports-section-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-lg shadow-xs ring-1 ring-emerald-500/20"
                  />
                )}
                <span className="relative z-10">{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* New User Signup Approval Queue (Admin) */}
      {isAdmin && (adminSection === 'all' || adminSection === 'users') && (
        <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>{t('pendingApprovalsEyebrow')}</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {t('regQueueTitle', { count: pendingMembers.length })}
              </h2>
            </div>
          </div>

          {pendingMembers.length === 0 ? (
            <div className="p-4 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/55 dark:bg-slate-950/35 text-xs text-slate-500 dark:text-slate-400">
              {t('allReviewed')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl bg-white/55 dark:bg-slate-950/35 overflow-hidden">
              {pendingMembers.map((pm) => {
                const reg = pm.registrationDetails;
                const act = pm.activationCredentials;
                const isAwaitingActivation = pm.status === 'pending_activation';
                const avatar = reg?.photoUrl || pm.photoUrl;
                return (
                  <div
                    key={pm.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={t('portraitAlt', { name: pm.name })}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                          {pm.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {pm.name}{' '}
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            · {act?.memberCode || pm.memberCode}
                          </span>{' '}
                          <span
                            className={`text-xs font-medium ${
                              isAwaitingActivation
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            · {isAwaitingActivation ? t('awaitingActivation') : t('pendingReview')}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                          {pm.email} · {t('mobileShort', { phone: reg?.mobile || pm.phoneMasked || '••••' })} ·{' '}
                          {t('appliedShort', { date: formatDateTime(pm.joinedAt) })}
                        </div>
                        {isAwaitingActivation && act && (
                          <div className="text-xs font-mono text-teal-700 dark:text-teal-300 pt-0.5">
                            {t('memberIdShort')} <strong>{act.memberCode}</strong> · {t('otp6Short')}{' '}
                            <strong className="tracking-widest">
                              {act.hasActiveOtp ? '••••••' : t('unavailable')}
                            </strong>
                          </div>
                        )}
                        {reg && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            {t('refShort')} <span className="font-medium">{reg.referenceMemberName}</span> ·{' '}
                            {t('atOrg', { occupation: reg.occupation, org: reg.companyOrganization })} ·{' '}
                            {t('nidShort', { nid: reg.nid })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setInspectingMember(pm)}
                        className="px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-900/70 bg-teal-50/70 dark:bg-teal-950/30 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('viewDetails')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeclinePending(pm)}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isAwaitingActivation ? t('removeBtn') : t('declineShortBtn')}</span>
                      </button>
                      {isAwaitingActivation ? (
                        <button
                          type="button"
                          onClick={() => void handleResendActivation(pm)}
                          className="px-3.5 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-700 hover:text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-all duration-150"
                        >
                          <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('resendEmailBtn')}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmApproveMember(pm)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md inline-flex items-center gap-1 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                        >
                          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('issueCodesBtn')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Administrative Qard Hasan Loan Review Queue */}
      {(adminSection === 'all' || adminSection === 'analytics') && (
      <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <HandCoins className="w-4 h-4" aria-hidden="true" />
              <span>{t('loanReviewEyebrow')}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
              {t('pendingLoansTitle', { count: pendingReviewLoans.length })}
            </h2>
          </div>
        </div>

        {pendingReviewLoans.length === 0 ? (
          <div className="p-4 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/55 dark:bg-slate-950/35 text-xs text-slate-500 dark:text-slate-400">
            {t('noPendingLoans')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-800/85 rounded-xl bg-white/55 dark:bg-slate-950/35 overflow-hidden">
            {pendingReviewLoans.map((loan) => {
              const approvals = loan.votes.filter((v) => v.decision === 'approve').length;
              return (
                <div
                  key={loan.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {loan.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {loan.borrowerName} ({loan.borrowerCode})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {t('votesFraction', { yes: approvals, req: loan.requiredApprovals })}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                      {t('installmentsLine', {
                        amount: formatMoney(loan.amount, ccy),
                        months: loan.installmentMonths,
                        perMonth: formatMoney(loan.monthlyInstallment, ccy),
                      })}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{loan.purpose}</p>
                    {loan.decryptedSensitiveNotes && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {t('payoutPrefix', {
                          channel: loan.decryptedSensitiveNotes.channel.toUpperCase(),
                          provider: loan.decryptedSensitiveNotes.provider,
                          account: loan.decryptedSensitiveNotes.disbursementAccount,
                        })}
                        {loan.decryptedSensitiveNotes.emergencyContext &&
                        loan.decryptedSensitiveNotes.emergencyContext !== loan.purpose
                          ? ` · ${t('notesPrefix', { notes: loan.decryptedSensitiveNotes.emergencyContext })}`
                          : ''}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isAdmin || loan.borrowerId !== user.id ? (
                      <>
                        <button
                          type="button"
                          disabled={loanReviewBusyId === loan.id}
                          onClick={() => confirmAdminLoanReview(loan, 'reject')}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('declineShortBtn')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loanReviewBusyId === loan.id}
                          onClick={() => confirmAdminLoanReview(loan, 'approve')}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('approveDisburseBtn')}</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        {t('peerReviewRequired')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Recharts Audit Visualization: Contribution Trends & Loan Volume */}
      {(adminSection === 'all' || adminSection === 'analytics') && (
        <>
          <AuditTrendsCharts
            contributions={contributions}
            loans={loans}
            monthlySeries={monthlySeries}
            currency={ccy}
            projectStartDate={config?.projectStartDate}
            loading={loading && monthlySeries.length === 0}
          />

          {/* Google Sheets Blueprint Auto-Sync */}
          <GoogleSheetSyncCard
            config={config}
            workspace={workspace}
            connectingGoogle={connectingGoogle}
            onConnectGoogle={onConnectGoogle}
            onDisconnectGoogle={onDisconnectGoogle}
            onSynced={async () => {
              await Promise.all([onRefresh(), loadAdminData()]);
            }}
          />

          {/* Monthly Fund Summary PDF & Email Distribution */}
          <section className="bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  <span>{t('monthlyPdfEyebrow')}</span>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('monthlyPdfHeading')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('autoEmailNoticePrefix')}{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {config?.monthlyReportAutoEmail === false ? t('disabled') : t('enabled')}
                  </strong>
                  {' · '}{t('lastAutomatedEmailed')}{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {config?.lastMonthlyPdfSentMonth || t('noneYet')}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="month"
                  aria-label={t('summaryMonthAria')}
                  value={pdfMonthKey}
                  onChange={(e) => setPdfMonthKey(e.target.value)}
                  className="px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
                <a
                  href={api.getMonthlyPdfDownloadUrl(pdfMonthKey)}
                  download
                  className="px-3.5 py-2 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/80 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-700 dark:text-teal-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('downloadMonthlyPdf')}</span>
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={emailingPdf}
                    onClick={() => {
                      setModal({
                        mode: 'confirm',
                        tone: 'emerald',
                        title: t('confirmEmailPdfTitle', { month: pdfMonthKey }),
                        description: t('confirmEmailPdfDesc'),
                        details: [
                          { label: t('targetMonth'), value: pdfMonthKey },
                          { label: t('attachment'), value: `amanah-monthly-summary-${pdfMonthKey}.pdf` },
                        ],
                        confirmLabel: t('sendMonthlyPdfBtn'),
                        run: async () => {
                          setEmailingPdf(true);
                          try {
                            const res = await api.emailMonthlyPdfSummary(pdfMonthKey);
                            await onRefresh();
                            const totalTargets = res.totalRecipients ?? res.totalMembers ?? 0;
                            const firstError = res.errors?.[0] || res.reason;
                            setModal({
                              mode: 'notice',
                              tone: res.sentCount > 0 ? 'emerald' : 'amber',
                              title:
                                res.sentCount > 0
                                  ? t('pdfEmailedTitle')
                                  : t('pdfSummaryTitle'),
                              description: res.skipped
                                ? firstError || t('smtpMissingFallback')
                                : res.sentCount === 0 && firstError
                                  ? t('smtpErrorLine', { error: firstError })
                                  : t('dispatchedSummary', {
                                      sent: res.sentCount,
                                      total: totalTargets,
                                    }),
                              details: [
                                { label: t('month'), value: res.monthKey },
                                { label: t('delivered'), value: `${res.sentCount}` },
                                { label: t('failedSkipped'), value: `${res.failedCount}` },
                                ...(firstError && res.sentCount === 0
                                  ? [{ label: t('smtpDetail'), value: firstError }]
                                  : []),
                              ],
                            });
                          } catch (err) {
                            setModal({
                              mode: 'notice',
                              tone: 'red',
                              title: t('pdfFailedTitle'),
                              description:
                                err instanceof Error
                                  ? err.message
                                  : t('pdfFailedDesc'),
                            });
                          } finally {
                            setEmailingPdf(false);
                          }
                        },
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 hover:shadow-md cursor-pointer whitespace-nowrap shrink-0 transition-all duration-150 active:scale-[0.98]"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{emailingPdf ? t('sendingPdf') : t('emailPdfBtn')}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Automated Reporting Tools */}
          <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('complianceHeading')}
                </h2>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  { id: 'contributions', label: t('csvContributions') },
                  { id: 'loans', label: t('csvLoans') },
                  { id: 'members', label: t('csvMembers') },
                  { id: 'audit', label: t('csvAudit') },
                ] as const
              ).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => downloadCsvReport(rep.id)}
                  className="px-4 py-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-150 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <span>{rep.label}</span>
                  <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Admin Governance & Policy Controls */}
      {isAdmin && (adminSection === 'all' || adminSection === 'policy') && (
        <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('policyHeading')}
            </h3>
          </div>

          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('loansPerMemberYear')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={maxLoansPerYear}
                  onChange={(e) => setMaxLoansPerYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('halalMaturityDate')}
                </label>
                <input
                  type="date"
                  required
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('monthlyTargetLabel', { currency: ccy })}
                </label>
                <input
                  type="number"
                  min={100}
                  required
                  value={monthlyContributionAmount}
                  onChange={(e) => setMonthlyContributionAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('maxLoanCapLabel', { currency: ccy })}
                </label>
                <input
                  type="number"
                  min={500}
                  required
                  value={maxLoanAmount}
                  onChange={(e) => setMaxLoanAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('currency')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as FundConfig['currency'])}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                >
                  <option value="BDT">BDT (৳)</option>
                  <option value="USD">USD ($)</option>
                  <option value="MYR">MYR (RM)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('halalMandateLabel')}
              </label>
              <textarea
                rows={2}
                value={halalThesis}
                onChange={(e) => setHalalThesis(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPolicy}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {savingPolicy ? t('savingPolicy') : t('saveCoopPolicyBtn')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Admin User Management Option (Create, Edit, Role, Status, Delete, KYC) */}
      {(adminSection === 'all' || adminSection === 'users') && (
        <AdminUserManagementPanel
          members={members}
          currentUser={user}
          config={config}
          loading={loading}
          onMembersUpdated={setMembers}
          onInspectMember={setInspectingMember}
          onRefreshAll={async () => {
            await Promise.all([onRefresh(), loadAdminData()]);
          }}
        />
      )}

      {/* Tamper-Evident Encrypted Audit Trail */}
      {(adminSection === 'all' || adminSection === 'policy') && (
        <AdminAuditLog
          user={user}
          initialLogs={logs}
          initialChainValid={chainValid}
          externalLoading={loading}
          onRefreshExternal={loadAdminData}
          compactHeader
        />
      )}

      {/* Admin Inspection Modal: Full Applicant / Member Registration Details */}
      <AnimatePresence>
      {inspectingMember && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-reg-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/80 dark:ring-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)]"
          >
            <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4 border-b border-slate-100/80 dark:border-slate-800/80 flex items-center justify-between gap-4">
              <div>
                <h3
                  id="member-reg-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {t('regModalTitle', { name: inspectingMember.name })}
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {inspectingMember.memberCode} · {inspectingMember.email} ·{' '}
                  {t('appliedLabel', { date: formatDateTime(inspectingMember.joinedAt) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                aria-label={t('closeRegDetailsAria')}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs">
              {(() => {
                const reg = inspectingMember.registrationDetails;
                const portrait = reg?.photoUrl || inspectingMember.photoUrl;
                return (
                  <>
                    {/* Photo & Optional Agreement Paper */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {t('applicantPhoto')}
                        </div>
                        {portrait ? (
                          <a
                            href={portrait}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[4/3]"
                          >
                            <img
                              src={portrait}
                              alt={t('photoAlt', { name: inspectingMember.name })}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {t('noPhotoUploaded')}
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {t('agreementPaper')}
                        </div>
                        {reg?.agreementPhotoUrl ? (
                          isPdfFileUrl(reg.agreementPhotoUrl) ? (
                            <a
                              href={reg.agreementPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="h-32 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-2 p-3 text-center hover:border-emerald-500 transition-colors"
                            >
                              <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                              <span className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1">
                                <span>{t('openSignedPdf')}</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </span>
                            </a>
                          ) : (
                            <a
                              href={reg.agreementPhotoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-[4/3]"
                            >
                              <img
                                src={reg.agreementPhotoUrl}
                                alt={t('signedAgreementAlt', { name: inspectingMember.name })}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          )
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {t('notProvidedOptional')}
                          </div>
                        )}
                      </div>
                    </div>

                    {reg ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">{t('dob')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.dateOfBirth}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('referenceMember')}
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.referenceMemberName}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">{t('mobileNumber')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.mobile}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">{t('nidLabel')}</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.nid}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">{t('occupation')}</div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.occupation}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('companyOrg')}
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.companyOrganization}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">{t('presentAddress')}</div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.presentAddress}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/40">
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('permanentAddress')}
                          </div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.permanentAddress}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        {t('noExtendedKyc')}
                      </div>
                    )}
                    {reg?.nominees && reg.nominees.length > 0 && (
                      <NomineeDetailsList nominees={reg.nominees} compact />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
              {inspectingMember.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    onClick={() => confirmDeclinePending(inspectingMember)}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('declineBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmApproveMember(inspectingMember)}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98]"
                  >
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('approveIssueBtn')}</span>
                  </button>
                </>
              )}
              {inspectingMember.status === 'pending_activation' && (
                <button
                  type="button"
                  onClick={() => void handleResendActivation(inspectingMember)}
                  className="px-3.5 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-700 hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('resendEmailBtn')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                {tCommon('close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        initialInputValue={modal?.mode === 'confirm' ? modal.initialInputValue : ''}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async (inputValue: string) => {
                setModalBusy(true);
                try {
                  await modal.run(inputValue);
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
