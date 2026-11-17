'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  HandCoins,
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
        run: () => Promise<void>;
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
        title: 'Failed to Load Admin Records',
        description: err instanceof Error ? err.message : 'Failed to load admin records.',
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
      title: 'Update Cooperative Fund Policy?',
      description:
        'Confirm saving these governance limits and treasury policy parameters for all cooperative members.',
      details: [
        { label: 'Loans / Member / Year', value: `${maxLoansPerYear}` },
        { label: 'Halal Maturity Date', value: maturityDate },
        { label: 'Monthly Target', value: formatMoney(Number(monthlyContributionAmount || 0), currency) },
        { label: 'Max Loan Cap', value: formatMoney(Number(maxLoanAmount || 0), currency) },
        { label: 'Currency', value: currency },
      ],
      confirmLabel: 'Save Policy',
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
            title: 'Cooperative Policy Updated',
            description: `Cooperative policy updated (annual loan limit: ${maxLoansPerYear}/year, maturity: ${maturityDate}).`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Policy Save Failed',
            description: err instanceof Error ? err.message : 'Failed to save cooperative policy.',
          });
        } finally {
          setSavingPolicy(false);
        }
      },
    });
  }

  function confirmApproveMember(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Approve Member Registration?',
      description:
        'Approving activates this applicant account for monthly deposits, community participation, and voting.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
      ],
      confirmLabel: 'Approve Signup',
      run: async () => {
        try {
          const res = await api.updateMember(member.id, { status: 'active' });
          setMembers(res.members);
          setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Membership Approved',
            description: res.emailSent
              ? `${member.name} (${member.memberCode}) is now an active verified member. Welcome email sent to ${member.email}.`
              : `${member.name} (${member.memberCode}) is now an active verified member. In-app welcome notice queued${res.emailReason ? ` (email skipped: ${res.emailReason})` : ''}.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Approval Failed',
            description: err instanceof Error ? err.message : 'Failed to approve member.',
          });
        }
      },
    });
  }

  function confirmDeclinePending(member: MemberSummary) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Decline Pending Registration?',
      description:
        'Declining removes this pending signup application from the verification queue.',
      details: [
        { label: 'Applicant', value: `${member.name} (${member.memberCode})` },
        { label: 'Email', value: member.email },
      ],
      confirmLabel: 'Decline Application',
      run: async () => {
        try {
          const res = await api.declinePendingMember(member.id);
          setMembers(res.members);
          setInspectingMember((prev) => (prev?.id === member.id ? null : prev));
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Application Declined',
            description: `Pending registration for ${member.name} (${member.memberCode}) declined and removed.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Decline Failed',
            description:
              err instanceof Error ? err.message : 'Failed to decline pending registration.',
          });
        }
      },
    });
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(`/api/reports/export?type=${type}`);
  }

  const [loanReviewBusyId, setLoanReviewBusyId] = useState<string | null>(null);

  function confirmAdminLoanReview(loan: LoanRequest, decision: 'approve' | 'reject') {
    setModal({
      mode: 'confirm',
      tone: decision === 'approve' ? 'emerald' : 'red',
      title:
        decision === 'approve'
          ? 'Approve Qard Hasan Loan for Disbursement?'
          : 'Decline Qard Hasan Loan Request?',
      description:
        decision === 'approve'
          ? 'Administrative approval moves this loan into the disbursement queue.'
          : 'Declining ends administrative review and notifies the borrower.',
      details: [
        { label: 'Loan ID', value: loan.id },
        { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
        { label: 'Principal', value: formatMoney(loan.amount, ccy) },
      ],
      confirmLabel: decision === 'approve' ? 'Approve for Disbursement' : 'Decline Loan',
      run: async () => {
        setLoanReviewBusyId(loan.id);
        try {
          await api.adminReviewLoan(loan.id, decision);
          await Promise.all([onRefresh(), loadAdminData()]);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: decision === 'approve' ? 'Loan Approved' : 'Loan Declined',
            description:
              decision === 'approve'
                ? `Qard Hasan loan ${loan.id} approved for treasury disbursement.`
                : `Qard Hasan loan ${loan.id} declined during administrative review.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Loan Review Failed',
            description: err instanceof Error ? err.message : 'Failed to review loan request.',
          });
        } finally {
          setLoanReviewBusyId(null);
        }
      },
    });
  }

  const pendingMembers = members.filter((m) => m.status === 'pending_approval');
  const pendingReviewLoans = loans.filter((l) => l.status === 'pending_vote');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Admin Panel Section Switcher (with dedicated Manage Users option) */}
      <div className="flex flex-wrap items-center justify-between gap-3 amanah-card-violet border rounded-2xl px-4 py-3 shadow-xs">
        <div className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
          Admin Panel Workspace
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'all', label: 'All Sections' },
              { id: 'users', label: `Manage Users (${members.length})` },
              { id: 'analytics', label: 'Loans & Analytics' },
              { id: 'policy', label: 'Policy & Audit Logs' },
            ] as const
          ).map((sec) => {
            const active = adminSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setAdminSection(sec.id)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="admin-reports-section-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
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
        <section className="amanah-card-amber border rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>Pending Member Signup Approvals</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                New Registration Verification Queue ({pendingMembers.length})
              </h2>
            </div>
          </div>

          {pendingMembers.length === 0 ? (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
              All member registrations have been reviewed.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {pendingMembers.map((pm) => {
                const reg = pm.registrationDetails;
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
                          alt={`${pm.name} portrait`}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                          {pm.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {pm.name}{' '}
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">· {pm.memberCode}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                          {pm.email} · Mobile {reg?.mobile || pm.phoneMasked || '••••'} · Applied{' '}
                          {formatDateTime(pm.joinedAt)}
                        </div>
                        {reg && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            Ref: <span className="font-medium">{reg.referenceMemberName}</span> ·{' '}
                            {reg.occupation} at {reg.companyOrganization} · NID {reg.nid}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setInspectingMember(pm)}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>View Details</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeclinePending(pm)}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Decline</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmApproveMember(pm)}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Approve Signup</span>
                      </button>
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
      <section className="amanah-card-teal border rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <HandCoins className="w-4 h-4" aria-hidden="true" />
              <span>Administrative Qard Hasan Review</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
              Pending Loan Requests ({pendingReviewLoans.length})
            </h2>
          </div>
        </div>

        {pendingReviewLoans.length === 0 ? (
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
            No pending Qard Hasan loan requests awaiting administrative review.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
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
                        Votes {approvals}/{loan.requiredApprovals}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                      {formatMoney(loan.amount, ccy)} · {loan.installmentMonths} monthly installments
                      ({formatMoney(loan.monthlyInstallment, ccy)}/mo)
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{loan.purpose}</p>
                    {loan.decryptedSensitiveNotes && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Payout: {loan.decryptedSensitiveNotes.channel.toUpperCase()} ·{' '}
                        {loan.decryptedSensitiveNotes.provider} ·{' '}
                        {loan.decryptedSensitiveNotes.disbursementAccount}
                        {loan.decryptedSensitiveNotes.emergencyContext &&
                        loan.decryptedSensitiveNotes.emergencyContext !== loan.purpose
                          ? ` · Notes: ${loan.decryptedSensitiveNotes.emergencyContext}`
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
                          className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Decline</span>
                        </button>
                        <button
                          type="button"
                          disabled={loanReviewBusyId === loan.id}
                          onClick={() => confirmAdminLoanReview(loan, 'approve')}
                          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Approve for Disbursement</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Peer / Admin Review Required
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
          <section className="amanah-card-violet border rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  <span>Monthly PDF Fund Statement &amp; Automated Dispatch</span>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Monthly Fund Summary PDF Report
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Auto-email at month rollover is{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {config?.monthlyReportAutoEmail === false ? 'Disabled' : 'Enabled'}
                  </strong>
                  {' · '}Last automated month emailed:{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {config?.lastMonthlyPdfSentMonth || 'None yet'}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="month"
                  aria-label="Summary month"
                  value={pdfMonthKey}
                  onChange={(e) => setPdfMonthKey(e.target.value)}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <a
                  href={api.getMonthlyPdfDownloadUrl(pdfMonthKey)}
                  download
                  className="px-3.5 py-2 rounded-lg border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/80 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-700 dark:text-teal-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download Monthly PDF</span>
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={emailingPdf}
                    onClick={() => {
                      setModal({
                        mode: 'confirm',
                        tone: 'emerald',
                        title: `Email Monthly PDF Summary (${pdfMonthKey})?`,
                        description:
                          'Generates the Monthly Cooperative Fund Summary PDF attachment and emails it to all active members.',
                        details: [
                          { label: 'Target Month', value: pdfMonthKey },
                          { label: 'Attachment', value: `amanah-monthly-summary-${pdfMonthKey}.pdf` },
                        ],
                        confirmLabel: 'Send Monthly PDF Emails',
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
                                  ? 'Monthly PDF Summaries Emailed'
                                  : 'Monthly PDF Email Dispatch Summary',
                              description: res.skipped
                                ? firstError || 'SMTP is not configured on the server.'
                                : res.sentCount === 0 && firstError
                                  ? `SMTP delivery error: ${firstError}`
                                  : `Dispatched monthly PDF summary to ${res.sentCount} of ${totalTargets} active member(s).`,
                              details: [
                                { label: 'Month', value: res.monthKey },
                                { label: 'Delivered', value: `${res.sentCount}` },
                                { label: 'Failed / Skipped', value: `${res.failedCount}` },
                                ...(firstError && res.sentCount === 0
                                  ? [{ label: 'SMTP Detail', value: firstError }]
                                  : []),
                              ],
                            });
                          } catch (err) {
                            setModal({
                              mode: 'notice',
                              tone: 'red',
                              title: 'PDF Dispatch Failed',
                              description:
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to email monthly PDF summary.',
                            });
                          } finally {
                            setEmailingPdf(false);
                          }
                        },
                      });
                    }}
                    className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{emailingPdf ? 'Sending…' : 'Email PDF to Active Members'}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Automated Reporting Tools */}
          <section className="amanah-card-emerald border rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Automated Regulatory & Compliance Reports
                </h2>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  { id: 'contributions', label: 'Contributions Ledger CSV' },
                  { id: 'loans', label: 'Qard Hasan Portfolio CSV' },
                  { id: 'members', label: 'Member Standing CSV' },
                  { id: 'audit', label: 'Encrypted Audit Trail CSV' },
                ] as const
              ).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => downloadCsvReport(rep.id)}
                  className="px-4 py-3 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
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
        <section className="amanah-card-amber border rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Administrator Fund Policy & Annual Loan Quota
            </h3>
          </div>

          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Loans / Member / Year
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={maxLoansPerYear}
                  onChange={(e) => setMaxLoansPerYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Halal Maturity Date
                </label>
                <input
                  type="date"
                  required
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Monthly Target ({ccy})
                </label>
                <input
                  type="number"
                  min={100}
                  required
                  value={monthlyContributionAmount}
                  onChange={(e) => setMonthlyContributionAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Max Loan Cap ({ccy})
                </label>
                <input
                  type="number"
                  min={500}
                  required
                  value={maxLoanAmount}
                  onChange={(e) => setMaxLoanAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as FundConfig['currency'])}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
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
                Post-Maturity Halal Investment Mandate
              </label>
              <textarea
                rows={2}
                value={halalThesis}
                onChange={(e) => setHalalThesis(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPolicy}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {savingPolicy ? 'Saving Policy…' : 'Save Cooperative Policy'}
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
            className="bg-white/88 dark:bg-slate-900/88 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
          >
            <div className="sticky top-0 bg-white/88 dark:bg-slate-900/88 backdrop-blur-md px-6 py-4 border-b border-slate-100/80 dark:border-slate-800/80 flex items-center justify-between gap-4">
              <div>
                <h3
                  id="member-reg-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Registration Details · {inspectingMember.name}
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {inspectingMember.memberCode} · {inspectingMember.email} · Applied{' '}
                  {formatDateTime(inspectingMember.joinedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                aria-label="Close registration details"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
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
                          Applicant Photo
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
                              alt={`${inspectingMember.name} photo`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            No photo uploaded
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          Agreement Paper (Optional)
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
                                <span>Open Signed Agreement PDF</span>
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
                                alt={`${inspectingMember.name} signed agreement`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          )
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            Not provided (optional)
                          </div>
                        )}
                      </div>
                    </div>

                    {reg ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Date of Birth</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.dateOfBirth}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Reference (Existing Member)
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.referenceMemberName}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Mobile Number</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.mobile}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">National ID (NID)</div>
                          <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                            {reg.nid}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Occupation</div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.occupation}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Company / Organization
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                            {reg.companyOrganization}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">Present Address</div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.presentAddress}
                          </div>
                        </div>
                        <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-slate-500 dark:text-slate-400">
                            Permanent Address
                          </div>
                          <div className="mt-0.5 text-slate-900 dark:text-white">
                            {reg.permanentAddress}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        No extended KYC registration payload stored for this bootstrap account.
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
                    className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Decline Application</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmApproveMember(inspectingMember)}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Approve Signup</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setInspectingMember(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
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
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async () => {
                setModalBusy(true);
                try {
                  await modal.run();
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
