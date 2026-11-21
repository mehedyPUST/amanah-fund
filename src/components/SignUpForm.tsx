'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Globe,
  ImagePlus,
  Languages,
  Loader2,
  PenTool,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import type {
  MaritalStatus,
  MemberGender,
  NomineeGender,
  NomineeInfo,
  StructuredBdAddress,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  downloadMembershipApplicationPdf,
  type ApplicationFormPdfInput,
} from '../utils/applicationFormPdf.ts';
import {
  createEmptyBdAddress,
  formatBdAddress,
  isBdAddressComplete,
} from '../utils/bdLocations.ts';
import {
  containsBanglaScript,
  containsLatinLetters,
  isValidBanglaName,
} from '../utils/inputLanguage.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import { evaluatePasswordStrength } from '../utils/passwordStrength.ts';
import { ActionModal } from './ActionModal.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { TeletalkAddressFields } from './TeletalkAddressFields.tsx';

const OTHER_RELATION_VALUE = '__other__';

const FEMALE_NOMINEE_RELATIONS = [
  'Wife',
  'Mother',
  'Daughter',
  'Sister',
  'Grandmother',
  'Granddaughter',
  'Aunt',
  'Niece',
  'Mother-in-Law',
  'Sister-in-Law',
  'Daughter-in-Law',
] as const;

const MALE_NOMINEE_RELATIONS = [
  'Husband',
  'Father',
  'Son',
  'Brother',
  'Grandfather',
  'Grandson',
  'Uncle',
  'Nephew',
  'Father-in-Law',
  'Brother-in-Law',
  'Son-in-Law',
] as const;

const OTHER_NOMINEE_RELATIONS = [
  'Spouse',
  'Parent',
  'Child',
  'Sibling',
  'Relative',
  'Guardian',
] as const;

function getLogicalRelationOptions(
  nomineeGender: '' | NomineeGender,
  applicantGender: '' | MemberGender
): string[] {
  if (nomineeGender === 'female') {
    return FEMALE_NOMINEE_RELATIONS.filter((r) => !(applicantGender === 'female' && r === 'Wife'));
  }
  if (nomineeGender === 'male') {
    return MALE_NOMINEE_RELATIONS.filter((r) => !(applicantGender === 'male' && r === 'Husband'));
  }
  if (nomineeGender === 'other') {
    return [...OTHER_NOMINEE_RELATIONS];
  }
  return [];
}

