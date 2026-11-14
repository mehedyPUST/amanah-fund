import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Search, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
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
import { formatDateTime, formatMoney, shortHash } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { AuditTrendsCharts } from './AuditTrendsCharts.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';
import { StatusText } from './StatusText.tsx';

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
  const [logSearch, setLogSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

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

  const pendingMembers = members.filter((m) => m.status === 'pending_approval');

  const filteredLogs = logs.filter((l) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      l.actorName.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.resourceId.toLowerCase().includes(q)
    );
  });

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

      {/* New User Signup Approval Queue (Admin) */}
      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
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
              {pendingMembers.map((pm) => (
                <div
                  key={pm.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {pm.name}{' '}
                      <span className="font-mono text-xs text-slate-500">· {pm.memberCode}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {pm.email} · Phone {pm.phoneMasked || '••••'} · Applied{' '}
                      {formatDateTime(pm.joinedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDeclinePending(pm.id)}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMemberChange(pm.id, { status: 'active' })}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve Signup</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recharts Audit Visualization: Contribution Trends & Loan Volume */}
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
              className="px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <span>{rep.label}</span>
              <Download className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {/* Admin Governance & Policy Controls */}
      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
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
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {savingPolicy ? 'Saving Policy…' : 'Save Cooperative Policy'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Member Directory & Granular RBAC */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Member Directory & Role-Based Access Control
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track member contribution totals, annual Qard Hasan quota usage, and RBAC assignments
          </p>
        </div>

        {loading ? (
          <Skeleton height={160} />
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Member</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4 text-right">Total Contributed</th>
                  <th className="py-2.5 px-4 text-right">Loans This Year</th>
                  <th className="py-2.5 px-4 text-right">Active Balance</th>
                  <th className="py-2.5 px-4">Status</th>
                  {isAdmin && <th className="py-2.5 px-4 text-right">RBAC Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white text-sm">
                        {m.name}
                      </div>
                      <div className="font-mono text-slate-500">
                        {m.memberCode} · {m.email}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleMemberChange(m.id, { role: e.target.value as UserRole })
                          }
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 capitalize"
                        >
                          <option value="member">member</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className="capitalize font-medium">{m.role}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                      {formatMoney(m.totalContributed, ccy)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {m.loansThisYear} / {config?.maxLoansPerYear || 3}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatMoney(m.activeLoanBalance, ccy)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={m.status} />
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        {m.id !== user.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleMemberChange(m.id, {
                                status: m.status === 'active' ? 'suspended' : 'active',
                              })
                            }
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {m.status === 'active'
                              ? 'Suspend'
                              : m.status === 'pending_approval'
                                ? 'Approve'
                                : 'Activate'}
                          </button>
                        ) : (
                          <span className="text-slate-400">Current Admin</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tamper-Evident Encrypted Audit Trail */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Automated Audit Log & Hash Chain
              </h3>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  chainValid
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{chainValid ? 'SHA-256 Chain Verified' : 'Chain Integrity Alert'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Immutable activity trail with AES-256-GCM encrypted metadata envelopes
            </p>
          </div>

          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filter actor or action…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        {loading ? (
          <Skeleton height={180} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
            {filteredLogs.slice(0, 25).map((entry) => {
              const isOpen = expandedLogId === entry.id;
              return (
                <div key={entry.id} className="p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {entry.action}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {entry.actorName} ({entry.actorRole})
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{entry.summary}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isOpen ? null : entry.id)}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      {isOpen ? 'Hide Envelope' : 'Inspect Hash'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-400 space-y-1 break-all">
                      <div>Entry Hash: {entry.entryHash}</div>
                      <div>Prev Hash: {shortHash(entry.prevHash)}</div>
                      <div>
                        Encrypted Payload: {entry.encryptedPayload.ciphertext.slice(0, 64)}…
                      </div>
                      {entry.decryptedPayload && (
                        <div className="text-emerald-700 dark:text-emerald-400">
                          Decrypted Payload: {JSON.stringify(entry.decryptedPayload)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
