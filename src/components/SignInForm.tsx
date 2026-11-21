'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { translateRoleLabel } from '../i18n/messages.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { api } from '../utils/api.ts';
import {
  getRegisteredMobileAccounts,
  setMobileAutoLogoutNotice,
  setSelectedPinAccountId,
} from '../utils/mobileDeviceAuth.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { ActionModal } from './ActionModal.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MobilePinLoginPanel } from './MobilePinLoginPanel.tsx';

interface ActivationChallengeState {
  activationToken: string;
  applicant: {
    id: string;
    name: string;
    email: string;
    fundName: string;
  };
  message: string;
}

export function SignInForm() {
  const router = useRouter();
  const { user, authChecking, setUser, locale } = useCoopSession();
  const tAuth = useTranslations('Auth');
  const tCommon = useTranslations('Common');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectingRef = useRef(false);

  const [activationChallenge, setActivationChallenge] =
    useState<ActivationChallengeState | null>(null);
  const [activationMemberId, setActivationMemberId] = useState('');
  const [activationOtp, setActivationOtp] = useState('');
  const [activationAgreed, setActivationAgreed] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.auth.bootstrapStatus(),
    queryFn: () => api.getBootstrapStatus(),
  });
  const vaultHasMembers =
    bootstrapQuery.data !== undefined ? bootstrapQuery.data.hasMembers : null;

  const [hasRegisteredPinAccount, setHasRegisteredPinAccount] = useState(false);
  const [usePasswordMode, setUsePasswordMode] = useState<boolean>(
    () => bootstrapQuery.data?.hasMembers === false
  );

  const [noticeModal, setNoticeModal] = useState<{
    tone: 'emerald' | 'red';
    title: string;
    description: string;
    details?: Array<{ label: string; value: string }>;
    confirmLabel?: string;
    redirectHomeOnClose?: boolean;
  } | null>(null);

  useEffect(() => {
    if (vaultHasMembers === false) {
      setUsePasswordMode(true);
    }
  }, [vaultHasMembers]);

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
    return () => {
      window.removeEventListener('amanah:mobile-devices-updated', syncRegistered);
    };
  }, []);

  useEffect(() => {
    if (!authChecking && user && !noticeModal?.redirectHomeOnClose && !redirectingRef.current) {
      redirectingRef.current = true;
      setMobileBrowseMode(false);
      router.replace(isMobileViewport() ? '/dashboard' : '/');
    }
  }, [authChecking, user, router, noticeModal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      if (!('user' in res)) {
        setActivationChallenge({
          activationToken: res.activationToken,
          applicant: res.applicant,
          message: res.message,
        });
        setActivationMemberId('');
        setActivationOtp('');
        setActivationAgreed(false);
        setActivationError(null);
        return;
      }

      const mobile = isMobileViewport();
      setMobileAutoLogoutNotice(null);
      setSelectedPinAccountId(res.user.id);
      setMobileBrowseMode(false);
      setNoticeModal({
        tone: 'emerald',
        title: tAuth('signedInSuccess'),
        description: tAuth('signedInDesc', { name: res.user.name }),
        details: [
          { label: tAuth('memberCodeLabel'), value: res.user.memberCode },
          { label: tAuth('roleLabel'), value: translateRoleLabel(res.user.role, locale) },
        ],
        confirmLabel: mobile ? tAuth('openDashboard') : tAuth('signInPage.homeLabel'),
        redirectHomeOnClose: true,
      });
      setUser(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : tAuth('signInPage.signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activationChallenge) return;
    setActivationError(null);

    const trimmedCode = activationMemberId.trim().toUpperCase();
    const cleanedOtp = activationOtp.replace(/\D/g, '').trim();

    if (!trimmedCode) {
      setActivationError(tAuth('activation.errorMemberIdRequired'));
      return;
    }
    if (!/^\d{6}$/.test(cleanedOtp)) {
      setActivationError(tAuth('activation.errorOtpInvalid'));
      return;
    }
    if (!activationAgreed) {
      setActivationError(tAuth('activation.errorAgreementRequired'));
      return;
    }

    setActivating(true);
    try {
      const res = await api.activateMembership({
        activationToken: activationChallenge.activationToken,
        memberCode: trimmedCode,
        otp: cleanedOtp,
        agreedToTerms: true,
      });

      const mobile = isMobileViewport();
      setMobileAutoLogoutNotice(null);
      setSelectedPinAccountId(res.user.id);
      setMobileBrowseMode(false);
      setActivationChallenge(null);
      setNoticeModal({
        tone: 'emerald',
        title: tAuth('activation.confirmedTitle'),
        description: tAuth('activation.confirmedDesc', {
          name: res.user.name,
          fundName: activationChallenge.applicant.fundName,
        }),
        details: [
          { label: tAuth('activation.memberName'), value: res.user.name },
          { label: tAuth('activation.officialMemberId'), value: res.user.memberCode },
          { label: tAuth('activation.accountStatus'), value: tAuth('activation.activeVerified') },
          { label: tAuth('activation.finalAgreement'), value: tAuth('activation.confirmedViaOtp') },
          {
            label: tAuth('activation.confirmationEmail'),
            value: res.confirmationEmailSent
              ? tAuth('activation.emailSentTo', { email: res.user.email })
              : tAuth('activation.emailQueued'),
          },
        ],
        confirmLabel: mobile ? tAuth('openDashboard') : tAuth('enterPortal'),
        redirectHomeOnClose: true,
      });
      setUser(res.user);
    } catch (err) {
      const errObj = err as Error & { code?: string };
      if (errObj?.code === 'ACTIVATION_SESSION_EXPIRED') {
        setActivationChallenge(null);
        setError(errObj.message);
      } else {
        setActivationError(errObj?.message || tAuth('signInPage.activationFailed'));
      }
    } finally {
      setActivating(false);
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
      setForgotError(tAuth('forgot.invalidEmail'));
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await api.forgotPassword(trimmedEmail, forgotReason.trim() || undefined);
      setForgotOpen(false);
      setNoticeModal({
        tone: 'emerald',
        title: tAuth('forgot.sentTitle'),
        description: res.message || tAuth('forgot.sentDesc'),
        details: [
          { label: tAuth('forgot.registeredEmail'), value: trimmedEmail },
          { label: tAuth('activation.accountStatus'), value: tAuth('forgot.statusPending') },
        ],
        confirmLabel: tCommon('okGotIt'),
        redirectHomeOnClose: false,
      });
    } catch (err) {
      setForgotError(
        err instanceof Error ? err.message : tAuth('forgot.invalidEmail')
      );
    } finally {
      setForgotSubmitting(false);
    }
  }

  if (authChecking || (user && !noticeModal?.redirectHomeOnClose)) {
    return (
      <div className="py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white/88 dark:bg-slate-900/82 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 sm:p-8 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.14)]">
          <div className="lg:col-span-6 space-y-4">
            <Skeleton width={200} height={14} />
            <Skeleton width="75%" height={34} />
            <Skeleton width="90%" height={16} count={2} />
          </div>
          <div className="lg:col-span-6 space-y-4">
            <Skeleton height={44} borderRadius={12} />
            <Skeleton height={44} borderRadius={12} />
            <Skeleton height={44} borderRadius={12} />
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
        className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/85 rounded-2xl p-6 sm:p-9 shadow-[0_10px_36px_-18px_rgba(15,23,42,0.12)] dark:shadow-[0_16px_44px_-16px_rgba(0,0,0,0.6)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
      >
        {/* Left Institutional Context Column */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AmanahLogo size="md" decorative className="shadow-sm" />
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {activationChallenge
                    ? tAuth('signInPage.badgeActivation')
                    : tAuth('signInPage.badge')}
                </span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {activationChallenge
                ? tAuth('signInPage.headingActivation')
                : tAuth('signInPage.heading')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
              {activationChallenge
                ? tAuth('signInPage.subtitleActivation')
                : tAuth('signInPage.subtitle')}
            </p>
          </div>

          <dl className="divide-y divide-slate-200/75 dark:divide-slate-800 border-t border-b border-slate-200/75 dark:border-slate-800 text-xs">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">{tAuth('signInPage.sessionSecurity')}</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {tAuth('signInPage.sessionSecurityVal')}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">{tAuth('signInPage.fieldCustody')}</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {tAuth('signInPage.fieldCustodyVal')}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">{tAuth('signInPage.eligibilityGate')}</dt>
              <dd className="font-medium text-emerald-700 dark:text-emerald-400">
                {activationChallenge
                  ? tAuth('signInPage.eligibilityGateActivationVal')
                  : tAuth('signInPage.eligibilityGateVal')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Right Sign-In / Activation Column */}
        <div className="lg:col-span-6 lg:border-l lg:border-slate-200/75 lg:dark:border-slate-800 lg:pl-10 space-y-5">
          {activationChallenge ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {tAuth('signInPage.activationTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tAuth('signInPage.accountVerifiedFor')}{' '}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {activationChallenge.applicant.name}
                    </span>{' '}
                    <span className="font-mono">({activationChallenge.applicant.email})</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivationChallenge(null);
                    setActivationError(null);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tCommon('back')}</span>
                </button>
              </div>

              <AnimatePresence>
                {activationError && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    {activationError}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleActivateSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="activation-member-id"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {tAuth('activation.memberIdLabel')} <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="activation-member-id"
                    type="text"
                    required
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    value={activationMemberId}
                    onChange={(e) => setActivationMemberId(e.target.value.toUpperCase())}
                    placeholder="AC002"
                    className="w-full px-3.5 py-2.5 text-sm font-mono uppercase tracking-wider text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="activation-otp"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {tAuth('activation.otpLabel')} <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="activation-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    value={activationOtp}
                    onChange={(e) =>
                      setActivationOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder={tAuth('activation.otpPlaceholder')}
                    className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums tracking-[0.28em] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600 transition-colors"
                  />
                </div>

                <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/25 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activationAgreed}
                    onChange={(e) => setActivationAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong className="font-semibold text-slate-900 dark:text-white">
                      {tAuth('signInPage.finalAgreementTitle')}
                    </strong>{' '}
                    {tAuth('signInPage.finalAgreementBody', {
                      fundName: activationChallenge.applicant.fundName,
                    })}
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={activating}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-emerald-900/15 active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {activating ? tAuth('activation.verifying') : tAuth('activation.submitButton')}
                  </span>
                </button>
              </form>

              <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <Mail className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">{tAuth('activation.phoneHelp')}</p>
              </div>
            </div>
          ) : hasRegisteredPinAccount && !usePasswordMode ? (
            <MobilePinLoginPanel
              onSuccess={(loggedInUser) => {
                redirectingRef.current = true;
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
                  {tAuth('signInPage.credentialsTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tAuth('signInPage.credentialsSub')}
                </p>
              </div>

              {vaultHasMembers === false && (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/85 dark:bg-amber-950/35 space-y-2.5">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      {tAuth('signInPage.emptyVaultTitle')}
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      {tAuth('signInPage.emptyVaultDesc')}
                    </p>
                  </div>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all whitespace-nowrap"
                  >
                    <span>{tAuth('signInPage.createFirstAdmin')}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              )}

              <AnimatePresence>
                {error && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed space-y-2"
                  >
                    <p>{error}</p>
                    {error.includes('Join Amanah') && (
                      <Link
                        href="/signup"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <span>{tAuth('signInPage.createFirstAdmin')}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="signin-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {tAuth('email')}
                  </label>
                  <input
                    id="signin-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={tAuth('emailPlaceholder')}
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600 transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="signin-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      {tAuth('password')}
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenForgotModal}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" aria-hidden="true" />
                      <span>{tAuth('forgotPassword')}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={tAuth('passwordPlaceholder')}
                      className="w-full pl-3.5 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword
                          ? tAuth('mobileGate.hidePassword')
                          : tAuth('mobileGate.showPassword')
                      }
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-emerald-900/15 active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>{loading ? tAuth('signingIn') : tAuth('signIn')}</span>
                </button>
              </form>

              {hasRegisteredPinAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setUsePasswordMode(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-emerald-200/90 dark:border-emerald-800/80 bg-emerald-50/55 dark:bg-emerald-950/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/45 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tAuth('useDevicePin')}</span>
                </button>
              )}
            </>
          )}

          <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>{tAuth('signInPage.applyPrompt')}</span>
            <Link
              href="/signup"
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>{tAuth('signUp')}</span>
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
              className="w-full max-w-md rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl ring-1 ring-inset ring-white/80 dark:ring-white/10 p-6 shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)] space-y-4"
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
                      {tAuth('forgot.title')}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {tAuth('forgot.subtitle')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !forgotSubmitting && setForgotOpen(false)}
                  aria-label={tCommon('closeDialog')}
                  className="p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {forgotError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
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
                    {tAuth('forgot.registeredEmail')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder={tAuth('emailPlaceholder')}
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="forgot-reason"
                    className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {tAuth('forgot.reasonLabel')}
                  </label>
                  <textarea
                    id="forgot-reason"
                    rows={2}
                    maxLength={400}
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder={tAuth('forgot.reasonPlaceholder')}
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={forgotSubmitting}
                    onClick={() => setForgotOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold shadow-xs shadow-emerald-900/15 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {forgotSubmitting ? tAuth('forgot.submitting') : tAuth('forgot.submit')}
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
        confirmLabel={noticeModal?.confirmLabel || tCommon('okGotIt')}
        onClose={() => {
          const shouldGoHome = Boolean(noticeModal?.redirectHomeOnClose);
          if (shouldGoHome) {
            redirectingRef.current = true;
            setNoticeModal(null);
            setMobileBrowseMode(false);
            router.replace(isMobileViewport() ? '/dashboard' : '/');
          } else {
            setNoticeModal(null);
          }
        }}
      />
    </div>
  );
}