interface NomineeDraft {
  id: string;
  name: string;
  nameBn: string;
  dateOfBirth: string;
  gender: '' | NomineeGender;
  occupation: string;
  relation: string;
  customRelation: string;
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
    nameBn: '',
    dateOfBirth: '',
    gender: '',
    occupation: '',
    relation: '',
    customRelation: '',
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
  const locale = useLocale() as AppLocale;
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
  const [nameBn, setNameBn] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fatherName, setFatherName] = useState('');
  const [fatherNameBn, setFatherNameBn] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherNameBn, setMotherNameBn] = useState('');
  const [gender, setGender] = useState<'' | MemberGender>('');
  const [maritalStatus, setMaritalStatus] = useState<'' | MaritalStatus>('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseNameBn, setSpouseNameBn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [referenceMemberName, setReferenceMemberName] = useState('');
  const [mobile, setMobile] = useState('');
  const [occupation, setOccupation] = useState('');
  const [companyOrganization, setCompanyOrganization] = useState('');
  const [nid, setNid] = useState('');

  // Teletalk-style structured Bangladesh addresses
  const [presentAddressDetails, setPresentAddressDetails] = useState<StructuredBdAddress>(() =>
    createEmptyBdAddress()
  );
  const [permanentAddressDetails, setPermanentAddressDetails] = useState<StructuredBdAddress>(() =>
    createEmptyBdAddress()
  );
  const [sameAsPresent, setSameAsPresent] = useState(false);

  // Optional Social Media fields
  const [showSocialSection, setShowSocialSection] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [facebook, setFacebook] = useState('');
  const [linkedin, setLinkedin] = useState('');

  // Nominees (1 or more; share % sums to 100%)
  const [nominees, setNominees] = useState<NomineeDraft[]>(() => [
    createEmptyNominee('100', 'nom-initial-1'),
  ]);

  // ImageKit.io uploaded photo & 300x80 signature URLs + Digital Membership Agreement consent
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<{
    file: File;
    previewUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [agreedDigitalAgreement, setAgreedDigitalAgreement] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [bootstrapActivated, setBootstrapActivated] = useState(false);
  const [submittedApplication, setSubmittedApplication] =
    useState<ApplicationFormPdfInput | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const redirectingRef = useRef(false);

  const effectivePermanentAddressDetails = useMemo(
    () => (sameAsPresent ? presentAddressDetails : permanentAddressDetails),
    [sameAsPresent, presentAddressDetails, permanentAddressDetails]
  );

  const presentAddress = useMemo(
    () => formatBdAddress(presentAddressDetails),
    [presentAddressDetails]
  );
  const permanentAddress = useMemo(
    () => formatBdAddress(effectivePermanentAddressDetails),
    [effectivePermanentAddressDetails]
  );

  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;
  const passwordsMismatch = Boolean(confirmPassword) && password !== confirmPassword;

  useEffect(() => {
    if (!authChecking && user && !successModalOpen && !redirectingRef.current) {
      redirectingRef.current = true;
      setMobileBrowseMode(false);
      router.replace(isMobileViewport() ? '/dashboard' : '/');
    }
  }, [authChecking, user, router, successModalOpen]);

  useEffect(() => {
    return () => {
      if (pendingSignature?.previewUrl) {
        URL.revokeObjectURL(pendingSignature.previewUrl);
      }
    };
  }, [pendingSignature?.previewUrl]);

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
        if (field === 'gender') {
          const nextGender = value as '' | NomineeGender;
          if (nextGender === 'female') {
            next.photoUrl = '';
          }
          const allowed = getLogicalRelationOptions(nextGender, gender);
          if (
            next.relation &&
            next.relation !== OTHER_RELATION_VALUE &&
            !allowed.includes(next.relation)
          ) {
            next.relation = '';
            next.customRelation = '';
          }
        }
        if (field === 'relation' && value !== OTHER_RELATION_VALUE) {
          next.customRelation = '';
        }
        return next;
      })
    );
  }

  function handleApplicantGenderChange(nextGender: '' | MemberGender) {
    setGender(nextGender);
    setNominees((prev) =>
      prev.map((item) => {
        if (!item.gender || !item.relation || item.relation === OTHER_RELATION_VALUE) {
          return item;
        }
        const allowed = getLogicalRelationOptions(item.gender, nextGender);
        return allowed.includes(item.relation) ? item : { ...item, relation: '' };
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

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('errInvalidImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('errFileTooLarge'));
      return;
    }

    setError(null);
    setPhotoUploading(true);

    try {
      const res = await api.uploadFile(file, {
        name: file.name,
        category: 'member-kyc-photo',
        subject: name.trim() || email.trim() || 'applicant',
      });
      setPhotoUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errUploadFailed'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function uploadSignatureFile(file: File) {
    setSignatureUploading(true);
    setError(null);
    try {
      const res = await api.uploadFile(file, {
        name: file.name,
        category: 'member-signature',
        subject: name.trim() || email.trim() || 'applicant',
      });
      setSignatureUrl(res.url);
      setPendingSignature(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSignatureUploadFailed'));
    } finally {
      setSignatureUploading(false);
    }
  }

  function handleSignatureSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('errInvalidSignature'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('errSignatureSize'));
      return;
    }

    setError(null);
    const previewUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (width === 300 && height === 80) {
        URL.revokeObjectURL(previewUrl);
        void uploadSignatureFile(file);
      } else {
        setPendingSignature({ file, previewUrl, width, height });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      setError(t('errInvalidSignature'));
    };
    img.src = previewUrl;
  }

  async function handleAutoResizeSignature() {
    if (!pendingSignature) return;
    setSignatureUploading(true);
    setError(null);

    try {
      const resizedFile = await new Promise<File>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 80;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 300, 80);

          // Fit image cleanly inside 300x80 with slight padding while preserving aspect ratio
          const padX = 6;
          const padY = 4;
          const availW = 300 - padX * 2;
          const availH = 80 - padY * 2;
          const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
          const drawW = Math.round(img.naturalWidth * scale);
          const drawH = Math.round(img.naturalHeight * scale);
          const dx = Math.round((300 - drawW) / 2);
          const dy = Math.round((80 - drawH) / 2);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, dx, dy, drawW, drawH);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to generate 300×80 signature image.'));
              return;
            }
            resolve(new File([blob], 'signature-300x80.png', { type: 'image/png' }));
          }, 'image/png');
        };
        img.onerror = () => reject(new Error('Failed to load signature preview.'));
        img.src = pendingSignature.previewUrl;
      });

      await uploadSignatureFile(resizedFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSignatureUploadFailed'));
      setSignatureUploading(false);
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

    if (!passwordStrength.isValid) {
      setError(t('errPasswordLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('errPasswordMismatch'));
      return;
    }
    if (maritalStatus === 'married' && !spouseName.trim()) {
      setError(t('errSpouseRequired'));
      return;
    }

    const englishOnlyFields: Array<{ field: string; value: string }> = [
      { field: t('fullName'), value: name },
      { field: tAuth('email'), value: email },
      { field: t('fatherName'), value: fatherName },
      { field: t('motherName'), value: motherName },
      { field: t('spouseName'), value: maritalStatus === 'single' ? '' : spouseName },
      { field: t('mobile'), value: mobile },
      { field: t('nid'), value: nid },
      { field: t('referenceLabel'), value: referenceMemberName },
      { field: t('occupation'), value: occupation },
      { field: t('company'), value: companyOrganization },
      { field: t('whatsappLabel'), value: whatsapp },
      { field: t('facebookLabel'), value: facebook },
      { field: t('linkedinLabel'), value: linkedin },
      { field: t('presentAddress'), value: presentAddress },
      { field: t('permanentAddress'), value: permanentAddress },
    ];
    for (const item of englishOnlyFields) {
      if (item.value && containsBanglaScript(item.value)) {
        setError(t('errEnglishOnlyField', { field: item.field }));
        return;
      }
    }

    const banglaNameFields: Array<{ field: string; value: string }> = [
      { field: t('fullNameBn'), value: nameBn },
      { field: t('fatherNameBn'), value: fatherNameBn },
      { field: t('motherNameBn'), value: motherNameBn },
      { field: t('spouseNameBn'), value: maritalStatus === 'single' ? '' : spouseNameBn },
    ];
    for (const item of banglaNameFields) {
      if (item.value.trim() && !isValidBanglaName(item.value)) {
        setError(t('errBanglaNameField', { field: item.field }));
        return;
      }
    }

    if (!isBdAddressComplete(presentAddressDetails)) {
      setError(t('errPresentAddressIncomplete'));
      return;
    }
    if (!isBdAddressComplete(effectivePermanentAddressDetails)) {
      setError(t('errPermanentAddressIncomplete'));
      return;
    }
    if (!photoUrl) {
      setError(t('errPhotoRequired'));
      return;
    }
    if (!signatureUrl) {
      setError(t('errSignatureRequired'));
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
      const resolvedRelation =
        n.relation === OTHER_RELATION_VALUE ? n.customRelation.trim() : n.relation.trim();

      if (
        !n.name.trim() ||
        !n.dateOfBirth.trim() ||
        !n.gender ||
        !n.occupation.trim() ||
        !resolvedRelation ||
        !n.nidOrBirthReg.trim() ||
        !n.address.trim()
      ) {
        setError(t('errNomineeIncomplete', { prefix }));
        return;
      }

      const nomineeEnglishChecks: Array<{ field: string; value: string }> = [
        { field: `${prefix} · ${t('nomineeName')}`, value: n.name },
        { field: `${prefix} · ${t('occupation')}`, value: n.occupation },
        { field: `${prefix} · ${t('relation')}`, value: resolvedRelation },
        { field: `${prefix} · ${t('nidBirthReg')}`, value: n.nidOrBirthReg },
        { field: `${prefix} · ${t('nomineeMobile')}`, value: n.mobile },
        { field: `${prefix} · ${t('nomineeAddress')}`, value: n.address },
      ];
      for (const item of nomineeEnglishChecks) {
        if (item.value && containsBanglaScript(item.value)) {
          setError(t('errEnglishOnlyField', { field: item.field }));
          return;
        }
      }
      if (n.nameBn.trim() && !isValidBanglaName(n.nameBn)) {
        setError(t('errBanglaNameField', { field: `${prefix} · ${t('nomineeNameBn')}` }));
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
        nameBn: n.nameBn.trim() || undefined,
        dateOfBirth: n.dateOfBirth.trim(),
        gender: n.gender,
        occupation: n.occupation.trim(),
        relation: resolvedRelation,
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
    if (!agreedDigitalAgreement) {
      setError(t('errDigitalAgreementRequired'));
      return;
    }

    const cleanedSocial = {
      whatsapp: whatsapp.trim() || undefined,
      facebook: facebook.trim() || undefined,
      linkedin: linkedin.trim() || undefined,
    };
    const hasSocialMedia = Boolean(
      cleanedSocial.whatsapp || cleanedSocial.facebook || cleanedSocial.linkedin
    );
    const cleanedNameBn = nameBn.trim() || undefined;
    const cleanedFatherNameBn = fatherNameBn.trim() || undefined;
    const cleanedMotherNameBn = motherNameBn.trim() || undefined;
    const cleanedSpouse =
      maritalStatus === 'single' ? undefined : spouseName.trim() || undefined;
    const cleanedSpouseBn =
      maritalStatus === 'single' ? undefined : spouseNameBn.trim() || undefined;

    setSubmitting(true);
    try {
      const resolvedReference =
        referenceMemberName.trim() ||
        (isBootstrapSetup ? 'Founding Administrator (Self)' : '');
      const res = await api.register({
        name: name.trim(),
        nameBn: cleanedNameBn,
        email,
        password,
        fatherName: fatherName.trim(),
        fatherNameBn: cleanedFatherNameBn,
        motherName: motherName.trim(),
        motherNameBn: cleanedMotherNameBn,
        gender: gender as MemberGender,
        maritalStatus: maritalStatus as MaritalStatus,
        spouseName: cleanedSpouse,
        spouseNameBn: cleanedSpouseBn,
        dateOfBirth,
        referenceMemberName: resolvedReference,
        mobile,
        occupation,
        companyOrganization,
        nid,
        presentAddress,
        permanentAddress,
        presentAddressDetails,
        permanentAddressDetails: effectivePermanentAddressDetails,
        socialMedia: hasSocialMedia ? cleanedSocial : undefined,
        photoUrl,
        signatureUrl,
        nominees: preparedNominees,
      });

      setSubmittedApplication({
        applicantName: res.user?.name || name.trim(),
        email: res.user?.email || email.trim(),
        memberCode: res.user?.memberCode,
        status: res.user?.status || (res.bootstrapAdmin ? 'active' : 'pending_approval'),
        submittedAt: res.user?.joinedAt || new Date().toISOString(),
        fundName: constitution?.fundName || undefined,
        registrationDetails: {
          nameBn: cleanedNameBn,
          fatherName: fatherName.trim(),
          fatherNameBn: cleanedFatherNameBn,
          motherName: motherName.trim(),
          motherNameBn: cleanedMotherNameBn,
          gender: gender as MemberGender,
          maritalStatus: maritalStatus as MaritalStatus,
          spouseName: cleanedSpouse,
          spouseNameBn: cleanedSpouseBn,
          dateOfBirth,
          referenceMemberName: resolvedReference,
          mobile,
          occupation,
          companyOrganization,
          nid,
          presentAddress,
          permanentAddress,
          presentAddressDetails: { ...presentAddressDetails },
          permanentAddressDetails: { ...effectivePermanentAddressDetails },
          socialMedia: hasSocialMedia ? cleanedSocial : undefined,
          photoUrl,
          signatureUrl,
          nominees: preparedNominees,
          digitalAgreement: res.digitalAgreement,
        },
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
      setNameBn('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFatherName('');
      setFatherNameBn('');
      setMotherName('');
      setMotherNameBn('');
      setGender('');
      setMaritalStatus('');
      setSpouseName('');
      setSpouseNameBn('');
      setDateOfBirth('');
      setReferenceMemberName('');
      setMobile('');
      setOccupation('');
      setCompanyOrganization('');
      setNid('');
      setPresentAddressDetails(createEmptyBdAddress());
      setPermanentAddressDetails(createEmptyBdAddress());
      setSameAsPresent(false);
      setWhatsapp('');
      setFacebook('');
      setLinkedin('');
      setShowSocialSection(false);
      setPhotoUrl('');
      setSignatureUrl('');
      setPendingSignature(null);
      setAgreedDigitalAgreement(false);
      setNominees([createEmptyNominee('100')]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadSubmittedPdf() {
    if (!submittedApplication || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadMembershipApplicationPdf({
        ...submittedApplication,
        locale,
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (authChecking || (user && !successModalOpen)) {
    return (
      <div className="px-2 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="max-w-3xl w-full mx-auto bg-white/88 dark:bg-slate-900/82 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 sm:p-10 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.14)] space-y-8">
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
                  <Skeleton height={42} borderRadius={10} />
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
        className="max-w-4xl w-full mx-auto bg-white/88 dark:bg-slate-900/82 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 sm:p-10 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.14)] dark:shadow-[0_16px_44px_-16px_rgba(0,0,0,0.6)] space-y-8"
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
              className="p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/85 dark:bg-emerald-950/40 space-y-4"
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
                {submittedApplication && (
                  <button
                    type="button"
                    disabled={downloadingPdf}
                    onClick={() => void handleDownloadSubmittedPdf()}
                    className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {downloadingPdf ? t('generatingPdf') : t('downloadApplicationPdf')}
                    </span>
                  </button>
                )}
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 whitespace-nowrap transition-all"
                >
                  <span>{t('goToSignIn')}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessMessage(null);
                    setSubmittedApplication(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/50 cursor-pointer whitespace-nowrap transition-colors"
                >
                  {t('submitAnother')}
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/75 dark:bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors shrink-0 whitespace-nowrap"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('constitutionPdf')}</span>
                  </a>
                ) : (
                  <Link
                    href="/rules"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors shrink-0 whitespace-nowrap"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('rulesCharter')}</span>
                  </Link>
                )}
              </div>

              {locale === 'bn' && (
                <div className="p-3.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-start gap-2.5">
                  <Languages
                    className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {t('englishInputNoticeTitle')}
                    </p>
                    <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
                      {t('englishInputNoticeDesc')}
                    </p>
                  </div>
                </div>
              )}

              {isBootstrapSetup && (
                <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/75 dark:bg-emerald-950/35 space-y-1">
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
                    className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
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
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(name)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(name) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('fullNameBn')}
                  </label>
                  <input
                    type="text"
                    value={nameBn}
                    onChange={(e) => setNameBn(e.target.value)}
                    placeholder={t('fullNameBnPh')}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsLatinLetters(nameBn)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsLatinLetters(nameBn) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errBanglaOnlyHint')}
                    </p>
                  )}
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
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(email)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(email) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
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
                    className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(mobile)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(mobile) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {t('passwordMin')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordCreatePh')}
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-confirm-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {t('confirmPassword')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('confirmPasswordPh')}
                      className={`w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                        passwordsMismatch
                          ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                          : passwordsMatch
                            ? 'border-emerald-400 dark:border-emerald-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {passwordsMatch && (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{t('passwordsMatch')}</span>
                    </p>
                  )}
                  {passwordsMismatch && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{t('passwordsMismatch')}</span>
                    </p>
                  )}
                </div>

                {/* Live Password Strength Meter & Rules Checklist */}
                <div className="sm:col-span-2 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/75 dark:bg-slate-950/60 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {t('strengthLabel')}
                    </span>
                    {passwordStrength.level !== 'empty' && (
                      <span
                        className={`font-semibold ${
                          passwordStrength.level === 'weak'
                            ? 'text-rose-600 dark:text-rose-400'
                            : passwordStrength.level === 'fair'
                              ? 'text-amber-600 dark:text-amber-400'
                              : passwordStrength.level === 'good'
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {passwordStrength.level === 'weak'
                          ? t('strengthWeak')
                          : passwordStrength.level === 'fair'
                            ? t('strengthFair')
                            : passwordStrength.level === 'good'
                              ? t('strengthGood')
                              : t('strengthStrong')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((segment) => {
                      const active = passwordStrength.score >= segment;
                      const barColor = !active
                        ? 'bg-slate-200 dark:bg-slate-800'
                        : passwordStrength.level === 'weak'
                          ? 'bg-rose-500'
                          : passwordStrength.level === 'fair'
                            ? 'bg-amber-500'
                            : passwordStrength.level === 'good'
                              ? 'bg-teal-500'
                              : 'bg-emerald-600';
                      return (
                        <div
                          key={segment}
                          className={`h-1.5 rounded-full transition-colors duration-200 ${barColor}`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5 text-[11px]">
                    {[
                      { ok: passwordStrength.checks.minLength, label: t('ruleMin8') },
                      { ok: passwordStrength.checks.hasUppercase, label: t('ruleUpper') },
                      { ok: passwordStrength.checks.hasLowercase, label: t('ruleLower') },
                      { ok: passwordStrength.checks.hasNumber, label: t('ruleNumber') },
                      { ok: passwordStrength.checks.hasSpecial, label: t('ruleSpecial') },
                    ].map((rule) => (
                      <span
                        key={rule.label}
                        className={`inline-flex items-center gap-1 transition-colors ${
                          rule.ok
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Check
                          className={`w-3 h-3 shrink-0 ${
                            rule.ok ? 'opacity-100' : 'opacity-35'
                          }`}
                          aria-hidden="true"
                        />
                        <span>{rule.label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('fatherName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder={t('fatherNamePh')}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(fatherName)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(fatherName) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('fatherNameBn')}
                  </label>
                  <input
                    type="text"
                    value={fatherNameBn}
                    onChange={(e) => setFatherNameBn(e.target.value)}
                    placeholder={t('fatherNameBnPh')}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsLatinLetters(fatherNameBn)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsLatinLetters(fatherNameBn) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errBanglaOnlyHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('motherName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder={t('motherNamePh')}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(motherName)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(motherName) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('motherNameBn')}
                  </label>
                  <input
                    type="text"
                    value={motherNameBn}
                    onChange={(e) => setMotherNameBn(e.target.value)}
                    placeholder={t('motherNameBnPh')}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsLatinLetters(motherNameBn)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsLatinLetters(motherNameBn) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errBanglaOnlyHint')}
                    </p>
                  )}
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
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('gender')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={gender}
                    onChange={(e) =>
                      handleApplicantGenderChange(e.target.value as '' | MemberGender)
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  >
                    <option value="">{t('selectGender')}</option>
                    <option value="male">{t('male')}</option>
                    <option value="female">{t('female')}</option>
                    <option value="other">{t('other')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('maritalStatus')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={maritalStatus}
                    onChange={(e) => {
                      const next = e.target.value as '' | MaritalStatus;
                      setMaritalStatus(next);
                      if (next === 'single' || next === '') {
                        setSpouseName('');
                        setSpouseNameBn('');
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  >
                    <option value="">{t('selectMaritalStatus')}</option>
                    <option value="single">{t('maritalSingle')}</option>
                    <option value="married">{t('maritalMarried')}</option>
                    <option value="widowed">{t('maritalWidowed')}</option>
                    <option value="divorced">{t('maritalDivorced')}</option>
                  </select>
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
                    className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(nid)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(nid) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>

                {maritalStatus && maritalStatus !== 'single' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('spouseName')}{' '}
                        {maritalStatus === 'married' ? (
                          <span className="text-red-500">*</span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            {t('optional')}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required={maritalStatus === 'married'}
                        value={spouseName}
                        onChange={(e) => setSpouseName(e.target.value)}
                        placeholder={t('spouseNamePh')}
                        className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                          containsBanglaScript(spouseName)
                            ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                            : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                        }`}
                      />
                      {containsBanglaScript(spouseName) && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          {t('errEnglishOnlyHint')}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('spouseNameBn')}
                      </label>
                      <input
                        type="text"
                        value={spouseNameBn}
                        onChange={(e) => setSpouseNameBn(e.target.value)}
                        placeholder={t('spouseNameBnPh')}
                        className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                          containsLatinLetters(spouseNameBn)
                            ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                            : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                        }`}
                      />
                      {containsLatinLetters(spouseNameBn) && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          {t('errBanglaOnlyHint')}
                        </p>
                      )}
                    </div>
                  </>
                )}
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
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(referenceMemberName)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(referenceMemberName) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
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
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(occupation)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(occupation) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
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
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                      containsBanglaScript(companyOrganization)
                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                    }`}
                  />
                  {containsBanglaScript(companyOrganization) && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {t('errEnglishOnlyHint')}
                    </p>
                  )}
                </div>
              </div>
              {/* Optional Social Media Profiles (WhatsApp, Facebook, LinkedIn) */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/55 dark:bg-slate-950/45 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSocialSection((prev) => !prev)}
                  aria-expanded={showSocialSection}
                  className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Globe
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                        <span>{t('socialToggleTitle')}</span>
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {t('optional')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('socialToggleSub')}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                    <span>{showSocialSection ? t('hideSocialBtn') : t('addSocialBtn')}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        showSocialSection ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {showSocialSection && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-3 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <label
                              htmlFor="signup-whatsapp"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                            >
                              {t('whatsappLabel')}
                            </label>
                            {mobile.trim() && (
                              <button
                                type="button"
                                onClick={() => setWhatsapp(mobile.trim())}
                                className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                              >
                                {t('sameAsMobile')}
                              </button>
                            )}
                          </div>
                          <input
                            id="signup-whatsapp"
                            type="tel"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            placeholder={t('whatsappPh')}
                            className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(whatsapp)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          {containsBanglaScript(whatsapp) && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              {t('errEnglishOnlyHint')}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="signup-facebook"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            {t('facebookLabel')}
                          </label>
                          <input
                            id="signup-facebook"
                            type="text"
                            value={facebook}
                            onChange={(e) => setFacebook(e.target.value)}
                            placeholder={t('facebookPh')}
                            className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(facebook)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          {containsBanglaScript(facebook) && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              {t('errEnglishOnlyHint')}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="signup-linkedin"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            {t('linkedinLabel')}
                          </label>
                          <input
                            id="signup-linkedin"
                            type="text"
                            value={linkedin}
                            onChange={(e) => setLinkedin(e.target.value)}
                            placeholder={t('linkedinPh')}
                            className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(linkedin)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          {containsBanglaScript(linkedin) && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              {t('errEnglishOnlyHint')}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Section 3: Teletalk-Style Residential Addresses */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                {t('sec3')}
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TeletalkAddressFields
                  title={t('presentAddress')}
                  idPrefix="present-addr"
                  value={presentAddressDetails}
                  onChange={setPresentAddressDetails}
                />

                <TeletalkAddressFields
                  title={t('permanentAddress')}
                  idPrefix="permanent-addr"
                  value={effectivePermanentAddressDetails}
                  onChange={setPermanentAddressDetails}
                  disabled={sameAsPresent}
                  headerRight={
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsPresent}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSameAsPresent(checked);
                          if (checked) {
                            setPermanentAddressDetails({ ...presentAddressDetails });
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span>{t('sameAsPresent')}</span>
                    </label>
                  }
                />
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

                {nominees.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border tabular-nums ${
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
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t('equalSplit')}
                    </button>
                  </div>
                )}
              </div>

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
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/60 dark:ring-white/5 bg-slate-50/65 dark:bg-slate-950/55 space-y-4"
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
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                            containsBanglaScript(nominee.name)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsBanglaScript(nominee.name) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errEnglishOnlyHint')}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('nomineeNameBn')}
                        </label>
                        <input
                          type="text"
                          value={nominee.nameBn}
                          onChange={(e) => updateNomineeField(idx, 'nameBn', e.target.value)}
                          placeholder={t('nomineeNameBnPh')}
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                            containsLatinLetters(nominee.nameBn)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsLatinLetters(nominee.nameBn) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errBanglaOnlyHint')}
                          </p>
                        )}
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
                          className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
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
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
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
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                            containsBanglaScript(nominee.occupation)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsBanglaScript(nominee.occupation) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errEnglishOnlyHint')}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('relation')} <span className="text-red-500">*</span>
                        </label>
                        {(() => {
                          const relationOptions = getLogicalRelationOptions(nominee.gender, gender);
                          return (
                            <div className="space-y-2">
                              <select
                                required
                                disabled={!nominee.gender}
                                value={nominee.relation}
                                onChange={(e) =>
                                  updateNomineeField(idx, 'relation', e.target.value)
                                }
                                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <option value="">
                                  {nominee.gender
                                    ? t('selectRelation')
                                    : t('selectGenderFirst')}
                                </option>
                                {relationOptions.map((relKey) => (
                                  <option key={relKey} value={relKey}>
                                    {t(`nomineeRelations.${relKey}`)}
                                  </option>
                                ))}
                                {nominee.gender && (
                                  <option value={OTHER_RELATION_VALUE}>
                                    {t('nomineeRelations.Other')}
                                  </option>
                                )}
                              </select>
                              {nominee.relation === OTHER_RELATION_VALUE && (
                                <>
                                  <input
                                    type="text"
                                    required
                                    value={nominee.customRelation}
                                    onChange={(e) =>
                                      updateNomineeField(idx, 'customRelation', e.target.value)
                                    }
                                    placeholder={t('customRelationPh')}
                                    className={`w-full px-3.5 py-2 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                                      containsBanglaScript(nominee.customRelation)
                                        ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                        : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                                    }`}
                                  />
                                  {containsBanglaScript(nominee.customRelation) && (
                                    <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                                      {t('errEnglishOnlyHint')}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
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
                          className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                            containsBanglaScript(nominee.nidOrBirthReg)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsBanglaScript(nominee.nidOrBirthReg) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errEnglishOnlyHint')}
                          </p>
                        )}
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
                          className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                            containsBanglaScript(nominee.mobile)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsBanglaScript(nominee.mobile) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errEnglishOnlyHint')}
                          </p>
                        )}
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
                            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
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
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 disabled:opacity-70 ${
                            containsBanglaScript(nominee.address)
                              ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                          }`}
                        />
                        {containsBanglaScript(nominee.address) && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {t('errEnglishOnlyHint')}
                          </p>
                        )}
                      </div>

                      {/* Nominee Photo (Not required when female) */}
                      <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm space-y-2.5">
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
                          <div className="py-3 px-3 rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 text-center">
                            {t('femalePhotoExempt')}
                          </div>
                        ) : nominee.photoUrl ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={nominee.photoUrl}
                              alt={`Nominee ${idx + 1} portrait`}
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
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
                          <label className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddNominee}
                  disabled={nominees.length >= 10}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('addNominee')}</span>
                </button>
              </div>
            </div>

            {/* Section 5: Identity Photo, Signature & Digital Membership Agreement */}
            <div className="space-y-4 pt-5 border-t border-slate-200/70 dark:border-slate-800/80">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                  {t('sec5')}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Member Photo (Required) */}
                <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/65 dark:bg-slate-950/55 space-y-3">
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
                        className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                        <span>{photoUploading ? t('uploading') : t('replacePhoto')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={photoUploading}
                          onChange={(e) => void handlePhotoUpload(e)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
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
                        onChange={(e) => void handlePhotoUpload(e)}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                {/* Applicant Signature 300x80 px (Required) */}
                <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/65 dark:bg-slate-950/55 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {t('signatureLabel')} <span className="text-red-500">*</span>
                    </span>
                    {signatureUrl && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('signatureVerifiedBadge')}</span>
                      </span>
                    )}
                  </div>

                  {pendingSignature ? (
                    <div className="p-3.5 rounded-xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/75 dark:bg-amber-950/30 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>
                            {t('signatureDimMismatch', {
                              width: pendingSignature.width,
                              height: pendingSignature.height,
                            })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingSignature(null)}
                          aria-label={tCommon('cancel')}
                          className="p-1 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-amber-900/50 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="w-[300px] max-w-full h-[80px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden p-1 shrink-0">
                          <img
                            src={pendingSignature.previewUrl}
                            alt={t('signatureLabel')}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={signatureUploading}
                            onClick={() => void handleAutoResizeSignature()}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            {signatureUploading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>
                              {signatureUploading ? t('uploading') : t('autoResizeUpload')}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={signatureUploading}
                            onClick={() => setPendingSignature(null)}
                            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
                          >
                            {tCommon('cancel')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : signatureUrl ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-[300px] max-w-full h-[80px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          src={signatureUrl}
                          alt={t('signatureLabel')}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex flex-wrap sm:flex-col gap-2 sm:gap-1">
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                          <span>{signatureUploading ? t('uploading') : t('replaceSignature')}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            disabled={signatureUploading}
                            onChange={handleSignatureSelect}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSignatureUrl('')}
                          className="text-left text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        >
                          {tCommon('remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col sm:flex-row items-center justify-center gap-3 py-4 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center sm:text-left transition-colors">
                      <div className="w-[150px] h-[40px] rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center gap-1.5 text-[10px] font-mono text-slate-400 shrink-0">
                        {signatureUploading ? (
                          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                        ) : (
                          <>
                            <PenTool className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>300 × 80 px</span>
                          </>
                        )}
                      </div>
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {signatureUploading ? t('uploadingToCloud') : t('chooseSignature')}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        disabled={signatureUploading}
                        onChange={handleSignatureSelect}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                {/* Official Digital Membership Agreement Declaration (Required) */}
                <div className="sm:col-span-2 p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/55 dark:bg-emerald-950/25 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <FileText
                      className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                        {t('digitalAgreementTitle')}
                      </h3>
                      <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                        {t('digitalAgreementDesc')}
                      </p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2.5 pt-2 border-t border-emerald-200/70 dark:border-emerald-900/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedDigitalAgreement}
                      onChange={(e) => setAgreedDigitalAgreement(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-600/30 shrink-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                      {t('digitalAgreementCheckbox')} <span className="text-red-500">*</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={
                  submitting ||
                  photoUploading ||
                  signatureUploading ||
                  anyNomineePhotoUploading
                }
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap"
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
        secondaryAction={
          submittedApplication
            ? {
                label: downloadingPdf ? t('generatingPdf') : t('downloadApplicationPdf'),
                loading: downloadingPdf,
                onClick: () => void handleDownloadSubmittedPdf(),
              }
            : undefined
        }
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
