'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  HandCoins,
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
import { formatDateTime, formatMoney } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { AdminAuditLog } from './AdminAuditLog.tsx';
import { AdminUserManagementPanel } from './AdminUserManagementPanel.tsx';
import { AuditTrendsCharts } from './AuditTrendsCharts.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';

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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  async function loadAdminData() {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([api.getMembers(), api.getAuditLogs()]);
      setMembers(mRes.members);
      setLogs(aRes.logs);
      setChainValid(aRes.chainValid);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load admin records.',
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

  async function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    setSavingPolicy(true);
    setFeedback(null);
    try {
      await api.updateConfig({
        maxLoansPerYear: Number(maxLoansPerYear),
        maturityDate,
        monthlyContributionAmount: Number(monthlyContributionAmount),
        maxLoanAmount: Number(maxLoanAmount),
        currency,
        halalInvestmentThesis: halalThesis,
      });
      setFeedback({
        type: 'success',
        text: `Cooperative policy updated (annual loan limit: ${maxLoansPerYear}/year, maturity: ${maturityDate}).`,
      });
      await Promise.all([onRefresh(), loadAdminData()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save cooperative policy.',
      });
    } finally {
      setSavingPolicy(false);
    }
  }

  async function handleMemberChange(
    memberId: string,
    payload: { role?: UserRole; status?: UserStatus }
  ) {
    setFeedback(null);
    try {
      const res = await api.updateMember(memberId, payload);
      setMembers(res.members);
      setInspectingMember((prev) => (prev?.id === memberId ? null : prev));
      setFeedback({
        type: 'success',
        text:
          payload.status === 'active'
            ? 'Member approved and activated. Welcome notification queued.'
            : 'Member RBAC permissions updated.',
      });
      await Promise.all([onRefresh(), loadAdminData()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update member.',
      });
    }
  }

  async function handleDeclinePending(memberId: string) {
    setFeedback(null);
    try {
      const res = await api.declinePendingMember(memberId);
      setMembers(res.members);
      setInspectingMember((prev) => (prev?.id === memberId ? null : prev));
      setFeedback({ type: 'success', text: 'Pending member registration declined and removed.' });
      await Promise.all([onRefresh(), loadAdminData()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to decline pending registration.',
      });
    }
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(`/api/reports/export?type=${type}`);
  }

  const [loanReviewBusyId, setLoanReviewBusyId] = useState<string | null>(null);

  async function handleAdminLoanReview(loanId: string, decision: 'approve' | 'reject') {
    setLoanReviewBusyId(loanId);
    setFeedback(null);
    try {
      await api.adminReviewLoan(loanId, decision);
      setFeedback({
        type: 'success',
        text:
          decision === 'approve'
            ? `Qard Hasan loan ${loanId} approved for treasury disbursement.`
            : `Qard Hasan loan ${loanId} declined during administrative review.`,
      });
      await Promise.all([onRefresh(), loadAdminData()]);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review loan request.',
      });
    } finally {
      setLoanReviewBusyId(null);
    }
  }

  const pendingMembers = members.filter((m) => m.status === 'pending_approval');
  const pendingReviewLoans = loans.filter((l) => l.status === 'pending_vote');

  return (
    <div className="space-y-6">
      {/* Admin Panel Section Switcher (with dedicated Manage Users option) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/60 via-white to-amber-50/40 dark:from-emerald-950/20 dark:via-slate-900 dark:to-amber-950/15 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 shadow-xs">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
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
          ).map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setAdminSection(sec.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                adminSection === sec.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

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

      {/* New User Signup Approval Queue (Admin) */}
      {isAdmin && (adminSection === 'all' || adminSection === 'users') && (
        <section className="bg-gradient-to-br from-amber-50/60 via-white to-white dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900 border border-amber-200/75 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>Pending Member Signup Approvals</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                New Registration Verification Queue ({pendingMembers.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                New applicants cannot sign in until an administrator approves their membership.
              </p>
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
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                          {pm.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {pm.name}{' '}
                          <span className="font-mono text-xs text-slate-500">· {pm.memberCode}</span>
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
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>View Details</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeclinePending(pm.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Decline</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMemberChange(pm.id, { status: 'active' })}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1 cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
      <section className="bg-gradient-to-br from-emerald-50/45 via-white to-amber-50/30 dark:from-emerald-950/15 dark:via-slate-900 dark:to-amber-950/10 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <HandCoins className="w-4 h-4" aria-hidden="true" />
              <span>Administrative Qard Hasan Review</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
              Pending Loan Requests ({pendingReviewLoans.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review requested principal, purpose, repayment schedule, and encrypted payout account
            </p>
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
                    <button
                      type="button"
                      disabled={loanReviewBusyId === loan.id}
                      onClick={() => void handleAdminLoanReview(loan.id, 'reject')}
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      disabled={loanReviewBusyId === loan.id}
                      onClick={() => void handleAdminLoanReview(loan.id, 'approve')}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve for Disbursement</span>
                    </button>
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

          {/* Automated Reporting Tools */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Automated Regulatory & Compliance Reports
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Export cryptographically hashed CSV ledgers for external Shariah audit and member
                  general meetings
                </p>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
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
                  className="px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-50/50 via-white to-amber-50/40 dark:from-emerald-950/15 dark:via-slate-900 dark:to-amber-950/15 hover:border-emerald-400 dark:hover:border-emerald-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <span>{rep.label}</span>
                  <Download className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Admin Governance & Policy Controls */}
      {isAdmin && (adminSection === 'all' || adminSection === 'policy') && (
        <section className="bg-gradient-to-br from-amber-50/45 via-white to-emerald-50/40 dark:from-amber-950/15 dark:via-slate-900 dark:to-emerald-950/15 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Administrator Fund Policy & Annual Loan Quota
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Adjust the maximum Qard Hasan loans allowed per member per year (default 3), maturity
              date, and contribution parameters
            </p>
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
          onFeedback={setFeedback}
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
      {inspectingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-reg-modal-title"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
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
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                            No photo uploaded
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          Agreement Paper Photo (Optional)
                        </div>
                        {reg?.agreementPhotoUrl ? (
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
                        ) : (
                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
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
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500">
                        No extended KYC registration payload stored for this bootstrap account.
                      </div>
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
                    onClick={() => void handleDeclinePending(inspectingMember.id)}
                    className="px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Decline Application</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleMemberChange(inspectingMember.id, { status: 'active' })
                    }
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
          </div>
        </div>
      )}
    </div>
  );
}
