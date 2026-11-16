'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  inputMultiline?: boolean;
  initialInputValue?: string;
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
  confirmLabel = mode === 'notice' ? 'OK, Got It' : 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  inputMultiline = false,
  initialInputValue = '',
  onConfirm,
  onClose,
}: ActionModalProps) {
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

  const isCircleSuccess =
    mode === 'notice' && (tone === 'emerald' || tone === 'teal');

  const Icon =
    mode === 'notice'
      ? isCircleSuccess
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

  const iconBoxClass = isCircleSuccess
    ? tone === 'teal'
      ? 'w-10 h-10 rounded-full bg-teal-600 text-white border-teal-500 shadow-xs ring-4 ring-teal-100 dark:ring-teal-950/60'
      : 'w-10 h-10 rounded-full bg-emerald-600 text-white border-emerald-500 shadow-xs ring-4 ring-emerald-100 dark:ring-emerald-950/60'
    : tone === 'red'
      ? 'w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400'
      : tone === 'amber'
        ? 'w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
        : tone === 'indigo'
          ? 'w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400'
          : tone === 'teal'
            ? 'w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60 text-teal-600 dark:text-teal-400'
            : tone === 'slate'
              ? 'w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              : 'w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400';

  const confirmBtnClass =
    tone === 'red'
      ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white'
      : tone === 'amber'
        ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white'
        : tone === 'indigo'
          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white'
          : tone === 'teal'
            ? 'bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white'
            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white';

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
      setInputError(`Please enter ${inputLabel.toLowerCase()} before continuing.`);
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
            transition={{ duration: 0.14 }}
            onClick={() => {
              if (!isBusy) onCloseRef.current();
            }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
          >
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`border flex items-center justify-center shrink-0 ${iconBoxClass}`}
                  >
                    <Icon
                      className={isCircleSuccess ? 'w-5 h-5 stroke-[2.75]' : 'w-5 h-5'}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3
                      id="action-modal-title"
                      className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-snug"
                    >
                      {title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                      {description}
                    </p>
                  </div>
                </div>

                {!isBusy && (
                  <button
                    type="button"
                    onClick={() => onCloseRef.current()}
                    aria-label="Close dialog"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {details && details.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                  {details.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className="px-3.5 py-2 flex items-center justify-between gap-3"
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

              {mode === 'confirm' && inputLabel && (
                <div className="space-y-1.5">
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
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
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
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    />
                  )}
                  {inputError && (
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                      {inputError}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {mode === 'confirm' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onCloseRef.current()}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isBusy}
                  className={`px-4 py-2 rounded-lg text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 ${confirmBtnClass}`}
                >
                  {isBusy ? 'Processing…' : confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
