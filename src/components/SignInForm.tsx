'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Lock, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { api } from '../utils/api.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';

export function SignInForm() {
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Success / Notice modal state (circle-tick modal)
  const [noticeModal, setNoticeModal] = useState<{
    tone: 'emerald' | 'red';
    title: string;
    description: string;
    details?: Array<{ label: string; value: string }>;
    confirmLabel?: string;
    redirectHomeOnClose?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!authChecking && user && !noticeModal?.redirectHomeOnClose) {
      router.replace('/');
    }
  }, [authChecking, user, router, noticeModal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setNoticeModal({
        tone: 'emerald',
        title: 'Signed In Successfully',
        description: `Welcome back, ${res.user.name}. Your encrypted cooperative session is now active.`,
        details: [
          { label: 'Member Code', value: res.user.memberCode },
          { label: 'Role', value: res.user.role.toUpperCase() },
        ],
        confirmLabel: 'Continue to Homepage',
        redirectHomeOnClose: true,
      });
      setUser(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenForgotModal() {
    setForgotEmail(email.trim());
    setForgotReason('');
    setForgotError(null);
    setForgotOpen(true);
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);
    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setForgotError('Please enter a valid registered email address.');
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await api.forgotPassword(trimmedEmail, forgotReason.trim() || undefined);
      setForgotOpen(false);
      setNoticeModal({
        tone: 'emerald',
        title: 'Password Reset Request Sent',
        description:
          res.message ||
          'Your forgotten password request has been submitted to cooperative administrators. Once approved, a temporary password will be sent to your email.',
        details: [
          { label: 'Registered Email', value: trimmedEmail },
          { label: 'Status', value: 'Pending Admin Review' },
        ],
        confirmLabel: 'OK, Got It',
        redirectHomeOnClose: false,
      });
    } catch (err) {
      setForgotError(
        err instanceof Error ? err.message : 'Failed to submit password reset request.'
      );
    } finally {
      setForgotSubmitting(false);
    }
  }

  if (authChecking) {
    return (
      <div className="px-2 sm:px-6 lg:px-8 py-8 sm:py-16">
        <div className="max-w-md w-full mx-auto bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <Skeleton width={210} height={14} />
            <Skeleton width="70%" height={28} />
            <Skeleton width="100%" height={14} count={2} />
          </div>
          <div className="space-y-4">
            <Skeleton height={42} borderRadius={8} />
            <Skeleton height={42} borderRadius={8} />
            <Skeleton height={42} borderRadius={8} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-900 dark:text-slate-100 px-2 sm:px-6 lg:px-8 py-8 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="max-w-md w-full mx-auto bg-gradient-to-b from-slate-50/75 via-white/75 to-white/75 dark:from-slate-900/75 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Encrypted Member Portal · HttpOnly JWT</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign In to Treasury
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 text-left">
            Approved members only. Sign in with your registered email and password.
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="signin-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@amanahcoop.org"
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="signin-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <button
                type="button"
                onClick={handleOpenForgotModal}
                className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" aria-hidden="true" />
                <span>Forgot Password?</span>
              </button>
            </div>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 disabled:opacity-60 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>{loading ? 'Signing In…' : 'Sign In to Portal'}</span>
          </button>
        </form>

        <div className="pt-5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-between gap-2">
            <span>Applying as a new member?</span>
            <Link
              href="/signup"
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Create Application</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Modal: Forgot Password Request to Admin */}
      <AnimatePresence>
        {forgotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              className="w-full max-w-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/88 dark:bg-slate-900/88 backdrop-blur-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <KeyRound className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2
                      id="forgot-password-modal-title"
                      className="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      Request Password Reset
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 text-left">
                      Submit a request to cooperative admins to generate and email a temporary password.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !forgotSubmitting && setForgotOpen(false)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {forgotError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
                >
                  {forgotError}
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Registered Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@amanahcoop.org"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="forgot-reason"
                    className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Note for Admin{' '}
                    <span className="text-slate-500 dark:text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="forgot-reason"
                    rows={2}
                    maxLength={400}
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder="e.g. Locked out of account or lost device credentials"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={forgotSubmitting}
                    onClick={() => setForgotOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 disabled:opacity-50 text-white font-medium shadow-xs cursor-pointer"
                  >
                    {forgotSubmitting ? 'Submitting…' : 'Send Reset Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ActionModal
        open={noticeModal !== null}
        mode="notice"
        tone={noticeModal?.tone || 'emerald'}
        title={noticeModal?.title || ''}
        description={noticeModal?.description || ''}
        details={noticeModal?.details}
        confirmLabel={noticeModal?.confirmLabel || 'OK, Got It'}
        onClose={() => {
          const shouldGoHome = Boolean(noticeModal?.redirectHomeOnClose);
          setNoticeModal(null);
          if (shouldGoHome) {
            router.push('/');
          }
        }}
      />
    </div>
  );
}
