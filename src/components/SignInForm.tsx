'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { api } from '../utils/api.ts';
import {
  getRegisteredMobileAccounts,
  setMobileAutoLogoutNotice,
  setSelectedPinAccountId,
} from '../utils/mobileDeviceAuth.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MobilePinLoginPanel } from './MobilePinLoginPanel.tsx';

export function SignInForm() {
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [hasRegisteredPinAccount, setHasRegisteredPinAccount] = useState(false);
  const [usePasswordMode, setUsePasswordMode] = useState(false);

  const [noticeModal, setNoticeModal] = useState<{
    tone: 'emerald' | 'red';
    title: string;
    description: string;
    details?: Array<{ label: string; value: string }>;
    confirmLabel?: string;
    redirectHomeOnClose?: boolean;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('forgot') === '1') {
      setForgotOpen(true);
    }
    const syncRegistered = () => {
      const accounts = getRegisteredMobileAccounts();
      setHasRegisteredPinAccount(accounts.length > 0);
      if (accounts.length === 0) setUsePasswordMode(false);
    };
    syncRegistered();
    window.addEventListener('amanah:mobile-devices-updated', syncRegistered);
    return () => window.removeEventListener('amanah:mobile-devices-updated', syncRegistered);
  }, []);

  useEffect(() => {
    if (!authChecking && user && !noticeModal?.redirectHomeOnClose) {
      setMobileBrowseMode(false);
      router.replace(isMobileViewport() ? '/dashboard' : '/');
    }
  }, [authChecking, user, router, noticeModal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      const mobile = isMobileViewport();
      setMobileAutoLogoutNotice(null);
      setSelectedPinAccountId(res.user.id);
      setMobileBrowseMode(false);
      setNoticeModal({
        tone: 'emerald',
        title: 'Signed In Successfully',
        description: `Welcome back, ${res.user.name}. Your encrypted cooperative session is now active.`,
        details: [
          { label: 'Member Code', value: res.user.memberCode },
          { label: 'Role', value: res.user.role.toUpperCase() },
        ],
        confirmLabel: mobile ? 'Dashboard' : 'Home',
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

  if (authChecking || (user && !noticeModal?.redirectHomeOnClose)) {
    return (
      <div className="py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="lg:col-span-6 space-y-4">
            <Skeleton width={200} height={14} />
            <Skeleton width="75%" height={34} />
            <Skeleton width="90%" height={16} count={2} />
          </div>
          <div className="lg:col-span-6 space-y-4">
            <Skeleton height={44} borderRadius={8} />
            <Skeleton height={44} borderRadius={8} />
            <Skeleton height={44} borderRadius={8} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-8 text-slate-900 dark:text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-9 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
      >
        {/* Left Institutional Context Column */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>Encrypted Dashboard · HttpOnly JWT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Sign in to the Amanah Dashboard
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
              Access your personal cooperative equity ledger, monthly contribution receipts, Qard Hasan status, and anonymized 2/3 governance ballots.
            </p>
          </div>

          <dl className="divide-y divide-slate-200/75 dark:divide-slate-800 border-t border-b border-slate-200/75 dark:border-slate-800 text-xs">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Session Security</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                HttpOnly Cookie · 2FA TOTP Ready
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Field Custody</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                AES-256-GCM · SHA-256 Audit Chain
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Eligibility Gate</dt>
              <dd className="font-medium text-emerald-700 dark:text-emerald-400">
                Admin-verified active members
              </dd>
            </div>
          </dl>
        </div>

        {/* Right Sign-In Form Column */}
        <div className="lg:col-span-6 lg:border-l lg:border-slate-200/75 lg:dark:border-slate-800 lg:pl-10 space-y-5">
          {hasRegisteredPinAccount && !usePasswordMode ? (
            <MobilePinLoginPanel
              onSuccess={(loggedInUser) => {
                setMobileBrowseMode(false);
                setUser(loggedInUser);
                router.replace(isMobileViewport() ? '/dashboard' : '/');
              }}
              onUsePassword={() => setUsePasswordMode(true)}
            />
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Member Credentials
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sign in using your approved cooperative email and password.
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
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1"
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
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium shadow-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>{loading ? 'Signing In…' : 'Sign In'}</span>
                </button>
              </form>

              {hasRegisteredPinAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setUsePasswordMode(false);
                  }}
                  className="w-full py-2 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sign in with 4-Digit PIN</span>
                </button>
              )}
            </>
          )}

          <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Applying as a new member?</span>
            <Link
              href="/signup"
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Join Amanah</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </motion.div>

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
              className="w-full max-w-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <KeyRound className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2
                      id="forgot-password-modal-title"
                      className="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      Request Password Reset
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
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
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
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
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white font-medium shadow-xs cursor-pointer"
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
            setMobileBrowseMode(false);
            router.replace(isMobileViewport() ? '/dashboard' : '/');
          }
        }}
      />
    </div>
  );
}
