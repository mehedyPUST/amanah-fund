'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';

interface RequestQardHasanLoanFormProps {
  user: PublicUser;
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  onSubmitted: (loan: LoanRequest) => Promise<void> | void;
}

const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay'];
const BANK_PROVIDERS = [
  'Islami Bank Bangladesh',
  'Dutch-Bangla Bank',
  'City Bank',
  'Bank Asia',
  'Standard Chartered',
];

export function RequestQardHasanLoanForm({
  user,
  eligibility,
  config,
  availableLiquidity,
  onSubmitted,
}: RequestQardHasanLoanFormProps) {
  const ccy = config?.currency || 'BDT';
  const maxLoanAmount = config?.maxLoanAmount || 75000;
  const maxInstallmentMonths = config?.maxInstallmentMonths || 12;

  const isVerifiedMember = user.status === 'active';
  const canSubmit = isVerifiedMember && Boolean(eligibility?.eligible);

  const [amount, setAmount] = useState(String(Math.min(20000, maxLoanAmount)));
  const [installmentMonths, setInstallmentMonths] = useState(
    String(Math.min(6, maxInstallmentMonths))
  );
  const [purpose, setPurpose] = useState('');
  const [emergencyContext, setEmergencyContext] = useState('');
  const [channel, setChannel] = useState<'bank' | 'mfs'>('mfs');
  const [provider, setProvider] = useState(MFS_PROVIDERS[0]);
  const [disbursementAccount, setDisbursementAccount] = useState('');
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLoan, setCreatedLoan] = useState<LoanRequest | null>(null);

  const parsedAmount = Math.max(0, Number(amount) || 0);
  const parsedMonths = Math.min(
    maxInstallmentMonths,
    Math.max(1, Math.floor(Number(installmentMonths) || 1))
  );

  const schedulePreview = useMemo(() => {
    if (parsedAmount <= 0 || parsedMonths < 1) return [];
    const base = Math.floor((parsedAmount / parsedMonths) * 100) / 100;
    return Array.from({ length: parsedMonths }, (_, idx) => {
      const due = new Date();
      due.setMonth(due.getMonth() + idx + 1);
      due.setDate(15);
      const isLast = idx === parsedMonths - 1;
      const instAmount = isLast
        ? Math.round((parsedAmount - base * (parsedMonths - 1)) * 100) / 100
        : base;
      return {
        installmentNumber: idx + 1,
        dueDate: due.toISOString().slice(0, 10),
        amount: instAmount,
      };
    });
  }, [parsedAmount, parsedMonths]);

  const monthlyInstallmentPreview =
    schedulePreview.length > 0 ? schedulePreview[0].amount : 0;

  const presetAmounts = useMemo(() => {
    const candidates = [10000, 25000, 50000, maxLoanAmount];
    return Array.from(
      new Set(candidates.filter((v) => v >= 500 && v <= maxLoanAmount))
    ).slice(0, 4);
  }, [maxLoanAmount]);

  const durationPresets = useMemo(() => {
    const candidates = [3, 6, 9, 12, maxInstallmentMonths];
    return Array.from(
      new Set(candidates.filter((m) => m >= 1 && m <= maxInstallmentMonths))
    ).slice(0, 4);
  }, [maxInstallmentMonths]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedLoan(null);

    if (!isVerifiedMember) {
      setError('Only administrator-verified active members can request a Qard Hasan loan.');
      return;
    }
    if (!eligibility?.eligible) {
      setError(
        eligibility?.reasons?.[0] ||
          'You do not currently meet the cooperative loan eligibility criteria.'
      );
      return;
    }
    if (parsedAmount < 100 || parsedAmount > maxLoanAmount) {
      setError(
        `Requested amount must be between ${formatMoney(100, ccy)} and ${formatMoney(maxLoanAmount, ccy)}.`
      );
      return;
    }
    if (!purpose.trim() || !disbursementAccount.trim() || !provider.trim()) {
      setError('Please complete the loan purpose and payout account details.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.requestLoan({
        amount: parsedAmount,
        installmentMonths: parsedMonths,
        purpose: purpose.trim(),
        emergencyContext: emergencyContext.trim() || undefined,
        channel,
        provider: provider.trim(),
        disbursementAccount: disbursementAccount.trim(),
      });
      setCreatedLoan(res.loan);
      setPurpose('');
      setEmergencyContext('');
      setDisbursementAccount('');
      setShowSchedulePreview(false);
      await onSubmitted(res.loan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Qard Hasan loan request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Request Qard Hasan Loan Form"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {isVerifiedMember
                ? `Verified Member · ${user.memberCode}`
                : 'Account Pending Verification'}
            </span>
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400">0% Interest</span>
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Request Qard Hasan Loan
        </h3>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Max cap {formatMoney(maxLoanAmount, ccy)} · Liquid pool{' '}
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
            {formatMoney(availableLiquidity, ccy)}
          </span>
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {createdLoan && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Saved to Database for Administrative Review ({createdLoan.id})</span>
          </div>
          <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
            Requested {formatMoney(createdLoan.amount, ccy)} across {createdLoan.installmentMonths}{' '}
            monthly installments of {formatMoney(createdLoan.monthlyInstallment, ccy)}.
            Administrators and active voters have been notified.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Requested Amount */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="qard-loan-amount"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Requested Amount ({ccy})
            </label>
            <div className="flex items-center gap-1">
              {presetAmounts.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => setAmount(String(preset))}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums border transition-colors cursor-pointer disabled:opacity-50 ${
                    parsedAmount === preset
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset >= 1000 ? `${preset / 1000}k` : preset}
                </button>
              ))}
            </div>
          </div>
          <input
            id="qard-loan-amount"
            type="number"
            min={100}
            max={maxLoanAmount}
            required
            disabled={!canSubmit}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
          {parsedAmount > availableLiquidity && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Note: Requested amount exceeds current liquid pool ({formatMoney(availableLiquidity, ccy)}).
              Submission is saved for administrative review; disbursement awaits sufficient funds.
            </p>
          )}
        </div>

        {/* Purpose */}
        <div>
          <label
            htmlFor="qard-loan-purpose"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Loan Purpose (Visible for Review & Voting)
          </label>
          <input
            id="qard-loan-purpose"
            type="text"
            required
            disabled={!canSubmit}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Family medical expense, tuition fee, urgent repair"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        {/* Repayment Plan */}
        <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="qard-loan-months"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Repayment Plan (Months)
            </label>
            <div className="flex items-center gap-1">
              {durationPresets.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => setInstallmentMonths(String(m))}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums border transition-colors cursor-pointer disabled:opacity-50 ${
                    parsedMonths === m
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <input
            id="qard-loan-months"
            type="number"
            min={1}
            max={maxInstallmentMonths}
            required
            disabled={!canSubmit}
            value={installmentMonths}
            onChange={(e) => setInstallmentMonths(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Monthly Installment</span>
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(monthlyInstallmentPreview, ccy)} / mo
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Total Repayable ({parsedMonths} installments · 0% interest)</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {formatMoney(parsedAmount, ccy)}
              </span>
            </div>

            {schedulePreview.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSchedulePreview((prev) => !prev)}
                className="w-full pt-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  <span>
                    {showSchedulePreview
                      ? 'Hide Repayment Schedule Preview'
                      : `Preview ${schedulePreview.length}-Month Repayment Schedule`}
                  </span>
                </span>
                {showSchedulePreview ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            )}

            {showSchedulePreview && schedulePreview.length > 0 && (
              <div className="pt-2 space-y-1 max-h-40 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 font-mono text-[11px] tabular-nums">
                {schedulePreview.map((item) => (
                  <div key={item.installmentNumber} className="py-1 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">
                      #{item.installmentNumber} · {formatShortDate(item.dueDate)}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {formatMoney(item.amount, ccy)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payout Channel & Account */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="qard-loan-channel"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Payout Channel
            </label>
            <select
              id="qard-loan-channel"
              disabled={!canSubmit}
              value={channel}
              onChange={(e) => {
                const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                setChannel(ch);
                setProvider(ch === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
            >
              <option value="mfs">MFS (Wallet)</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="qard-loan-provider"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Provider
            </label>
            <select
              id="qard-loan-provider"
              disabled={!canSubmit}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
            >
              {(channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="qard-loan-account"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Payout Account / Wallet Number (Encrypted)
          </label>
          <input
            id="qard-loan-account"
            type="text"
            required
            disabled={!canSubmit}
            value={disbursementAccount}
            onChange={(e) => setDisbursementAccount(e.target.value)}
            placeholder={channel === 'mfs' ? '017XX-XXXXXX' : 'Bank Account Number'}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="qard-loan-context"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Confidential Review Notes (Encrypted for Admin & Treasury)
          </label>
          <textarea
            id="qard-loan-context"
            rows={2}
            disabled={!canSubmit}
            value={emergencyContext}
            onChange={(e) => setEmergencyContext(e.target.value)}
            placeholder="Optional supporting context for administrative review (encrypted at rest)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            {!isVerifiedMember
              ? 'Member Account Verification Required'
              : !eligibility?.eligible
                ? 'Eligibility Requirements Not Met'
                : submitting
                  ? 'Saving Request…'
                  : 'Submit for Administrative Review'}
          </span>
        </button>
      </form>
    </section>
  );
}
