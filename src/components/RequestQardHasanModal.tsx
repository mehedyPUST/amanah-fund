'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ShieldCheck, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { EligibilityCheck, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney } from '../utils/format.ts';
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
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
  eligibility: eligibilityProp,
  config,
  availableLiquidity,
  onSubmitted,
}: RequestQardHasanModalProps) {
  const ccy = config?.currency || 'BDT';
  const maxLoanAmount = config?.maxLoanAmount || 75000;
  const maxInstallmentMonths = config?.maxInstallmentMonths || 12;

  const [mounted, setMounted] = useState(false);
  const [fetchedEligibility, setFetchedEligibility] = useState<EligibilityCheck | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [eligibilityAttempt, setEligibilityAttempt] = useState(0);
  const effectiveEligibility = eligibilityProp ?? fetchedEligibility;
  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('RequestQardHasanModal');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || eligibilityProp || user.role === 'admin' || user.status !== 'active') return;
    let cancelled = false;
    setEligibilityError(null);
    api
      .getEligibility()
      .then((res) => {
        if (!cancelled) {
          setFetchedEligibility(res.eligibility);
          setEligibilityError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEligibilityError(
            err instanceof Error ? err.message : 'Unable to verify loan eligibility.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, eligibilityProp, user.role, user.status, eligibilityAttempt]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    const token = modalTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-qard-hasan-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
          >
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

            <div className="px-5 sm:px-6 py-5 overflow-y-auto space-y-4">
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
                    {effectiveEligibility ? (
                      `${effectiveEligibility.loansUsedThisYear} / ${effectiveEligibility.maxLoansPerYear} used`
                    ) : eligibilityError ? (
                      <button
                        type="button"
                        onClick={() => setEligibilityAttempt((c) => c + 1)}
                        className="text-red-600 dark:text-red-400 underline cursor-pointer"
                      >
                        Retry check
                      </button>
                    ) : (
                      'Checking…'
                    )}
                  </div>
                </div>
              </div>

              {effectiveEligibility && !effectiveEligibility.eligible && (
                <div
                  role="alert"
                  className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1"
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                    <span>Loan Eligibility Locked</span>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    {effectiveEligibility.reasons[0] ||
                      'Your account does not currently meet the cooperative loan eligibility rules.'}
                  </p>
                </div>
              )}

              {effectiveEligibility?.eligible && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    Eligible: Passed active loan check, annual quota, and pre-maturity governance window.
                  </span>
                </div>
              )}

              <RequestQardHasanLoanForm
                user={user}
                eligibility={effectiveEligibility}
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
    </AnimatePresence>,
    document.body
  );
}
