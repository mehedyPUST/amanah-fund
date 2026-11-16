'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Globe,
  ImagePlus,
  Loader2,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../utils/api.ts';
import {
  GOOGLE_ONBOARDING_STORAGE_KEY,
  signInWithGoogleIdentity,
  type StoredGoogleOnboarding,
} from '../utils/googleAuth.ts';
import { useCoopSession } from './AppProviders.tsx';

export function SignUpForm() {
  const router = useRouter();
  const { user, authChecking, setUser, t } = useCoopSession();

  const [referenceOptions, setReferenceOptions] = useState<
    Array<{ name: string; memberCode: string }>
  >([]);

  // Google-verified onboarding state
  const [googleOnboarding, setGoogleOnboarding] = useState<StoredGoogleOnboarding | null>(null);
  const [googleVerifying, setGoogleVerifying] = useState(false);

  // Required & optional signup fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [referenceMemberName, setReferenceMemberName] = useState('');
  const [mobile, setMobile] = useState('');
  const [occupation, setOccupation] = useState('');
  const [companyOrganization, setCompanyOrganization] = useState('');
  const [nid, setNid] = useState('');
  const [presentAddress, setPresentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [sameAsPresent, setSameAsPresent] = useState(false);

  // ImgBB uploaded photo & agreement paper URLs
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [agreementPhotoUrl, setAgreementPhotoUrl] = useState('');
  const [agreementUploading, setAgreementUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecking && user) {
      router.replace('/dashboard');
    }
  }, [authChecking, user, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem(GOOGLE_ONBOARDING_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredGoogleOnboarding;
      if (parsed?.registrationToken && parsed?.googleProfile?.email) {
        setGoogleOnboarding(parsed);
        setName((prev) => prev || parsed.googleProfile.name || '');
        setEmail(parsed.googleProfile.email);
      }
    } catch {
      window.sessionStorage.removeItem(GOOGLE_ONBOARDING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getReferenceMembers()
      .then((res) => {
        if (active) setReferenceOptions(res.members || []);
      })
      .catch(() => {
        // optional autocomplete list
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sameAsPresent) {
      setPermanentAddress(presentAddress);
    }
  }, [sameAsPresent, presentAddress]);

  async function handleStartGoogleOnboarding() {
    setError(null);
    setSuccessMessage(null);
    setGoogleVerifying(true);
    try {
      const { idToken } = await signInWithGoogleIdentity();
      const res = await api.googleAuth(idToken);

      if (res.status === 'authenticated') {
        setUser(res.user);
        router.push('/dashboard');
        return;
      }

      const onboardingPayload: StoredGoogleOnboarding = {
        registrationToken: res.registrationToken,
        googleProfile: res.googleProfile,
      };
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          GOOGLE_ONBOARDING_STORAGE_KEY,
          JSON.stringify(onboardingPayload)
        );
      }
      setGoogleOnboarding(onboardingPayload);
      setName(res.googleProfile.name || '');
      setEmail(res.googleProfile.email);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google verification failed.');
    } finally {
      setGoogleVerifying(false);
    }
  }

  function handleClearGoogleOnboarding() {
    setGoogleOnboarding(null);
    setEmail('');
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(GOOGLE_ONBOARDING_STORAGE_KEY);
    }
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>, target: 'photo' | 'agreement') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, or WEBP).');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Selected image must be smaller than 6 MB.');
      return;
    }

    setError(null);
    if (target === 'photo') setPhotoUploading(true);
    else setAgreementUploading(true);

    try {
      const label = `${target}-${Date.now()}`;
      const res = await api.uploadImage(file, label);
      if (target === 'photo') {
        setPhotoUrl(res.url);
      } else {
        setAgreementPhotoUrl(res.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      if (target === 'photo') setPhotoUploading(false);
      else setAgreementUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!photoUrl) {
      setError('Please upload your profile photo before submitting the application.');
      return;
    }
    if (!googleOnboarding && password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (googleOnboarding && password.length > 0 && password.length < 6) {
      setError('Optional backup password must be at least 6 characters long (or leave blank).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.register({
        name,
        email,
        password: password || undefined,
        googleRegistrationToken: googleOnboarding?.registrationToken,
        dateOfBirth,
        referenceMemberName,
        mobile,
        occupation,
        companyOrganization,
        nid,
        presentAddress,
        permanentAddress,
        photoUrl,
        agreementPhotoUrl: agreementPhotoUrl || undefined,
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(GOOGLE_ONBOARDING_STORAGE_KEY);
      }
      setGoogleOnboarding(null);

      setSuccessMessage(res.message || t.auth.signUp.submittedFallback);
      setName('');
      setEmail('');
      setPassword('');
      setDateOfBirth('');
      setReferenceMemberName('');
      setMobile('');
      setOccupation('');
      setCompanyOrganization('');
      setNid('');
      setPresentAddress('');
      setPermanentAddress('');
      setSameAsPresent(false);
      setPhotoUrl('');
      setAgreementPhotoUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit registration.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-3xl w-full mx-auto bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>{t.auth.signUp.badge}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.auth.signUp.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t.auth.signUp.subtitle}
            </p>
          </div>
          <Link
            href="/login"
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            {t.auth.signUp.alreadyApproved}
          </Link>
        </div>

        {successMessage ? (
          <div className="p-6 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 space-y-4">
            <div className="flex items-start gap-3 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{t.auth.signUp.submittedTitle}</h2>
                <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  {successMessage}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <span>{t.auth.signUp.goToSignIn}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 cursor-pointer"
              >
                {t.auth.signUp.submitAnother}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-7">
            <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  {t.auth.signUp.charterTitle}
                </p>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                  {t.auth.signUp.charterBody}
                </p>
              </div>
              <a
                href="/assets/aistudio/Savings__Investment_and_Interest-Free_Loan_Fund_Cooperative_Society_Update_1_98df82ac.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors shrink-0 whitespace-nowrap"
              >
                <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.auth.signUp.constitutionPdf}</span>
              </a>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 leading-relaxed"
              >
                {error}
              </div>
            )}

            {/* Google Identity Prefill / Verification Banner */}
            {googleOnboarding ? (
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      {t.auth.signUp.googleVerifiedPrefix} · {googleOnboarding.googleProfile.email}
                    </p>
                    <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                      {t.auth.signUp.googleVerifiedBody}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearGoogleOnboarding}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.auth.signUp.useEmailInstead}</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {t.auth.signUp.googlePromptTitle}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t.auth.signUp.googlePromptBody}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartGoogleOnboarding}
                  disabled={googleVerifying || submitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-2xs transition-colors cursor-pointer disabled:opacity-60 shrink-0 whitespace-nowrap"
                >
                  {googleVerifying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  )}
                  <span>{googleVerifying ? t.auth.signUp.verifying : t.auth.signUp.continueGoogle}</span>
                </button>
              </div>
            )}

            {/* Section 1: Identity & Credentials */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t.auth.signUp.sectionPersonal}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.fullName} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.auth.signUp.fullNamePlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.emailLabel} <span className="text-red-500">*</span>
                    {googleOnboarding && (
                      <span className="ml-1.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                        {t.auth.signUp.emailVerifiedGoogle}
                      </span>
                    )}
                  </label>
                  <input
                    type="email"
                    required
                    readOnly={Boolean(googleOnboarding)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.signUp.emailPlaceholder}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 ${
                      googleOnboarding
                        ? 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 cursor-not-allowed'
                        : 'bg-white dark:bg-slate-950'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {googleOnboarding ? (
                      <>
                        {t.auth.signUp.backupPassword}{' '}
                        <span className="text-slate-400 font-normal">{t.auth.signUp.backupPasswordHint}</span>
                      </>
                    ) : (
                      <>
                        {t.auth.signUp.passwordLabel} <span className="text-red-500">*</span>
                      </>
                    )}
                  </label>
                  <input
                    type="password"
                    required={!googleOnboarding}
                    minLength={googleOnboarding && password.length === 0 ? undefined : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      googleOnboarding
                        ? t.auth.signUp.backupPasswordPlaceholder
                        : t.auth.signUp.passwordPlaceholder
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.dobLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.mobileLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder={t.auth.signUp.mobilePlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.nidLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nid}
                    onChange={(e) => setNid(e.target.value)}
                    placeholder={t.auth.signUp.nidPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Reference & Employment */}
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t.auth.signUp.sectionReference}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.referenceLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="coop-existing-members"
                    value={referenceMemberName}
                    onChange={(e) => setReferenceMemberName(e.target.value)}
                    placeholder={t.auth.signUp.referencePlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                  <datalist id="coop-existing-members">
                    {referenceOptions.map((m) => (
                      <option key={m.memberCode} value={m.name}>
                        {m.name} ({m.memberCode})
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.occupationLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder={t.auth.signUp.occupationPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.companyLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={companyOrganization}
                    onChange={(e) => setCompanyOrganization(e.target.value)}
                    placeholder={t.auth.signUp.companyPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Addresses */}
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.auth.signUp.sectionAddress}
                </h2>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsPresent}
                    onChange={(e) => setSameAsPresent(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>{t.auth.signUp.sameAsPresent}</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.presentAddress} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={presentAddress}
                    onChange={(e) => setPresentAddress(e.target.value)}
                    placeholder={t.auth.signUp.presentAddressPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.auth.signUp.permanentAddress} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    disabled={sameAsPresent}
                    value={permanentAddress}
                    onChange={(e) => setPermanentAddress(e.target.value)}
                    placeholder={t.auth.signUp.permanentAddressPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-70"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: ImgBB API Photo & Agreement Uploads */}
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.auth.signUp.sectionUploads}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.auth.signUp.uploadsSubtitle}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Member Photo (Required) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t.auth.signUp.memberPhoto} <span className="text-red-500">*</span>
                    </span>
                    {photoUrl && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.auth.signUp.uploaded}</span>
                      </span>
                    )}
                  </div>

                  {photoUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={photoUrl}
                        alt="Uploaded member portrait"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white"
                      />
                      <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                        <span>{photoUploading ? t.auth.signUp.uploading : t.auth.signUp.replacePhoto}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={photoUploading}
                          onChange={(e) => void handlePhotoUpload(e, 'photo')}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                      {photoUploading ? (
                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                      ) : (
                        <ImagePlus className="w-5 h-5 text-slate-400" aria-hidden="true" />
                      )}
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {photoUploading ? t.auth.signUp.uploadingImgbb : t.auth.signUp.chooseMemberPhoto}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={photoUploading}
                        onChange={(e) => void handlePhotoUpload(e, 'photo')}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                {/* Agreement Paper Photo (Optional) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t.auth.signUp.agreementPhoto}{' '}
                      <span className="text-slate-400 font-normal">{t.auth.signUp.optional}</span>
                    </span>
                    {agreementPhotoUrl && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.auth.signUp.uploaded}</span>
                      </span>
                    )}
                  </div>

                  {agreementPhotoUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={agreementPhotoUrl}
                        alt="Uploaded agreement paper"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white"
                      />
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                          <span>{agreementUploading ? t.auth.signUp.uploading : t.auth.signUp.replaceImage}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={agreementUploading}
                            onChange={(e) => void handlePhotoUpload(e, 'agreement')}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setAgreementPhotoUrl('')}
                          className="text-left text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline cursor-pointer"
                        >
                          {t.auth.signUp.remove}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                      {agreementUploading ? (
                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                      ) : (
                        <ImagePlus className="w-5 h-5 text-slate-400" aria-hidden="true" />
                      )}
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {agreementUploading
                          ? t.auth.signUp.uploadingImgbb
                          : t.auth.signUp.uploadAgreement}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={agreementUploading}
                        onChange={(e) => void handlePhotoUpload(e, 'agreement')}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.auth.signUp.encryptionNote}
              </p>
              <button
                type="submit"
                disabled={submitting || photoUploading || agreementUploading}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? t.auth.signUp.submittingBtn : t.auth.signUp.submitBtn}</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
