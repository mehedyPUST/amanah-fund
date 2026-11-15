'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type {
  ActiveMemberDirectoryItem,
  EligibilityCheck,
  FundConfig,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  BANK_PROVIDERS,
  MFS_PROVIDERS,
  computeInstallmentDueDate,
  formatMoney,
  formatShortDate,
} from '../utils/format.ts';
import { ProviderSelect } from './ProviderSelect.tsx';

interface RequestQardHasanLoanFormProps {
  user: PublicUser;
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  variant?: 'card' | 'modal';
  onClose?: () => void;
  onSubmitted: (loan: LoanRequest) => Promise<void> | void;
}

type LoanSubmitPayload = {
  amount: number;
  installmentMonths: number;
  purpose: string;
  emergencyContext?: string;
  channel: 'bank' | 'mfs';
  provider: string;
  disbursementAccount: string;
  guarantorIds?: string[];
};

/** Inline banner state — no nested ActionModal (nested portals were breaking submit). */
type FormFeedback =
  | { kind: 'error'; title: string; message: string }
  | { kind: 'success'; title: string; message: string; loanId: string };

export function RequestQardHasanLoanForm({
  user,
  eligibility: eligibilityProp,
  config,
  availableLiquidity,
  variant = 'card',
  onClose,
  onSubmitted,
}: RequestQardHasanLoanFormProps) {
  const ccy = config?.currency || 'BDT';
  const maxLoanAmount = config?.maxLoanAmount || 75000;
  const maxInstallmentMonths = config?.maxInstallmentMonths || 12;

  const [localEligibility, setLocalEligibility] = useState<EligibilityCheck | null>(null);
  const [eligibilityChecking, setEligibilityChecking] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [eligibilityRetryKey, setEligibilityRetryKey] = useState(0);

  const eligibility = eligibilityProp ?? localEligibility;

  useEffect(() => {
    if (eligibilityProp || user.role === 'admin' || user.status !== 'active') return;
    let cancelled = false;
    setEligibilityChecking(true);
    setEligibilityError(null);
    api
      .getEligibility()
      .then((res) => {
        if (!cancelled) {
          setLocalEligibility(res.eligibility);
          setEligibilityError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEligibilityError(
            err instanceof Error ? err.message : 'Unable to verify cooperative loan eligibility.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setEligibilityChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eligibilityProp, user.role, user.status, eligibilityRetryKey]);

  const isVerifiedMember = user.status === 'active';

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
  const [termsHighlight, setTermsHighlight] = useState(false);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [activeMembers, setActiveMembers] = useState<ActiveMemberDirectoryItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersRetryKey, setMembersRetryKey] = useState(0);
  const [selectedGuarantorIds, setSelectedGuarantorIds] = useState<string[]>([]);

  const amountEditedRef = useRef(false);
  const monthsEditedRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!config) return;
    if (!amountEditedRef.current) {
      setAmount(String(Math.min(20000, config.maxLoanAmount)));
    }
    if (!monthsEditedRef.current) {
      setInstallmentMonths(String(Math.min(6, config.maxInstallmentMonths)));
    }
  }, [config]);

  const loadMembers = useCallback(() => {
    setMembersRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!isVerifiedMember) return;
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    api
      .getActiveMembers()
      .then((res) => {
        if (!cancelled) {
          // Admin is never a guarantor or participant in cooperative loans
          const eligibleGuarantors = res.members.filter(
            (m) => m.id !== user.id && m.role !== 'admin'
          );
          setActiveMembers(eligibleGuarantors);
          setSelectedGuarantorIds((prev) =>
            prev.filter((id) => eligibleGuarantors.some((m) => m.id === id))
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setActiveMembers([]);
          setMembersError(
            err instanceof Error ? err.message : 'Unable to load active member guarantors.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isVerifiedMember, user.id, membersRetryKey]);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  /** Only lock inputs for unverified accounts or while an API call is in flight.
   *  Eligibility must NOT freeze the form — users need to fill fields while the
   *  check runs, and the server is the source of truth on submit. */
  const fieldsLocked = !isVerifiedMember || submitting;
  const canAttemptSubmit = isVerifiedMember && !submitting;

  const rawAmount = Number(amount);
  const parsedAmount = Number.isFinite(rawAmount)
    ? Math.max(0, Math.round(rawAmount * 100) / 100)
    : 0;
  const rawMonths = Number(installmentMonths);
  const parsedMonths = Math.min(
    maxInstallmentMonths,
    Math.max(1, Math.floor(Number.isFinite(rawMonths) ? rawMonths : 1))
  );
  const guarantorThreshold = config?.guarantorThresholdAmount ?? 40000;
  const requiredGuarantorsCount = config?.requiredGuarantorsCount ?? 1;
  const exceedsGuarantorThreshold =
    parsedAmount > guarantorThreshold && requiredGuarantorsCount > 0;
  const needsGuarantors = exceedsGuarantorThreshold && activeMembers.length > 0;
  const effectiveRequiredGuarantors = Math.min(requiredGuarantorsCount, activeMembers.length);
  const validSelectedGuarantorIds = useMemo(
    () =>
      selectedGuarantorIds.filter((id) => activeMembers.some((member) => member.id === id)),
    [selectedGuarantorIds, activeMembers]
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

  function showError(title: string, message: string) {
    setFeedback({ kind: 'error', title, message });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (submittingRef.current) return;

    setFeedback(null);

    if (!isVerifiedMember) {
      showError(
        'Verification Required',
        'Only administrator-verified active members can request a Qard Hasan loan.'
      );
      return;
    }

    // Prefer live eligibility; if still loading/missing, ask the server (source of truth).
    let eligibilityGate = eligibility;
    if (!eligibilityGate) {
      try {
        const res = await api.getEligibility();
        eligibilityGate = res.eligibility;
        setLocalEligibility(res.eligibility);
      } catch (err) {
        showError(
          'Eligibility Check Failed',
          err instanceof Error ? err.message : 'Unable to verify cooperative loan eligibility.'
        );
        return;
      }
    }
    if (!eligibilityGate.eligible) {
      showError(
        'Eligibility Requirements Not Met',
        eligibilityGate.reasons?.[0] ||
          'You do not currently meet the cooperative loan eligibility criteria.'
      );
      return;
    }
    if (!Number.isFinite(rawAmount) || parsedAmount < 100 || parsedAmount > maxLoanAmount) {
      showError(
        'Invalid Requested Amount',
        `Requested amount must be between ${formatMoney(100, ccy)} and ${formatMoney(maxLoanAmount, ccy)}.`
      );
      return;
    }
    const months = Math.trunc(Number(installmentMonths));
    if (
      !Number.isFinite(months) ||
      months < 1 ||
      months > maxInstallmentMonths
    ) {
      showError(
        'Invalid Repayment Duration',
        `Repayment duration must be a whole number between 1 and ${maxInstallmentMonths} months.`
      );
      return;
    }
    if (!purpose.trim() || !disbursementAccount.trim() || !provider.trim()) {
      showError(
        'Missing Required Fields',
        'Please complete the loan purpose, bank/MFS provider, and payout account number.'
      );
      return;
    }
    if (exceedsGuarantorThreshold) {
      if (membersLoading) {
        showError(
          'Loading Guarantor Directory',
          'Please wait a moment while active cooperative members load so you can select co-signing guarantor(s).'
        );
        return;
      }
      if (membersError) {
        showError(
          'Guarantor Directory Unavailable',
          `${membersError} Please retry loading the member list before submitting a request above ${formatMoney(guarantorThreshold, ccy)}.`
        );
        return;
      }
      if (needsGuarantors && validSelectedGuarantorIds.length < effectiveRequiredGuarantors) {
        showError(
          'Guarantors Required',
          `Requests above ${formatMoney(guarantorThreshold, ccy)} require ${effectiveRequiredGuarantors} co-signing guarantor member(s).`
        );
        return;
      }
    }
    if (!agreedToTerms) {
      setTermsHighlight(true);
      showError(
        'Commitment Required',
        'Please confirm the 0% interest Qard Hasan terms and repayment commitment checkbox before submitting.'
      );
      return;
    }

    const payload: LoanSubmitPayload = {
      amount: parsedAmount,
      installmentMonths: months,
      purpose: purpose.trim(),
      emergencyContext: emergencyContext.trim() || undefined,
      channel,
      provider: provider.trim() || (channel === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]),
      disbursementAccount: disbursementAccount.trim(),
      guarantorIds: needsGuarantors ? [...validSelectedGuarantorIds] : undefined,
    };

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await api.requestLoan(payload);
      const created = res.loan;
      setPurpose('');
      setEmergencyContext('');
      setDisbursementAccount('');
      setSelectedGuarantorIds([]);
      setAgreedToTerms(false);
      setTermsHighlight(false);
      setShowSchedulePreview(false);

      setFeedback({
        kind: 'success',
        title: `Qard Hasan Request Submitted (${created.id})`,
        message:
          'Your payout details are AES-256-GCM encrypted. The application is now in Manager Desk — a manager will initiate the 2/3 secret ballot. Track status on your dashboard as an active request.',
        loanId: created.id,
      });

      try {
        await onSubmitted(created);
      } catch (refreshErr) {
        console.error('Loan created but dashboard refresh failed:', refreshErr);
      }

      // In the header modal variant, close the parent after a successful placement
      // so the member lands on the refreshed Qard Hasan list.
      if (variant === 'modal' && onClose) {
        window.setTimeout(() => onClose(), 1200);
      }
    } catch (err) {
      showError(
        'Could Not Place Qard Hasan Request',
        err instanceof Error ? err.message : 'An unexpected error occurred while saving your request.'
      );
    } finally {
      submittingRef.current = false;
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

      {eligibilityError && !eligibility && (
        <div
          role="alert"
          className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300 flex items-center justify-between gap-3"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{eligibilityError}</span>
          </span>
          <button
            type="button"
            onClick={() => setEligibilityRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1 font-medium underline shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {feedback?.kind === 'error' && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 text-xs text-red-900 dark:text-red-200 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>{feedback.title}</span>
          </div>
          <p className="text-red-800 dark:text-red-300 leading-relaxed">{feedback.message}</p>
        </div>
      )}

      {feedback?.kind === 'success' && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{feedback.title}</span>
          </div>
          <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">{feedback.message}</p>
          <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
            Application ID · {feedback.loanId}
          </p>
        </div>
      )}

      {variant === 'card' && eligibility && !eligibility.eligible && (
        <div
          role="alert"
          className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
            <span>Loan Placement Locked</span>
          </div>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
            {eligibility.reasons[0] ||
              'Your account does not currently meet the cooperative loan eligibility rules.'}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
                  disabled={fieldsLocked}
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
            step="any"
            required
            disabled={fieldsLocked}
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
            disabled={fieldsLocked}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Family medical expense, tuition fee, urgent repair"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

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
                  disabled={fieldsLocked}
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
            step={1}
            required
            disabled={fieldsLocked}
            value={installmentMonths}
            onChange={(e) => {
              monthsEditedRef.current = true;
              setInstallmentMonths(e.target.value);
            }}
            className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
          {installmentMonths.trim() !== '' &&
            (!Number.isInteger(rawMonths) || rawMonths < 1 || rawMonths > maxInstallmentMonths) && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Enter a whole number between 1 and {maxInstallmentMonths} months.
              </p>
            )}

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`qard-loan-channel-${variant}`}
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Payout Channel
            </label>
            <select
              id={`qard-loan-channel-${variant}`}
              disabled={fieldsLocked}
              value={channel}
              onChange={(e) => {
                const ch = e.target.value === 'bank' ? 'bank' : 'mfs';
                setChannel(ch);
                setProvider(ch === 'mfs' ? MFS_PROVIDERS[0] : BANK_PROVIDERS[0]);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
            >
              <option value="mfs">MFS (Mobile Wallet)</option>
              <option value="bank">Bangladesh Bank Transfer</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`qard-loan-provider-${variant}`}
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {channel === 'mfs' ? 'MFS Wallet Provider' : 'Bangladesh Bank'}
            </label>
            <ProviderSelect
              id={`qard-loan-provider-${variant}`}
              options={channel === 'mfs' ? MFS_PROVIDERS : BANK_PROVIDERS}
              value={provider}
              onChange={setProvider}
              disabled={fieldsLocked}
              placeholder={
                channel === 'mfs'
                  ? 'Search MFS wallet…'
                  : `Search all ${BANK_PROVIDERS.length} BD banks…`
              }
            />
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
            disabled={fieldsLocked}
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
            disabled={fieldsLocked}
            value={emergencyContext}
            onChange={(e) => setEmergencyContext(e.target.value)}
            placeholder="Optional supporting context for administrative review (encrypted at rest)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50"
          />
        </div>

        {exceedsGuarantorThreshold && (needsGuarantors || membersLoading || membersError) && (
          <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/25 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Co-Signing Guarantors Required</span>
              </span>
              {!membersLoading && !membersError && (
                <span className="font-mono text-[11px] text-amber-800 dark:text-amber-300">
                  {validSelectedGuarantorIds.length} / {effectiveRequiredGuarantors} selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              Requests exceeding {formatMoney(guarantorThreshold, ccy)} require{' '}
              {membersLoading || membersError
                ? requiredGuarantorsCount
                : effectiveRequiredGuarantors}{' '}
              active member co-signer(s) before opening for 2/3 ballot voting.
            </p>
            {membersLoading ? (
              <div className="px-3 py-2.5 rounded border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400">
                Loading active member directory…
              </div>
            ) : membersError ? (
              <div className="px-3 py-2.5 rounded border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-950 flex items-center justify-between gap-2 text-[11px] text-red-700 dark:text-red-400">
                <span className="truncate">{membersError}</span>
                <button
                  type="button"
                  onClick={loadMembers}
                  className="inline-flex items-center gap-1 font-medium underline shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>Retry</span>
                </button>
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto divide-y divide-amber-200/60 dark:divide-amber-900/40 rounded border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-950">
                {activeMembers.map((member) => {
                  const checked = validSelectedGuarantorIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          disabled={fieldsLocked}
                          checked={checked}
                          onChange={() =>
                            setSelectedGuarantorIds((prev) =>
                              prev.includes(member.id)
                                ? prev.filter((id) => id !== member.id)
                                : [...prev, member.id]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600/30"
                        />
                        <span className="font-medium text-slate-900 dark:text-white truncate">
                          {member.name}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        {member.memberCode}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label
          className={`flex items-start gap-2.5 p-3 rounded-lg border transition-colors cursor-pointer ${
            termsHighlight && !agreedToTerms
              ? 'border-red-400 dark:border-red-700 bg-red-50/70 dark:bg-red-950/30'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
          }`}
        >
          <input
            type="checkbox"
            disabled={fieldsLocked}
            checked={agreedToTerms}
            onChange={(e) => {
              setAgreedToTerms(e.target.checked);
              if (e.target.checked) setTermsHighlight(false);
            }}
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
            disabled={!canAttemptSubmit}
            className="flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-500 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {!isVerifiedMember
                ? 'Member Account Verification Required'
                : submitting
                  ? 'Encrypting & Submitting…'
                  : eligibilityChecking && !eligibility
                    ? 'Checking Eligibility…'
                    : 'Submit Qard Hasan Request'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}
