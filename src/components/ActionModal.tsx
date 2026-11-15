'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
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
  tone?: 'emerald' | 'amber' | 'red' | 'slate';
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
  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('ActionModal');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setInputValue(initialInputValue);
      setInputError(null);
    }
  }, [open, initialInputValue, title]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    const token = modalTokenRef.current;
    const unregister = registerTopModal(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token) && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, busy, onClose]);

  const Icon =
    mode === 'notice'
      ? tone === 'red'
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

  const iconBoxClass =
    tone === 'red'
      ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400'
      : tone === 'amber'
        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
        : tone === 'slate'
          ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400';

  const confirmBtnClass =
    tone === 'red'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'amber'
        ? 'bg-amber-600 hover:bg-amber-700 text-white'
        : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'notice') {
      onClose();
      return;
    }
    const trimmed = inputValue.trim();
    if (inputLabel && inputRequired && !trimmed) {
      setInputError(`Please enter ${inputLabel.toLowerCase()} before continuing.`);
      return;
    }
    setInputError(null);
    if (onConfirm) {
      await onConfirm(trimmed);
    } else {
      onClose();
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
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => {
              if (!busy) onClose();
            }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16 }}
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
          >
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBoxClass}`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
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

                {!busy && (
                  <button
                    type="button"
                    onClick={onClose}
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
                      disabled={busy}
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
                      disabled={busy}
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
                    disabled={busy}
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className={`px-4 py-2 rounded-lg text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 ${confirmBtnClass}`}
                >
                  {busy ? 'Processing…' : confirmLabel}
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
