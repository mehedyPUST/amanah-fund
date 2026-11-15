'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  computeInstallmentDueDate,
  formatMoney,
  formatShortDate,
} from '../utils/format.ts';

interface RequestQardHasanLoanFormProps {
  user: PublicUser;
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  variant?: 'card' | 'modal';
  onClose?: () => void;
  onSubmitted: (loan: LoanRequest) => Promise<void> | void;
}

export function RequestQardHasanLoanForm({
  user,
  eligibility,
  config,
  availableLiquidity,
  variant = 'card',
  onClose,
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
  const [provider, setProvider] = useState<string>(MFS_PROVIDERS[0]);
  const [disbursementAccount, setDisbursementAccount] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);

  const amountEditedRef = useRef(false);
  const monthsEditedRef = useRef(false);

  useEffect(() => {
    if (!config) return;
    if (!amountEditedRef.current) {
      setAmount(String(Math.min(20000, config.maxLoanAmount)));
    }
    if (!monthsEditedRef.current) {
      setInstallmentMonths(String(Math.min(6, config.maxInstallmentMonths)));
    }
  }, [config]);

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
    const anchor = new Date();
    return Array.from({ length: parsedMonths }, (_, idx) => {
      const isLast = idx === parsedMonths - 1;
      const instAmount = isLast
        ? Math.round((parsedAmount - base * (parsedMonths - 1)) * 100) / 100
        : base;
      return {
        installmentNumber: idx + 1,
        dueDate: computeInstallmentDueDate(anchor, idx + 1),
        amount: instAmount,
      };
    });
  }, [parsedAmount, parsedMonths]);

  const monthlyInstallmentPreview =
    schedulePreview.length > 0 ? schedulePreview[0].amount : 0;
  const firstDueDate = schedulePreview[0]?.dueDate;
  const finalDueDate =
    schedulePreview.length > 0 ? schedulePreview[schedulePreview.length - 1].dueDate : undefined;

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
    if (!agreedToTerms) {
      setError('Please confirm the 0% interest Qard Hasan terms and repayment commitment.');
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
      setAgreedToTerms(false);
      setShowSchedulePreview(false);
      await onSubmitted(res.loan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Qard Hasan loan request.');
    } finally {
      setSubmitting(false);
    }
  }

  const wrapperClass =
    variant === 'modal'
      ? 'space-y-4'
      : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200';

  return (
    <section aria-label="Request Qard Hasan Loan Form" className={wrapperClass}>
      {variant === 'card' && (
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
      )}

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {createdLoan && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 space-y-2"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Submitted for Review &amp; 2/3 Anonymized Ballot ({createdLoan.id})</span>
          </div>
          <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
            Requested {formatMoney(createdLoan.amount, ccy)} across {createdLoan.installmentMonths}{' '}
            monthly installments of {formatMoney(createdLoan.monthlyInstallment, ccy)}.
            Administrators and active voters have been notified.
          </p>
          {onClose && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Requested Amount */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`qard-loan-amount-${variant}`}
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
                  onClick={() => {
                    amountEditedRef.current = true;
                    setAmount(String(preset));
                  }}
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
            id={`qard-loan-amount-${variant}`}
            type="number"
            min={100}
            max={maxLoanAmount}
            required
            disabled={!canSubmit}
            value={amount}
            onChange={(e) => {
              amountEditedRef.current = true;
              setAmount(e.target.value);
            }}
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
            htmlFor={`qard-loan-purpose-${variant}`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Loan Purpose (Visible for Review &amp; Anonymized Voting)
          </label>
          <input
            id={`qard-loan-purpose-${variant}`}
            type="text"
            required
            disabled={!canSubmit}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Family medical expense, tuition fee, urgent repair"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        {/* Preferred Repayment Timeline */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`qard-loan-months-${variant}`}
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Preferred Repayment Timeline (Months)
            </label>
            <div className="flex items-center gap-1">
              {durationPresets.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => {
                    monthsEditedRef.current = true;
                    setInstallmentMonths(String(m));
                  }}
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
            id={`qard-loan-months-${variant}`}
            type="number"
            min={1}
            max={maxInstallmentMonths}
            required
            disabled={!canSubmit}
            value={installmentMonths}
            onChange={(e) => {
              monthsEditedRef.current = true;
              setInstallmentMonths(e.target.value);
            }}
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
            {firstDueDate && finalDueDate && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Projected Timeline</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {formatShortDate(firstDueDate)} → {formatShortDate(finalDueDate)}
                </span>
              </div>
            )}

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
              htmlFor={`qard-loan-channel-${variant}`}
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Payout Channel
            </label>
            <select
              id={`qard-loan-channel-${variant}`}
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
              htmlFor={`qard-loan-provider-${variant}`}
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Provider
            </label>
            <select
              id={`qard-loan-provider-${variant}`}
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
            htmlFor={`qard-loan-account-${variant}`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Payout Account / Wallet Number (AES-256-GCM Encrypted)
          </label>
          <input
            id={`qard-loan-account-${variant}`}
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
            htmlFor={`qard-loan-context-${variant}`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Confidential Review Notes (Encrypted for Admin &amp; Treasury)
          </label>
          <textarea
            id={`qard-loan-context-${variant}`}
            rows={2}
            disabled={!canSubmit}
            value={emergencyContext}
            onChange={(e) => setEmergencyContext(e.target.value)}
            placeholder="Optional supporting context for administrative review (encrypted at rest)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canSubmit}
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600/30 disabled:opacity-50 cursor-pointer"
          />
          <span className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            I confirm this is a <strong className="text-slate-800 dark:text-slate-200">0% interest Qard Hasan</strong> request, verify that my encrypted payout details are accurate, and commit to completing the {parsedMonths}-month repayment timeline upon 2/3 member approval.
          </span>
        </label>

        <div className="flex items-center gap-2.5">
          {variant === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit || submitting || !agreedToTerms}
            className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-500 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {!isVerifiedMember
                ? 'Member Account Verification Required'
                : !eligibility?.eligible
                  ? 'Eligibility Requirements Not Met'
                  : submitting
                    ? 'Encrypting & Submitting…'
                    : 'Submit Secure Qard Hasan Request'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
