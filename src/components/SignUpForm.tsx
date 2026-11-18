'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { queryKeys } from '../lib/queryKeys.ts';
import type { NomineeGender, NomineeInfo } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { isPdfFileUrl } from '../utils/format.ts';
import { ActionModal } from './ActionModal.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';

interface NomineeDraft {
  id: string;
  name: string;
  dateOfBirth: string;
  gender: '' | NomineeGender;
  occupation: string;
  relation: string;
  sharePercentage: string;
  nidOrBirthReg: string;
  mobile: string;
  address: string;
  sameAsApplicantPresent: boolean;
  photoUrl: string;
  photoUploading: boolean;
}

function createEmptyNominee(sharePercentage = '100', fixedId?: string): NomineeDraft {
  return {
    id: fixedId || `nom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    dateOfBirth: '',
    gender: '',
    occupation: '',
    relation: '',
    sharePercentage,
    nidOrBirthReg: '',
    mobile: '',
    address: '',
    sameAsApplicantPresent: false,
    photoUrl: '',
    photoUploading: false,
  };
}

export function SignUpForm() {
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();
  const t = useTranslations('Auth.signUpPage');
  const tAuth = useTranslations('Auth');
  const tCommon = useTranslations('Common');

  const referencesQuery = useQuery({
    queryKey: queryKeys.auth.references(),
    queryFn: () => api.getReferenceMembers(),
  });
  const constitutionQuery = useQuery({
    queryKey: queryKeys.public.constitution(),
    queryFn: () => api.getConstitution(),
  });

  const referenceOptions = referencesQuery.data?.members ?? [];
  const isBootstrapSetup = referencesQuery.data?.hasMembers === false;
  const constitution = constitutionQuery.data ?? null;

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

  // Nominees (1 or more; share % sums to 100%)
  const [nominees, setNominees] = useState<NomineeDraft[]>(() => [
    createEmptyNominee('100', 'nom-initial-1'),
  ]);

  // ImageKit.io uploaded photo & agreement paper URLs
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [agreementPhotoUrl, setAgreementPhotoUrl] = useState('');
  const [agreementUploading, setAgreementUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [bootstrapActivated, setBootstrapActivated] = useState(false);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!authChecking && user && !successModalOpen && !redirectingRef.current) {
      redirectingRef.current = true;
      setMobileBrowseMode(false);
      router.replace(isMobileViewport() ? '/dashboard' : '/');
    }
  }, [authChecking, user, router, successModalOpen]);

  useEffect(() => {
    if (sameAsPresent) {
      setPermanentAddress(presentAddress);
    }
  }, [sameAsPresent, presentAddress]);

  useEffect(() => {
    setNominees((prev) => {
      const hasSynced = prev.some((n) => n.sameAsApplicantPresent && n.address !== presentAddress);
      if (!hasSynced) return prev;
      return prev.map((n) => (n.sameAsApplicantPresent ? { ...n, address: presentAddress } : n));
    });
  }, [presentAddress]);

  const anyNomineePhotoUploading = nominees.some((n) => n.photoUploading);
  const totalNomineeShare =
    nominees.length === 1
      ? 100
      : Math.round(
          nominees.reduce((sum, n) => {
            const val = Number(n.sharePercentage);
            return Number.isFinite(val) && val > 0 ? sum + val : sum;
          }, 0) * 100
        ) / 100;

  function updateNomineeField<K extends keyof NomineeDraft>(
    index: number,
    field: K,
    value: NomineeDraft[K]
  ) {
    setNominees((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next: NomineeDraft = { ...item, [field]: value };
        if (field === 'gender' && value === 'female') {
          next.photoUrl = '';
        }
        return next;
      })
    );
  }

  function handleAddNominee() {
    setError(null);
    setNominees((prev) => {
      if (prev.length >= 10) return prev;
      if (prev.length === 1 && (Number(prev[0].sharePercentage) === 100 || !prev[0].sharePercentage)) {
        return [{ ...prev[0], sharePercentage: '50' }, createEmptyNominee('50')];
      }
      const existingSum = prev.reduce((sum, n) => {
        const val = Number(n.sharePercentage);
        return Number.isFinite(val) && val > 0 ? sum + val : sum;
      }, 0);
      const remaining = Math.max(0, Math.round((100 - existingSum) * 100) / 100);
      return [...prev, createEmptyNominee(remaining > 0 ? String(remaining) : '')];
    });
  }

  function handleRemoveNominee(index: number) {
    setNominees((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 1) {
        return [{ ...next[0], sharePercentage: '100' }];
      }
      return next;
    });
  }

  function handleEqualSplitShares() {
    setNominees((prev) => {
      const count = prev.length;
      if (count <= 1) return prev.map((n) => ({ ...n, sharePercentage: '100' }));
      const base = Math.floor((10000 / count)) / 100;
      let running = 0;
      return prev.map((n, idx) => {
        if (idx === count - 1) {
          const lastShare = Math.round((100 - running) * 100) / 100;
          return { ...n, sharePercentage: String(lastShare) };
        }
        running += base;
        return { ...n, sharePercentage: String(base) };
      });
    });
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>, target: 'photo' | 'agreement') {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (target === 'photo' && !isImage) {
      setError(t('errInvalidImage'));
      return;
    }
    if (target === 'agreement' && !isImage && !isPdf) {
      setError(t('errInvalidAgreement'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('errFileTooLarge'));
      return;
    }

    setError(null);
    if (target === 'photo') setPhotoUploading(true);
    else setAgreementUploading(true);

    try {
      const res = await api.uploadFile(file, {
        name: file.name,
        category: target === 'photo' ? 'member-kyc-photo' : 'member-signed-agreement',
        subject: name.trim() || email.trim() || 'applicant',
      });
      if (target === 'photo') {
        setPhotoUrl(res.url);
      } else {
        setAgreementPhotoUrl(res.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errUploadFailed'));
    } finally {
      if (target === 'photo') setPhotoUploading(false);
      else setAgreementUploading(false);
    }
  }

  async function handleNomineePhotoUpload(index: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('errNomineeImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('errNomineeSize'));
      return;
    }

    setError(null);
    setNominees((prev) =>
      prev.map((item, i) => (i === index ? { ...item, photoUploading: true } : item))
    );

    try {
      const nomineeName = nominees[index]?.name.trim();
      const res = await api.uploadFile(file, {
        name: file.name,
        category: 'nominee-kyc-photo',
        subject: nomineeName || name.trim() || `nominee-${index + 1}`,
      });
      setNominees((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, photoUrl: res.url, photoUploading: false } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errNomineeUploadFailed'));
      setNominees((prev) =>
        prev.map((item, i) => (i === index ? { ...item, photoUploading: false } : item))
      );
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!photoUrl) {
      setError(t('errPhotoRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('errPasswordLength'));
      return;
    }

    const preparedNominees: NomineeInfo[] = [];
    const multipleNominees = nominees.length > 1;
    let shareSum = 0;

    for (let i = 0; i < nominees.length; i += 1) {
      const n = nominees[i];
      const prefix = multipleNominees
        ? t('nomineeNumber', { number: i + 1 })
        : t('primaryNominee');

      if (
        !n.name.trim() ||
        !n.dateOfBirth.trim() ||
        !n.gender ||
        !n.occupation.trim() ||
        !n.relation.trim() ||
        !n.nidOrBirthReg.trim() ||
        !n.address.trim()
      ) {
        setError(t('errNomineeIncomplete', { prefix }));
        return;
      }

      if (n.gender !== 'female' && !n.photoUrl) {
        setError(t('errNomineePhotoRequired', { prefix }));
        return;
      }

      let sharePercentage = 100;
      if (multipleNominees) {
        const parsed = Number(n.sharePercentage);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
          setError(t('errNomineeShareRange', { prefix }));
          return;
        }
        sharePercentage = Math.round(parsed * 100) / 100;
        shareSum += sharePercentage;
      } else {
        shareSum = 100;
      }

      preparedNominees.push({
        name: n.name.trim(),
        dateOfBirth: n.dateOfBirth.trim(),
        gender: n.gender,
        occupation: n.occupation.trim(),
        relation: n.relation.trim(),
        sharePercentage,
        nidOrBirthReg: n.nidOrBirthReg.trim(),
        mobile: n.mobile.trim() || undefined,
        address: n.address.trim(),
        photoUrl: n.gender === 'female' ? undefined : n.photoUrl || undefined,
      });
    }

    if (multipleNominees && Math.abs(shareSum - 100) > 0.05) {
      setError(t('errTotalShare', { current: Math.round(shareSum * 100) / 100 }));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.register({
        name,
        email,
        password,
        dateOfBirth,
        referenceMemberName:
          referenceMemberName.trim() ||
          (isBootstrapSetup ? 'Founding Administrator (Self)' : ''),
        mobile,
        occupation,
        companyOrganization,
        nid,
        presentAddress,
        permanentAddress,
        photoUrl,
        agreementPhotoUrl: agreementPhotoUrl || undefined,
        nominees: preparedNominees,
      });

      const msg = res.message || t('submittedFallback');
      setSuccessMessage(msg);
      setBootstrapActivated(Boolean(res.bootstrapAdmin));
      setSuccessModalOpen(true);
      if (res.bootstrapAdmin && res.user) {
        setMobileBrowseMode(false);
        setUser(res.user);
      }
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
      setNominees([createEmptyNominee('100')]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (authChecking || (user && !successModalOpen)) {
    return (
      <div className="px-2 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="max-w-3xl w-full mx-auto bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-sm space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div className="space-y-2 flex-1">
              <Skeleton width={240} height={14} />
              <Skeleton width={280} height={30} />
              <Skeleton width="88%" height={16} />
            </div>
            <Skeleton width={135} height={18} />
          </div>
          <Skeleton height={76} borderRadius={12} />
          <Skeleton height={68} borderRadius={12} />
          <div className="space-y-4">
            <Skeleton width={190} height={14} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="space-y-1.5">
                  <Skeleton width={110} height={12} />
                  <Skeleton height={42} borderRadius={8} />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Skeleton width={180} height={14} />
            <Skeleton height={160} borderRadius={12} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-900 dark:text-slate-100 py-4 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-4xl w-full mx-auto bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-sm space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
          <div className="flex items-start sm:items-center gap-3.5">
            <AmanahLogo size="md" decorative className="shadow-sm mt-0.5 sm:mt-0" />
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('eyebrow')}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('heading')}
              </h1>
            </div>
          </div>
          <Link
            href="/login"
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            {t('alreadyApproved')}
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {successMessage ? (
            <motion.div
              key="signup-success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-6 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 space-y-4"
            >
              <div className="flex items-start gap-3 text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">{t('submittedTitle')}</h2>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    {successMessage}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>{t('goToSignIn')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
                >
                  {t('submitAnother')}
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/75 dark:bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {t('charterBannerTitle')}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {t('charterBannerDesc')}
                  </p>
                </div>
                {constitution?.constitutionPdfUrl ? (
                  <a
                    href={constitution.constitutionPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={constitution.constitutionPdfName || 'cooperative-constitution.pdf'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors shrink-0 whitespace-nowrap"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('constitutionPdf')}</span>
                  </a>
                ) : (
                  <Link
                    href="/rules"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors shrink-0 whitespace-nowrap"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('rulesCharter')}</span>
                  </Link>
                )}
              </div>

              {isBootstrapSetup && (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/75 dark:bg-emerald-950/35 space-y-1">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    {t('bootstrapBannerTitle')}
                  </p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    {t('bootstrapBannerDesc')}
                  </p>
                </div>
              )}

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    role="alert"
                    className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

            {/* Section 1: Identity & Credentials */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                {t('sec1')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('fullName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('fullNamePh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {tAuth('email')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tAuth('emailPlaceholder')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('passwordMin')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('passwordCreatePh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('dob')} <span className="text-red-500">*</span>
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
                    {t('mobile')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder={t('mobilePh')}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('nid')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nid}
                    onChange={(e) => setNid(e.target.value)}
                    placeholder={t('nidPh')}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Reference & Employment */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                {t('sec2')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('referenceLabel')}{' '}
                    {isBootstrapSetup ? (
                      <span className="text-slate-500 dark:text-slate-400 font-normal">
                        {t('optional')}
                      </span>
                    ) : (
                      <span className="text-red-500">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required={!isBootstrapSetup}
                    list="coop-existing-members"
                    value={referenceMemberName}
                    onChange={(e) => setReferenceMemberName(e.target.value)}
                    placeholder={isBootstrapSetup ? t('bootstrapReferencePh') : t('referencePh')}
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
                    {t('occupation')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder={t('occupationPh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('company')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={companyOrganization}
                    onChange={(e) => setCompanyOrganization(e.target.value)}
                    placeholder={t('companyPh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Addresses */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                  {t('sec3')}
                </h2>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsPresent}
                    onChange={(e) => setSameAsPresent(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>{t('sameAsPresent')}</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('presentAddress')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={presentAddress}
                    onChange={(e) => setPresentAddress(e.target.value)}
                    placeholder={t('presentAddressPh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('permanentAddress')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    disabled={sameAsPresent}
                    value={permanentAddress}
                    onChange={(e) => setPermanentAddress(e.target.value)}
                    placeholder={t('permanentAddressPh')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-70"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Nominee Information */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                      {t('sec4')}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('sec4Sub')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {nominees.length > 1 && (
                    <>
                      <span
                        className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border tabular-nums ${
                          Math.abs(totalNomineeShare - 100) <= 0.05
                            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                            : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {t('totalShare', { percent: totalNomineeShare })}
                      </span>
                      <button
                        type="button"
                        onClick={handleEqualSplitShares}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t('equalSplit')}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleAddNominee}
                    disabled={nominees.length >= 10}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('addNominee')}</span>
                  </button>
                </div>
              </div>

              <datalist id="coop-nominee-relations">
                <option value="Spouse" />
                <option value="Father" />
                <option value="Mother" />
                <option value="Son" />
                <option value="Daughter" />
                <option value="Brother" />
                <option value="Sister" />
              </datalist>

              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {nominees.map((nominee, idx) => (
                    <motion.div
                      key={nominee.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="p-4 sm:p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/55 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {nominees.length > 1
                              ? t('nomineeNumber', { number: idx + 1 })
                              : t('primaryNominee')}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {t('sharePercentLabel', {
                              percent: nominees.length === 1 ? 100 : nominee.sharePercentage || 0,
                            })}
                          </span>
                        </div>

                      {nominees.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveNominee(idx)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{tCommon('remove')}</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('nomineeName')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={nominee.name}
                          onChange={(e) => updateNomineeField(idx, 'name', e.target.value)}
                          placeholder={t('fullNamePh')}
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('dob')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={nominee.dateOfBirth}
                          onChange={(e) => updateNomineeField(idx, 'dateOfBirth', e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('gender')} <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={nominee.gender}
                          onChange={(e) =>
                            updateNomineeField(idx, 'gender', e.target.value as '' | NomineeGender)
                          }
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        >
                          <option value="">{t('selectGender')}</option>
                          <option value="male">{t('male')}</option>
                          <option value="female">{t('female')}</option>
                          <option value="other">{t('other')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('occupation')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={nominee.occupation}
                          onChange={(e) => updateNomineeField(idx, 'occupation', e.target.value)}
                          placeholder={t('nomineeOccupationPh')}
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('relation')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          list="coop-nominee-relations"
                          value={nominee.relation}
                          onChange={(e) => updateNomineeField(idx, 'relation', e.target.value)}
                          placeholder={t('relationPh')}
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('nidBirthReg')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={nominee.nidOrBirthReg}
                          onChange={(e) => updateNomineeField(idx, 'nidOrBirthReg', e.target.value)}
                          placeholder={t('nidBirthRegPh')}
                          className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('nomineeMobile')}{' '}
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            {t('ifAvailable')}
                          </span>
                        </label>
                        <input
                          type="tel"
                          value={nominee.mobile}
                          onChange={(e) => updateNomineeField(idx, 'mobile', e.target.value)}
                          placeholder={t('nomineeMobilePh')}
                          className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      {nominees.length > 1 && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            {t('sharePercentage')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            required
                            min="0.01"
                            max="100"
                            step="0.01"
                            value={nominee.sharePercentage}
                            onChange={(e) =>
                              updateNomineeField(idx, 'sharePercentage', e.target.value)
                            }
                            placeholder="50"
                            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            {t('nomineeAddress')} <span className="text-red-500">*</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={nominee.sameAsApplicantPresent}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNominees((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          sameAsApplicantPresent: checked,
                                          address: checked ? presentAddress : item.address,
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                            />
                            <span>{t('sameAsApplicantPresent')}</span>
                          </label>
                        </div>
                        <textarea
                          rows={2}
                          required
                          disabled={nominee.sameAsApplicantPresent}
                          value={nominee.address}
                          onChange={(e) => updateNomineeField(idx, 'address', e.target.value)}
                          placeholder={t('nomineeAddressPh')}
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-70"
                        />
                      </div>

                      {/* Nominee Photo (Not required when female) */}
                      <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {t('nomineePhoto')}{' '}
                            {nominee.gender === 'female' ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-normal">
                                {t('notNeededFemale')}
                              </span>
                            ) : (
                              <span className="text-red-500">*</span>
                            )}
                          </span>
                          {nominee.photoUrl && nominee.gender !== 'female' && (
                            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t('uploaded')}</span>
                            </span>
                          )}
                        </div>

                        {nominee.gender === 'female' ? (
                          <div className="py-3 px-3 rounded-lg border border-dashed border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 text-center">
                            {t('femalePhotoExempt')}
                          </div>
                        ) : nominee.photoUrl ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={nominee.photoUrl}
                              alt={`Nominee ${idx + 1} portrait`}
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                                <span>
                                  {nominee.photoUploading ? t('uploading') : t('replacePhoto')}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={nominee.photoUploading}
                                  onChange={(e) => void handleNomineePhotoUpload(idx, e)}
                                  className="sr-only"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => updateNomineeField(idx, 'photoUrl', '')}
                                className="text-left text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                              >
                                {tCommon('remove')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                            {nominee.photoUploading ? (
                              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                            ) : (
                              <ImagePlus className="w-4 h-4 text-slate-400" aria-hidden="true" />
                            )}
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              {nominee.photoUploading
                                ? t('uploadingToCloud')
                                : t('chooseNomineePhoto')}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={nominee.photoUploading}
                              onChange={(e) => void handleNomineePhotoUpload(idx, e)}
                              className="sr-only"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Section 5: ImageKit.io Photo & Agreement PDF/Photo Uploads */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                  {t('sec5')}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Member Photo (Required) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t('memberPhoto')} <span className="text-red-500">*</span>
                    </span>
                    {photoUrl && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('uploaded')}</span>
                      </span>
                    )}
                  </div>

                  {photoUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={photoUrl}
                        alt={t('memberPhoto')}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                        <span>{photoUploading ? t('uploading') : t('replacePhoto')}</span>
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
                        {photoUploading ? t('uploadingToCloud') : t('chooseMemberPhoto')}
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

                {/* Agreement Paper PDF or Photo (Optional) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t('agreementPaper')}{' '}
                      <span className="text-slate-500 dark:text-slate-400 font-normal">
                        {t('optional')}
                      </span>
                    </span>
                    {agreementPhotoUrl && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('uploaded')}</span>
                      </span>
                    )}
                  </div>

                  {agreementPhotoUrl ? (
                    <div className="flex items-center gap-3">
                      {isPdfFileUrl(agreementPhotoUrl) ? (
                        <a
                          href={agreementPhotoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-16 h-16 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0"
                        >
                          <FileText className="w-5 h-5" aria-hidden="true" />
                          <span>PDF</span>
                        </a>
                      ) : (
                        <img
                          src={agreementPhotoUrl}
                          alt={t('agreementPaper')}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0"
                        />
                      )}
                      <div className="flex flex-col gap-1">
                        {isPdfFileUrl(agreementPhotoUrl) && (
                          <a
                            href={agreementPhotoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline inline-flex items-center gap-1"
                          >
                            <span>{t('previewPdf')}</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        )}
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                          <span>{agreementUploading ? t('uploading') : t('replaceFile')}</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf,.pdf"
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
                          {tCommon('remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                      {agreementUploading ? (
                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                      ) : (
                        <FileText className="w-5 h-5 text-slate-400" aria-hidden="true" />
                      )}
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {agreementUploading ? t('uploadingToCloud') : t('uploadAgreement')}
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        disabled={agreementUploading}
                        onChange={(e) => void handlePhotoUpload(e, 'agreement')}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={
                  submitting || photoUploading || agreementUploading || anyNomineePhotoUploading
                }
                className="px-6 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? t('submittingApp') : t('submitApp')}</span>
              </button>
            </div>
          </form>
        )}
        </AnimatePresence>
      </motion.div>

      <ActionModal
        open={successModalOpen}
        mode="notice"
        tone="emerald"
        title={bootstrapActivated ? t('bootstrapSuccessTitle') : t('submittedTitle')}
        description={successMessage || t('submittedFallback')}
        confirmLabel={bootstrapActivated ? t('openDashboardNow') : tCommon('okGotIt')}
        onClose={() => {
          if (bootstrapActivated) {
            redirectingRef.current = true;
            setSuccessModalOpen(false);
            router.replace('/dashboard');
          } else {
            setSuccessModalOpen(false);
          }
        }}
      />
    </div>
  );
}
