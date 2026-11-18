'use client';

import { useEffect, useLayoutEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Phone,
  Shield,
  Smartphone,
  UserPlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../utils/api.ts';
import {
  getMobileAutoLogoutNotice,
  getRegisteredMobileAccounts,
  setMobileAutoLogoutNotice,
  setSelectedPinAccountId,
} from '../utils/mobileDeviceAuth.ts';
import { isMobileBrowseMode, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { useBodyScrollLock } from '../utils/modalLock.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { MobilePinLoginPanel } from './MobilePinLoginPanel.tsx';

export function MobileVisitorGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();
  const tAuth = useTranslations('Auth');
  const tCommon = useTranslations('Common');

  const [isMobile, setIsMobile] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);
  const [hasRegisteredPinAccount, setHasRegisteredPinAccount] = useState(false);
  const [usePasswordMode, setUsePasswordMode] = useState(false);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activationChallenge, setActivationChallenge] = useState<{
    activationToken: string;
    applicant: { id: string; name: string; email: string; fundName: string };
    message: string;
  } | null>(null);
  const [activationMemberId, setActivationMemberId] = useState('');
  const [activationOtp, setActivationOtp] = useState('');
  const [activationAgreed, setActivationAgreed] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    description: string;
    details: Array<{ label: string; value: string }>;
  } | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => {
      setIsMobile(mq.matches);
      setBrowseMode(isMobileBrowseMode());
      const accounts = getRegisteredMobileAccounts();
      setHasRegisteredPinAccount(accounts.length > 0);
      setAutoLogoutNotice(getMobileAutoLogoutNotice());
      if (accounts.length === 0) {
        setUsePasswordMode(false);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('amanah:mobile-devices-updated', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('amanah:mobile-devices-updated', sync);
    };
  }, [pathname, user]);

  const isAuthOrCharterPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/rules' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/signup/') ||
    pathname.startsWith('/rules/');

  const shouldRedirectAuthenticatedMobileHome =
    isMobile &&
    !authChecking &&
    Boolean(user) &&
    pathname === '/' &&
    !browseMode &&
    !confirmationModal;

  useEffect(() => {
    if (!shouldRedirectAuthenticatedMobileHome) return;
    router.replace('/dashboard');
  }, [shouldRedirectAuthenticatedMobileHome, router]);

  async function handleModalSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
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
      setMobileAutoLogoutNotice(null);
      setAutoLogoutNotice(null);
      setSelectedPinAccountId(res.user.id);
      setMobileBrowseMode(false);
      setBrowseMode(false);
      setUser(res.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tAuth('mobileGate.signInFailed')
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMobileActivate(e: FormEvent) {
    e.preventDefault();
    if (!activationChallenge) return;
    setActivationError(null);
    const trimmedCode = activationMemberId.trim().toUpperCase();
    const cleanedOtp = activationOtp.replace(/\D/g, '').trim();
    if (!trimmedCode || !/^\d{6}$/.test(cleanedOtp)) {
      setActivationError(tAuth('activation.errorBothRequired'));
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
      setMobileAutoLogoutNotice(null);
      setAutoLogoutNotice(null);
      setSelectedPinAccountId(res.user.id);
      setMobileBrowseMode(false);
      setBrowseMode(false);
      setActivationChallenge(null);
      setConfirmationModal({
        title: tAuth('activation.confirmedTitle'),
        description: tAuth('activation.confirmedDesc', {
          name: res.user.name,
          fundName: activationChallenge.applicant.fundName,
        }),
        details: [
          { label: tAuth('activation.memberName'), value: res.user.name },
          { label: tAuth('activation.officialMemberId'), value: res.user.memberCode },
          { label: tAuth('activation.accountStatus'), value: tAuth('activation.activeVerified') },
          {
            label: tAuth('activation.confirmationEmail'),
            value: res.confirmationEmailSent
              ? tAuth('activation.emailSentTo', { email: res.user.email })
              : tAuth('activation.emailQueued'),
          },
        ],
      });
      setUser(res.user);
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : tAuth('signInPage.activationFailed'));
    } finally {
      setActivating(false);
    }
  }

  const showWelcomeModal =
    isMobile && !authChecking && !user && !isAuthOrCharterPage && !confirmationModal;
  const showMobileSessionShield =
    !showWelcomeModal &&
    ((authChecking && !isAuthOrCharterPage) || shouldRedirectAuthenticatedMobileHome);

  useBodyScrollLock(showWelcomeModal);

  return (
    <>
      {showMobileSessionShield && (
        <div
          aria-live="polite"
          aria-label={tAuth('mobileGate.checkingSessionAria')}
          className="lg:hidden fixed inset-0 z-50 amanah-ambient-canvas flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 dark:bg-emerald-600 text-white flex items-center justify-center shadow-lg mb-3">
            <Shield className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="font-display font-bold text-base text-slate-900 dark:text-white">
            {tCommon('brandName')}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400" />
            <span>
              {shouldRedirectAuthenticatedMobileHome
                ? tAuth('mobileGate.openingDashboard')
                : tAuth('mobileGate.checkingSession')}
            </span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showWelcomeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-visitor-gate-title"
            className="lg:hidden fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl"
            >
              {/* Brand Header */}
              <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-white" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2
                        id="mobile-visitor-gate-title"
                        className="font-display text-lg font-bold tracking-tight truncate"
                      >
                        {tCommon('brandName')}
                      </h2>
                      <p className="text-xs text-emerald-100/85 truncate">
                        {tAuth('mobileGate.tagline')}
                      </p>
                    </div>
                  </div>
                  <LanguageSwitcher
                    variant="compact"
                    surface="inverted"
                    className="shrink-0"
                  />
                </div>
              </div>

              <div className="p-5 space-y-4">
                {activationChallenge ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        {tAuth('mobileGate.activateMembership')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActivationChallenge(null);
                          setActivationError(null);
                        }}
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{tCommon('back')}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tAuth('mobileGate.enterCodesSentTo', {
                        email: activationChallenge.applicant.email,
                      })}
                    </p>
                    {activationError && (
                      <div
                        role="alert"
                        className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
                      >
                        {activationError}
                      </div>
                    )}
                    <form onSubmit={handleMobileActivate} className="space-y-3">
                      <div>
                        <label
                          htmlFor="mobile-act-code"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {tAuth('activation.memberIdLabel')}
                        </label>
                        <input
                          id="mobile-act-code"
                          type="text"
                          required
                          autoCapitalize="characters"
                          value={activationMemberId}
                          onChange={(e) => setActivationMemberId(e.target.value.toUpperCase())}
                          placeholder="AMANAH-AC-02"
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono uppercase rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="mobile-act-otp"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {tAuth('activation.otpLabel')}
                        </label>
                        <input
                          id="mobile-act-otp"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={activationOtp}
                          onChange={(e) =>
                            setActivationOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder={tAuth('activation.otpPlaceholder')}
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-base font-mono tabular-nums tracking-[0.25em] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <label className="flex items-start gap-2 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/25 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                        <input
                          type="checkbox"
                          checked={activationAgreed}
                          onChange={(e) => setActivationAgreed(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700"
                        />
                        <span>{tAuth('mobileGate.agreementShort')}</span>
                      </label>
                      <button
                        type="submit"
                        disabled={activating}
                        className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {activating
                            ? tAuth('mobileGate.activating')
                            : tAuth('mobileGate.confirmActivate')}
                        </span>
                      </button>
                    </form>
                    <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{tAuth('mobileGate.phoneHelpShort')}</span>
                    </div>
                  </div>
                ) : hasRegisteredPinAccount && !usePasswordMode ? (
                  <MobilePinLoginPanel
                    compact
                    onSuccess={(loggedInUser) => {
                      setMobileBrowseMode(false);
                      setBrowseMode(false);
                      setUser(loggedInUser);
                      router.replace('/dashboard');
                    }}
                    onUsePassword={() => setUsePasswordMode(true)}
                  />
                ) : (
                  /* Registered Member Email & Password Sign In Form */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        {tAuth('mobileGate.registeredMember')}
                      </span>
                      <Link
                        href="/login?forgot=1"
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline py-1"
                      >
                        {tAuth('forgotPassword')}
                      </Link>
                    </div>

                    {autoLogoutNotice && (
                      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          {autoLogoutNotice === '__AUTO_LOGOUT_1M__'
                            ? tCommon('autoLogoutNotice')
                            : autoLogoutNotice}
                        </span>
                      </div>
                    )}

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          role="alert"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleModalSignIn} className="space-y-3">
                      <div>
                        <label
                          htmlFor="mobile-modal-email"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {tAuth('email')}
                        </label>
                        <input
                          id="mobile-modal-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={tAuth('emailPlaceholder')}
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="mobile-modal-password"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {tAuth('password')}
                        </label>
                        <div className="relative">
                          <input
                            id="mobile-modal-password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={tAuth('passwordPlaceholder')}
                            className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword
                                ? tAuth('mobileGate.hidePassword')
                                : tAuth('mobileGate.showPassword')
                            }
                            className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
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
                        disabled={submitting}
                        className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Lock className="w-4 h-4" aria-hidden="true" />
                        <span>{submitting ? tAuth('signingIn') : tAuth('signIn')}</span>
                      </button>
                    </form>

                    {hasRegisteredPinAccount && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setUsePasswordMode(false);
                        }}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{tAuth('useDevicePin')}</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="h-px bg-slate-200/80 dark:bg-slate-800" aria-hidden="true" />

                {/* New to Amanah Section */}
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    {tAuth('mobileGate.newToAmanah')}
                  </div>

                  <div className="space-y-2">
                    <Link
                      href="/rules"
                      className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <BookOpen
                          className="w-4.5 h-4.5 text-emerald-700 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span>{tAuth('mobileGate.browseRules')}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    </Link>

                    <Link
                      href="/signup"
                      className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/55 text-emerald-800 dark:text-emerald-300 text-sm font-semibold flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <UserPlus className="w-4.5 h-4.5" aria-hidden="true" />
                        <span>{tAuth('mobileGate.applyJoin')}</span>
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ActionModal
        open={confirmationModal !== null}
        mode="notice"
        tone="emerald"
        title={confirmationModal?.title || ''}
        description={confirmationModal?.description || ''}
        details={confirmationModal?.details}
        confirmLabel={tAuth('openDashboard')}
        onClose={() => {
          setConfirmationModal(null);
          router.replace('/dashboard');
        }}
      />
    </>
  );
}
