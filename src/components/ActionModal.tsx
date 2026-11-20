'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  HelpCircle,
  Info,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';

export interface ActionModalDetailItem {
  label: string;
  value: string;
}

export interface ActionModalProps {
  open: boolean;
  mode: 'confirm' | 'notice';
  tone?: 'emerald' | 'amber' | 'red' | 'slate' | 'indigo' | 'teal';
  title: string;
  description: string;
  details?: ActionModalDetailItem[];
  customContent?: ReactNode;
  maxWidthClass?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  inputMultiline?: boolean;
  initialInputValue?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
  onConfirm?: (inputValue: string) => Promise<void> | void;
  onClose: () => void;
}

export function ActionModal({
  open,
  mode,
  tone = 'emerald',
  title,
  description,
  details,
  customContent,
  maxWidthClass,
  confirmLabel,
  cancelLabel,
  busy = false,
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  inputMultiline = false,
  initialInputValue = '',
  secondaryAction,
  onConfirm,
  onClose,
}: ActionModalProps) {
  const tCommon = useTranslations('Common');
  const resolvedConfirmLabel =
    confirmLabel ?? (mode === 'notice' ? tCommon('done') : tCommon('confirm'));
  const resolvedCancelLabel = cancelLabel ?? tCommon('cancel');
  const [mounted, setMounted] = useState(false);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [inputError, setInputError] = useState<string | null>(null);
  /** Local processing flag so Confirm disables immediately without waiting for parent re-render */
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;

  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('ActionModal');
  }

  // Keep latest callbacks/busy in refs so the Escape listener does not re-bind
  // (and briefly drop the modal stack) on every parent re-render.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(isBusy);
  const onConfirmRef = useRef(onConfirm);
  const modeRef = useRef(mode);
  onCloseRef.current = onClose;
  busyRef.current = isBusy;
  onConfirmRef.current = onConfirm;
  modeRef.current = mode;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setInputValue(initialInputValue);
      setInputError(null);
      setLocalBusy(false);
    }
  }, [open, initialInputValue, title]);

  // Reset local busy when parent takes over the busy flag or mode flips to notice
  useEffect(() => {
    if (busy || mode === 'notice') {
      setLocalBusy(false);
    }
  }, [busy, mode]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    const token = modalTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token) && !busyRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    // Capture phase so a nested ActionModal always wins over a parent modal
    // that also listens for Escape on window.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const isSuccessNotice =
    mode === 'notice' && (tone === 'emerald' || tone === 'teal');

  const Icon =
    mode === 'notice'
      ? isSuccessNotice
        ? Check
        : tone === 'red'
          ? XCircle
          : tone === 'amber'
            ? AlertTriangle
            : tone === 'slate'
              ? Info
              : CheckCircle2
      : tone === 'red'
        ? AlertTriangle
        : tone === 'amber'
          ? AlertTriangle
          : HelpCircle;

  const toneAccent = {
    emerald: {
      ring: 'ring-emerald-100 dark:ring-emerald-950/50',
      glow: 'from-emerald-400/25 via-emerald-500/10 to-transparent',
      bar: 'from-emerald-500 via-emerald-600 to-teal-500',
      iconBg: 'bg-emerald-600',
      iconRing: 'ring-emerald-100 dark:ring-emerald-900/40',
      softBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      softBorder: 'border-emerald-200/80 dark:border-emerald-900/50',
      softText: 'text-emerald-700 dark:text-emerald-300',
      btn: 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20',
    },
    teal: {
      ring: 'ring-teal-100 dark:ring-teal-950/50',
      glow: 'from-teal-400/25 via-teal-500/10 to-transparent',
      bar: 'from-teal-500 via-teal-600 to-emerald-500',
      iconBg: 'bg-teal-600',
      iconRing: 'ring-teal-100 dark:ring-teal-900/40',
      softBg: 'bg-teal-50 dark:bg-teal-950/40',
      softBorder: 'border-teal-200/80 dark:border-teal-900/50',
      softText: 'text-teal-700 dark:text-teal-300',
      btn: 'bg-teal-700 hover:bg-teal-800 text-white shadow-teal-700/20',
    },
    red: {
      ring: 'ring-rose-100 dark:ring-rose-950/40',
      glow: 'from-rose-400/20 via-rose-500/8 to-transparent',
      bar: 'from-rose-500 via-rose-600 to-red-500',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40',
      iconRing: 'ring-rose-100 dark:ring-rose-900/40',
      softBg: 'bg-rose-50 dark:bg-rose-950/30',
      softBorder: 'border-rose-200/80 dark:border-rose-900/50',
      softText: 'text-rose-600 dark:text-rose-400',
      btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
    },
    amber: {
      ring: 'ring-amber-100 dark:ring-amber-950/40',
      glow: 'from-amber-400/20 via-amber-500/8 to-transparent',
      bar: 'from-amber-400 via-amber-500 to-orange-500',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40',
      iconRing: 'ring-amber-100 dark:ring-amber-900/40',
      softBg: 'bg-amber-50 dark:bg-amber-950/30',
      softBorder: 'border-amber-200/80 dark:border-amber-900/50',
      softText: 'text-amber-600 dark:text-amber-400',
      btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
    },
    indigo: {
      ring: 'ring-indigo-100 dark:ring-indigo-950/40',
      glow: 'from-indigo-400/20 via-indigo-500/8 to-transparent',
      bar: 'from-indigo-500 via-indigo-600 to-violet-500',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/40',
      iconRing: 'ring-indigo-100 dark:ring-indigo-900/40',
      softBg: 'bg-indigo-50 dark:bg-indigo-950/30',
      softBorder: 'border-indigo-200/80 dark:border-indigo-900/50',
      softText: 'text-indigo-600 dark:text-indigo-400',
      btn: 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20',
    },
    slate: {
      ring: 'ring-slate-100 dark:ring-slate-800',
      glow: 'from-slate-400/15 via-slate-500/5 to-transparent',
      bar: 'from-slate-400 via-slate-500 to-slate-600',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconRing: 'ring-slate-100 dark:ring-slate-800',
      softBg: 'bg-slate-50 dark:bg-slate-900/60',
      softBorder: 'border-slate-200 dark:border-slate-700',
      softText: 'text-slate-700 dark:text-slate-300',
      btn: 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20',
    },
  }[tone];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (modeRef.current === 'notice') {
      onCloseRef.current();
      return;
    }
    if (busyRef.current) return;

    const trimmed = inputValue.trim();
    if (inputLabel && inputRequired && !trimmed) {
      setInputError(tCommon('pleaseEnterField', { field: inputLabel.toLowerCase() }));
      return;
    }
    setInputError(null);

    const confirmFn = onConfirmRef.current;
    if (confirmFn) {
      setLocalBusy(true);
      try {
        await confirmFn(trimmed);
      } catch (err) {
        console.error('ActionModal onConfirm failed:', err);
      } finally {
        // Parent may keep busy=true; local flag clears when parent busy/mode updates
        setLocalBusy(false);
      }
    } else {
      onCloseRef.current();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              if (!isBusy) onCloseRef.current();
            }}
            className="fixed inset-0 bg-slate-950/55 dark:bg-slate-950/70 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 w-full ${
              maxWidthClass || 'max-w-[26rem]'
            } bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] dark:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] overflow-hidden my-auto flex flex-col max-h-[92vh]`}
          >
            {/* Top accent bar */}
            <div
              className={`h-1 w-full bg-gradient-to-r shrink-0 ${toneAccent.bar}`}
              aria-hidden="true"
            />

            <form
              onSubmit={handleSubmit}
              className="relative flex flex-col min-h-0 max-h-[92vh]"
            >
              {/* Soft radial glow behind success icon */}
              {isSuccessNotice && (
                <div
                  className={`pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-gradient-to-b ${toneAccent.glow} blur-2xl`}
                  aria-hidden="true"
                />
              )}

              <div
                className={`relative p-5 sm:p-6 ${
                  isSuccessNotice ? 'pt-7 sm:pt-8' : ''
                } flex-1 min-h-0 overflow-y-auto`}
              >
                {/* ── SUCCESS NOTICE LAYOUT ── */}
                {isSuccessNotice ? (
                  <div className="flex flex-col items-center text-center space-y-4">
                    {/* Animated check badge */}
                    <div className="relative">
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 18,
                          delay: 0.05,
                        }}
                        className={`relative w-16 h-16 rounded-full ${toneAccent.iconBg} text-white flex items-center justify-center shadow-lg ring-[6px] ${toneAccent.iconRing}`}
                      >
                        <motion.div
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: 0.35, delay: 0.18, ease: 'easeOut' }}
                        >
                          <Check className="w-8 h-8 stroke-[2.75]" aria-hidden="true" />
                        </motion.div>
                      </motion.div>
                      {/* Soft pulse ring */}
                      <motion.div
                        initial={{ scale: 0.85, opacity: 0.5 }}
                        animate={{ scale: 1.35, opacity: 0 }}
                        transition={{
                          duration: 1.1,
                          delay: 0.25,
                          ease: 'easeOut',
                        }}
                        className={`absolute inset-0 rounded-full ${tone === 'teal' ? 'bg-teal-500/30' : 'bg-emerald-500/30'}`}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="space-y-1.5 max-w-[20rem]">
                      <h3
                        id="action-modal-title"
                        className="text-base sm:text-[1.05rem] font-semibold text-slate-900 dark:text-white tracking-tight leading-snug"
                      >
                        {title}
                      </h3>
                      {description ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                          {description}
                        </p>
                      ) : null}
                    </div>

                    {details && details.length > 0 && (
                      <div
                        className={`w-full rounded-xl border ${toneAccent.softBorder} ${toneAccent.softBg} divide-y divide-slate-200/60 dark:divide-slate-800/80 text-left overflow-hidden`}
                      >
                        {details.map((item) => (
                          <div
                            key={`${item.label}-${item.value}`}
                            className="px-3.5 py-2.5 flex items-start justify-between gap-3"
                          >
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 shrink-0 pt-0.5">
                              {item.label}
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-900 dark:text-white text-right break-all">
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Close affordance (top-right) */}
                    {!isBusy && (
                      <button
                        type="button"
                        onClick={() => onCloseRef.current()}
                        aria-label={tCommon('closeDialog')}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  /* ── CONFIRM / NON-SUCCESS NOTICE LAYOUT ── */
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                          tone === 'red'
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400'
                            : tone === 'amber'
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
                              : tone === 'indigo'
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400'
                                : tone === 'teal'
                                  ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60 text-teal-600 dark:text-teal-400'
                                  : tone === 'slate'
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div className="space-y-1 min-w-0 pt-0.5">
                        <h3
                          id="action-modal-title"
                          className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-snug"
                        >
                          {title}
                        </h3>
                        {description ? (
                          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                            {description}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {!isBusy && (
                      <button
                        type="button"
                        onClick={() => onCloseRef.current()}
                        aria-label={tCommon('closeDialog')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* Details for non-success layouts */}
                {!isSuccessNotice && details && details.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/50 divide-y divide-slate-200/70 dark:divide-slate-800 text-xs overflow-hidden">
                    {details.map((item) => (
                      <div
                        key={`${item.label}-${item.value}`}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                      >
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">
                          {item.label}
                        </span>
                        <span className="font-mono font-medium text-slate-900 dark:text-white text-right break-all">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!isSuccessNotice && customContent ? (
                  <div className="mt-4">{customContent}</div>
                ) : null}

                {/* Optional input (confirm mode only) */}
                {mode === 'confirm' && inputLabel && (
                  <div className="mt-4 space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {inputLabel}
                      {inputRequired && <span className="text-red-600 ml-1">*</span>}
                    </label>
                    {inputMultiline ? (
                      <textarea
                        rows={3}
                        required={inputRequired}
                        disabled={isBusy}
                        value={inputValue}
                        onChange={(e) => {
                          setInputValue(e.target.value);
                          if (inputError) setInputError(null);
                        }}
                        placeholder={inputPlaceholder}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-500/60 transition-shadow"
                      />
                    ) : (
                      <input
                        type="text"
                        required={inputRequired}
                        disabled={isBusy}
                        value={inputValue}
                        onChange={(e) => {
                          setInputValue(e.target.value);
                          if (inputError) setInputError(null);
                        }}
                        placeholder={inputPlaceholder}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-500/60 transition-shadow"
                      />
                    )}
                    {inputError && (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {inputError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div
                className={`px-5 sm:px-6 pb-5 sm:pb-6 shrink-0 bg-white dark:bg-slate-900 ${
                  isSuccessNotice
                    ? 'pt-1'
                    : 'pt-3 border-t border-slate-100 dark:border-slate-800/80'
                }`}
              >
                <div
                  className={`flex flex-wrap items-center gap-2.5 ${
                    isSuccessNotice ? 'justify-center' : 'justify-end'
                  }`}
                >
                  {mode === 'confirm' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onCloseRef.current()}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {resolvedCancelLabel}
                    </button>
                  )}
                  {secondaryAction && (
                    <button
                      type="button"
                      disabled={isBusy || secondaryAction.loading}
                      onClick={secondaryAction.onClick}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer disabled:opacity-55"
                    >
                      {secondaryAction.loading && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      )}
                      <span>{secondaryAction.label}</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isBusy}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
                      isSuccessNotice ? 'min-w-[8.5rem]' : ''
                    } ${toneAccent.btn}`}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>{tCommon('processing')}</span>
                      </>
                    ) : (
                      resolvedConfirmLabel
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
