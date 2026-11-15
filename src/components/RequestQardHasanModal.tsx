'use client';

import { useEffect } from 'react';
import { Lock, ShieldCheck, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { formatMoney } from '../utils/format.ts';
import { RequestQardHasanLoanForm } from './RequestQardHasanLoanForm.tsx';

interface RequestQardHasanModalProps {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  eligibility: EligibilityCheck | null;
  config: FundConfig | null;
  availableLiquidity: number;
  onSubmitted: (loan: LoanRequest) => Promise<void> | void;
}

export function RequestQardHasanModal({
  open,
  onClose,
  user,
  eligibility,
  config,
  availableLiquidity,
  onSubmitted,
}: RequestQardHasanModalProps) {
  const ccy = config?.currency || 'BDT';
  const maxLoanAmount = config?.maxLoanAmount || 75000;
  const maxInstallmentMonths = config?.maxInstallmentMonths || 12;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-qard-hasan-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
          >
            {/* Secure Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-50/80 via-white to-white dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900 flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    <span>AES-256-GCM Encrypted</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="font-mono">0% Interest Qard Hasan</span>
                </div>
                <h2
                  id="request-qard-hasan-modal-title"
                  className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white"
                >
                  Request Qard Hasan
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.name} (<span className="font-mono">{user.memberCode}</span>) · Cap{' '}
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {formatMoney(maxLoanAmount, ccy)}
                  </span>{' '}
                  · Up to {maxInstallmentMonths} months
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Request Qard Hasan dialog"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="px-5 sm:px-6 py-5 overflow-y-auto space-y-4">
              {/* Live Standing & Pool Strip */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Available Liquid Pool
                  </div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMoney(availableLiquidity, ccy)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Annual Quota Standing
                  </div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {eligibility
                      ? `${eligibility.loansUsedThisYear} / ${eligibility.maxLoansPerYear} used`
                      : 'Checking…'}
                  </div>
                </div>
              </div>

              {eligibility && !eligibility.eligible && (
                <div
                  role="alert"
                  className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1"
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                    <span>Loan Eligibility Locked</span>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    {eligibility.reasons[0] ||
                      'Your account does not currently meet the cooperative loan eligibility rules.'}
                  </p>
                </div>
              )}

              {eligibility?.eligible && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    Eligible: Passed active loan check, annual quota, and pre-maturity governance window.
                  </span>
                </div>
              )}

              <RequestQardHasanLoanForm
                user={user}
                eligibility={eligibility}
                config={config}
                availableLiquidity={availableLiquidity}
                variant="modal"
                onClose={onClose}
                onSubmitted={onSubmitted}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
