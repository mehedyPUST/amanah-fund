'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Lock, Search, Shield, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { Contribution, FundConfig, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatBillingMonth, formatDateTime, formatMoney, shortHash } from '../utils/format.ts';
import { ContributionGoalTracker } from './ContributionGoalTracker.tsx';
import { StatusText } from './StatusText.tsx';

interface ContributionsViewProps {
  contributions: Contribution[];
  config: FundConfig | null;
  user: PublicUser;
  loading: boolean;
  initialBillingMonth?: string | null;
  onRefresh: () => Promise<void>;
}

const BANK_PROVIDERS = [
  'Islami Bank Bangladesh',
  'Dutch-Bangla Bank',
  'City Bank',
  'Bank Asia',
  'Standard Chartered',
];
const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay'];

export function ContributionsView({
  contributions,
  config,
  user,
  loading,
  initialBillingMonth,
  onRefresh,
}: ContributionsViewProps) {
  const ccy = config?.currency || 'BDT';
  const isReviewer = user.role === 'admin' || user.role === 'manager';

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [billingMonth, setBillingMonth] = useState(initialBillingMonth || currentMonth);
  useEffect(() => {
    if (initialBillingMonth) {
      setBillingMonth(initialBillingMonth);
    }
  }, [initialBillingMonth]);
  const [amount, setAmount] = useState(String(config?.monthlyContributionAmount || 5000));
  const [channel, setChannel] = useState<'bank' | 'mfs'>('mfs');
  const [providerName, setProviderName] = useState('bKash');
  const [senderAccount, setSenderAccount] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await api.submitContribution({
        billingMonth,
        amount: Number(amount),
        channel,
        providerName,
        senderAccount,
        referenceId,
        notes,
      });
      setSenderAccount('');
      setReferenceId('');
      setNotes('');
      setFeedback({
        type: 'success',
        text: 'Contribution request submitted and encrypted with AES-256-GCM. Awaiting manager verification.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit contribution.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(id: string, decision: 'approved' | 'rejected') {
    setReviewingId(id);
    setFeedback(null);
    try {
      await api.reviewContribution(id, decision, reviewNote);
      setReviewNote('');
      setFeedback({
        type: 'success',
        text: `Contribution ${decision === 'approved' ? 'approved and added to treasury liquidity' : 'rejected'}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review contribution.',
      });
    } finally {
      setReviewingId(null);
    }
  }

  const filtered = contributions.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.memberName.toLowerCase().includes(q) ||
        c.memberCode.toLowerCase().includes(q) ||
        c.providerName.toLowerCase().includes(q) ||
        c.billingMonth.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <ContributionGoalTracker
        user={user}
        contributions={contributions}
        config={config}
        loading={loading}
        onSubmitContribution={(month) => {
          if (month) {
            setBillingMonth(month);
          }
        }}
      />

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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Submit Contribution Form */}
        <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Submit Capital Deposit
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pay via Bank or MFS and submit your TrxID for Manager approval. Account numbers and
              references are encrypted at rest.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Billing Month
                </label>
                <input
                  type="month"
                  required
                  value={billingMonth}
                  onChange={(e) => setBillingMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Amount ({ccy})
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Payment Channel
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setChannel('mfs');
                    setProviderName(MFS_PROVIDERS[0]);
                  }}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    channel === 'mfs'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  MFS (Mobile Wallet)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannel('bank');
                    setProviderName(BANK_PROVIDERS[0]);
                  }}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    channel === 'bank'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Bank Transfer
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'MFS Provider' : 'Bank Name'}
              </label>
              <select
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                {(channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'Sender Mobile Number' : 'Sender Account / Routing Ref'}
              </label>
              <input
                type="text"
                required
                value={senderAccount}
                onChange={(e) => setSenderAccount(e.target.value)}
                placeholder={channel === 'mfs' ? '017XX-XXXXXX' : '2050-XXXX-XXXX'}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {channel === 'mfs' ? 'MFS TrxID' : 'Bank Reference / Slip Number'}
              </label>
              <input
                type="text"
                required
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                placeholder={channel === 'mfs' ? 'e.g. BKX9984120A' : 'e.g. IBBL-BEFTN-8821'}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Optional Note
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Branch or transfer remark"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-60 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Encrypting & Submitting…' : 'Submit for Manager Approval'}</span>
            </button>
          </form>
        </section>

        {/* Encrypted Ledger & Manager Approval Queue */}
        <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isReviewer ? 'Cooperative Contribution Ledger & Approval Queue' : 'Your Encrypted Contribution History'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Click any entry to inspect the AES-256-GCM encrypted envelope and SHA-256 hash
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search member or bank…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      filter === tab
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isReviewer && filtered.some((c) => c.status === 'pending') && (
            <div className="mb-4 flex items-center gap-3">
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Optional manager review remark before clicking Approve / Reject…"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={44} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No contribution records match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Member</th>
                    <th className="py-2.5 pr-4">Month</th>
                    <th className="py-2.5 pr-4">Channel & Ref</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filtered.map((item) => {
                    const isExpanded = expandedId === item.id;
                    return (
                      <tr key={item.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td colSpan={6} className="p-0">
                          <div className="grid grid-cols-12 items-center py-3 gap-2">
                            <div className="col-span-12 sm:col-span-3 pr-2">
                              <div className="font-medium text-slate-900 dark:text-white truncate">
                                {item.memberName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {item.memberCode}
                              </div>
                            </div>

                            <div className="col-span-4 sm:col-span-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                              {formatBillingMonth(item.billingMonth)}
                            </div>

                            <div className="col-span-8 sm:col-span-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {item.providerName}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="uppercase">{item.channel}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono">{item.maskedReference}</span>
                            </div>

                            <div className="col-span-4 sm:col-span-1 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {formatMoney(item.amount, ccy)}
                            </div>

                            <div className="col-span-4 sm:col-span-2 sm:pl-3">
                              <StatusText status={item.status} />
                            </div>

                            <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1.5">
                              {isReviewer && item.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    title="Approve contribution"
                                    disabled={reviewingId === item.id}
                                    onClick={() => handleReview(item.id, 'approved')}
                                    className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Reject contribution"
                                    disabled={reviewingId === item.id}
                                    onClick={() => handleReview(item.id, 'rejected')}
                                    className="p-1.5 rounded-md border border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isExpanded ? 'Hide' : 'Crypto'}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mb-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                                  <Shield className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                  <span>Authorized Decrypted Payload & Ciphertext Envelope</span>
                                </span>
                                <span className="font-mono">
                                  Submitted {formatDateTime(item.submittedAt)}
                                </span>
                              </div>

                              {item.decryptedDetails ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
                                  <div>
                                    <span className="text-slate-500 block">Reference / TrxID</span>
                                    <span className="text-slate-900 dark:text-white">
                                      {item.decryptedDetails.referenceId}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Sender Account</span>
                                    <span className="text-slate-900 dark:text-white">
                                      {item.decryptedDetails.senderAccount}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Notes</span>
                                    <span className="text-slate-900 dark:text-white font-sans">
                                      {item.decryptedDetails.notes || '—'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-slate-500 italic">
                                  Decrypted details restricted to transaction owner, Manager, and Admin.
                                </div>
                              )}

                              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all space-y-1">
                                <div>
                                  AES-256-GCM Ciphertext: {item.encryptedDetails.ciphertext.slice(0, 72)}… (IV: {item.encryptedDetails.iv.slice(0, 12)}…)
                                </div>
                                <div>SHA-256 Entry Hash: {shortHash(item.entryHash)}</div>
                                {item.reviewerName && (
                                  <div className="font-sans text-slate-600 dark:text-slate-300">
                                    Reviewed by {item.reviewerName} on {formatDateTime(item.reviewedAt)} — {item.reviewNote}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
