'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Globe,
  ImagePlus,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
import type {
  MaritalStatus,
  MemberGender,
  NomineeGender,
  NomineeInfo,
  NotificationPreferences,
  ProfileChangePayload,
  ProfileChangeRequest,
  PublicUser,
  StructuredBdAddress,
  UserRegistrationDetails,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  syncFcmPushSubscription,
  unregisterFcmPushSubscription,
} from '../utils/fcmClient.ts';
import { downloadMembershipApplicationPdf } from '../utils/applicationFormPdf.ts';
import {
  areBdAddressesEqual,
  createEmptyBdAddress,
  formatBdAddress,
  hydrateStructuredBdAddress,
  isBdAddressComplete,
} from '../utils/bdLocations.ts';
import { formatDateTime, isPdfFileUrl } from '../utils/format.ts';
import {
  containsBanglaScript,
  containsLatinLetters,
  isValidBanglaName,
} from '../utils/inputLanguage.ts';
import {
  detectDefaultMobileDeviceName,
  getLocalDeviceForUser,
  removeRegisteredMobileAccount,
  saveRegisteredMobileAccount,
} from '../utils/mobileDeviceAuth.ts';
import {
  createEmptyNomineeDraft,
  formatProfileChangeEntries,
  getLogicalRelationOptions,
  nomineeInfoToDraft,
  OTHER_RELATION_VALUE,
  type NomineeDraft,
} from '../utils/profileChanges.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MemberAgreementPaperPreview } from './MemberAgreementPaperPreview.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';
import { TeletalkAddressFields } from './TeletalkAddressFields.tsx';
import { useToast } from './ToastProvider.tsx';

interface MemberProfileProps {
  user: PublicUser;
  onRefresh: () => Promise<void>;
}

export function MemberProfile({ user, onRefresh }: MemberProfileProps) {
  const t = useTranslations('Profile');
  const tSignUp = useTranslations('Auth.signUpPage');
  const tAuth = useTranslations('Auth');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const { setUser } = useCoopSession();
  const toast = useToast();

  const [profile, setProfile] = useState<PublicUser>(user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingAppPdf, setDownloadingAppPdf] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [agreementBroken, setAgreementBroken] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<{
    credentials: boolean;
    contact: boolean;
    password: boolean;
    mobilePin: boolean;
    totp: boolean;
    alerts: boolean;
  }>({
    credentials: false,
    contact: false,
    password: false,
    mobilePin: false,
    totp: false,
    alerts: false,
  });

  const toggleTopic = useCallback(
    (topic: 'credentials' | 'contact' | 'password' | 'mobilePin' | 'totp' | 'alerts') => {
      setExpandedTopics((prev) => ({ ...prev, [topic]: !prev[topic] }));
    },
    []
  );

  const [referenceOptions, setReferenceOptions] = useState<
    Array<{ name: string; memberCode: string }>
  >([]);

  // Editable member credential fields (mirrors SignUpForm without password)
  const [name, setName] = useState(user.name);
  const [nameBn, setNameBn] = useState('');
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [fatherNameBn, setFatherNameBn] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherNameBn, setMotherNameBn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'' | MemberGender>('');
  const [maritalStatus, setMaritalStatus] = useState<'' | MaritalStatus>('');
  const [nid, setNid] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseNameBn, setSpouseNameBn] = useState('');
  const [referenceMemberName, setReferenceMemberName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [companyOrganization, setCompanyOrganization] = useState('');

  // Optional Social Media fields
  const [showSocialSection, setShowSocialSection] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [facebook, setFacebook] = useState('');
  const [linkedin, setLinkedin] = useState('');

  // Structured Teletalk-style Bangladesh addresses
  const [presentAddressDetails, setPresentAddressDetails] = useState<StructuredBdAddress>(() =>
    createEmptyBdAddress()
  );
  const [permanentAddressDetails, setPermanentAddressDetails] = useState<StructuredBdAddress>(() =>
    createEmptyBdAddress()
  );
  const [sameAsPresent, setSameAsPresent] = useState(false);

  // Nominees
  const [nominees, setNominees] = useState<NomineeDraft[]>(() => [
    createEmptyNomineeDraft('100', 'profile-nom-1'),
  ]);

  // Identity Photo & 300x80 Signature
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
  const [credError, setCredError] = useState<string | null>(null);

  // Password change state (instant, no approval required)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Profile change approval requests
  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);

  // 2FA Step-Up Security state
  const [totpSetupData, setTotpSetupData] = useState<{
    secret: string;
    otpAuthUri: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);

  // Mobile Device 4-Digit PIN Registration state
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [devicePin, setDevicePin] = useState('');
  const [devicePinConfirm, setDevicePinConfirm] = useState('');
  const [devicePinBusy, setDevicePinBusy] = useState(false);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);

  const [modal, setModal] = useState<
    | {
        mode: 'confirm';
        tone: 'emerald' | 'amber' | 'red';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
        customContent?: ReactNode;
        maxWidthClass?: string;
        secondaryAction?: {
          label: string;
          onClick: () => void;
          loading?: boolean;
        };
        confirmLabel: string;
        run: () => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
        customContent?: ReactNode;
        maxWidthClass?: string;
        secondaryAction?: {
          label: string;
          onClick: () => void;
          loading?: boolean;
        };
        confirmLabel?: string;
      }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);

  // Notification & sound preferences
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    user.notificationPreferences || {
      inAppAlerts: true,
      soundEnabled: false,
      emailBallots: true,
      emailRepayments: true,
      emailCommunity: true,
      pushAlerts: true,
    }
  );
  const [prefsBusy, setPrefsBusy] = useState(false);

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

  const populateForm = useCallback((loaded: PublicUser) => {
    const reg = loaded.registrationDetails;
    setProfile(loaded);
    setName(loaded.name || '');
    setNameBn(reg?.nameBn || '');
    setEmail(loaded.email || '');
    setMobile(reg?.mobile || '');
    setFatherName(reg?.fatherName || '');
    setFatherNameBn(reg?.fatherNameBn || '');
    setMotherName(reg?.motherName || '');
    setMotherNameBn(reg?.motherNameBn || '');
    setDateOfBirth(reg?.dateOfBirth || '');
    const savedGender: '' | MemberGender = reg?.gender || '';
    setGender(savedGender);
    setMaritalStatus(reg?.maritalStatus || '');
    setNid(reg?.nid || '');
    setSpouseName(reg?.maritalStatus === 'single' ? '' : reg?.spouseName || '');
    setSpouseNameBn(reg?.maritalStatus === 'single' ? '' : reg?.spouseNameBn || '');
    setReferenceMemberName(reg?.referenceMemberName || '');
    setOccupation(reg?.occupation || '');
    setCompanyOrganization(reg?.companyOrganization || '');

    const savedWhatsapp = reg?.socialMedia?.whatsapp || '';
    const savedFacebook = reg?.socialMedia?.facebook || '';
    const savedLinkedin = reg?.socialMedia?.linkedin || '';
    setWhatsapp(savedWhatsapp);
    setFacebook(savedFacebook);
    setLinkedin(savedLinkedin);
    setShowSocialSection(Boolean(savedWhatsapp || savedFacebook || savedLinkedin));

    const hydratedPresent = hydrateStructuredBdAddress(
      reg?.presentAddressDetails,
      reg?.presentAddress
    );
    const hydratedPermanent = hydrateStructuredBdAddress(
      reg?.permanentAddressDetails,
      reg?.permanentAddress
    );
    const matchesSameAddress =
      Object.values(hydratedPresent).some(Boolean) &&
      areBdAddressesEqual(hydratedPresent, hydratedPermanent);
    setPresentAddressDetails(hydratedPresent);
    setPermanentAddressDetails(hydratedPermanent);
    setSameAsPresent(matchesSameAddress);

    const savedPresentStr = formatBdAddress(hydratedPresent) || reg?.presentAddress || '';
    if (reg?.nominees && reg.nominees.length > 0) {
      setNominees(
        reg.nominees.map((nom, idx) =>
          nomineeInfoToDraft(nom, idx, savedGender, savedPresentStr)
        )
      );
    } else {
      setNominees([createEmptyNomineeDraft('100', 'profile-nom-1')]);
    }

    setPhotoUrl(reg?.photoUrl || loaded.photoUrl || '');
    setSignatureUrl(reg?.signatureUrl || '');
    setPendingSignature(null);
    setCredError(null);

    if (loaded.notificationPreferences) {
      setPrefs(loaded.notificationPreferences);
    }
    setPhotoBroken(false);
    setAgreementBroken(false);
  }, []);

  const tRef = useRef(t);
  tRef.current = t;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [res, reqRes, refRes] = await Promise.all([
        api.getProfile(),
        api.getProfileChangeRequests().catch(() => ({ requests: [] as ProfileChangeRequest[] })),
        api.getReferenceMembers().catch(() => ({ members: [] as Array<{ name: string; memberCode: string }> })),
      ]);
      populateForm(res.user);
      setChangeRequests(reqRes.requests.filter((r) => r.userId === user.id));
      setReferenceOptions(refRes.members || []);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: tRef.current('loadFailedTitle'),
        description: err instanceof Error ? err.message : tRef.current('loadFailedDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [populateForm, user.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

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

  useEffect(() => {
    const syncLocal = () => {
      const local = getLocalDeviceForUser(user.id);
      setLocalDeviceId(local?.deviceId || null);
      setDeviceNameInput((prev) => prev || local?.deviceName || detectDefaultMobileDeviceName());
    };
    syncLocal();
    window.addEventListener('amanah:mobile-devices-updated', syncLocal);
    return () => window.removeEventListener('amanah:mobile-devices-updated', syncLocal);
  }, [user.id]);

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
    setCredError(null);
    setNominees((prev) => {
      if (prev.length >= 10) return prev;
      if (prev.length === 1 && (Number(prev[0].sharePercentage) === 100 || !prev[0].sharePercentage)) {
        return [{ ...prev[0], sharePercentage: '50' }, createEmptyNomineeDraft('50')];
      }
      const existingSum = prev.reduce((sum, n) => {
        const val = Number(n.sharePercentage);
        return Number.isFinite(val) && val > 0 ? sum + val : sum;
      }, 0);
      const remaining = Math.max(0, Math.round((100 - existingSum) * 100) / 100);
      return [...prev, createEmptyNomineeDraft(remaining > 0 ? String(remaining) : '')];
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
      const base = Math.floor(10000 / count) / 100;
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
      setCredError(tSignUp('errInvalidImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCredError(tSignUp('errFileTooLarge'));
      return;
    }

    setCredError(null);
    setPhotoUploading(true);

    try {
      const res = await api.uploadFile(file, {
        name: file.name,
        category: 'member-kyc-photo',
        subject: name.trim() || email.trim() || profile.memberCode,
      });
      setPhotoUrl(res.url);
    } catch (err) {
      setCredError(err instanceof Error ? err.message : tSignUp('errUploadFailed'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function uploadSignatureFile(file: File) {
    setSignatureUploading(true);
    setCredError(null);
    try {
      const res = await api.uploadFile(file, {
        name: file.name,
        category: 'member-signature',
        subject: name.trim() || email.trim() || profile.memberCode,
      });
      setSignatureUrl(res.url);
      setPendingSignature(null);
    } catch (err) {
      setCredError(err instanceof Error ? err.message : tSignUp('errSignatureUploadFailed'));
    } finally {
      setSignatureUploading(false);
    }
  }

  function handleSignatureSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCredError(tSignUp('errInvalidSignature'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCredError(tSignUp('errSignatureSize'));
      return;
    }

    setCredError(null);
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
      setCredError(tSignUp('errInvalidSignature'));
    };
    img.src = previewUrl;
  }

  async function handleAutoResizeSignature() {
    if (!pendingSignature) return;
    setSignatureUploading(true);
    setCredError(null);

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
      setCredError(err instanceof Error ? err.message : tSignUp('errSignatureUploadFailed'));
      setSignatureUploading(false);
    }
  }

  async function handleNomineePhotoUpload(index: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCredError(tSignUp('errNomineeImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCredError(tSignUp('errNomineeSize'));
      return;
    }

    setCredError(null);
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
      setCredError(err instanceof Error ? err.message : tSignUp('errNomineeUploadFailed'));
      setNominees((prev) =>
        prev.map((item, i) => (i === index ? { ...item, photoUploading: false } : item))
      );
    }
  }

  function handleSaveContactInfo(e: FormEvent) {
    e.preventDefault();
    setCredError(null);

    if (
      !name.trim() ||
      !email.trim() ||
      !mobile.trim() ||
      !fatherName.trim() ||
      !motherName.trim() ||
      !dateOfBirth.trim() ||
      !gender ||
      !maritalStatus ||
      !nid.trim() ||
      !occupation.trim() ||
      !companyOrganization.trim()
    ) {
      setCredError(t('missingCredentialsDesc'));
      return;
    }

    if (maritalStatus === 'married' && !spouseName.trim()) {
      setCredError(tSignUp('errSpouseRequired'));
      return;
    }

    const englishOnlyFields: Array<{ field: string; value: string }> = [
      { field: tSignUp('fullName'), value: name },
      { field: tAuth('email'), value: email },
      { field: tSignUp('fatherName'), value: fatherName },
      { field: tSignUp('motherName'), value: motherName },
      { field: tSignUp('spouseName'), value: maritalStatus === 'single' ? '' : spouseName },
      { field: tSignUp('mobile'), value: mobile },
      { field: tSignUp('nid'), value: nid },
      { field: tSignUp('referenceLabel'), value: referenceMemberName },
      { field: tSignUp('occupation'), value: occupation },
      { field: tSignUp('company'), value: companyOrganization },
      { field: tSignUp('whatsappLabel'), value: whatsapp },
      { field: tSignUp('facebookLabel'), value: facebook },
      { field: tSignUp('linkedinLabel'), value: linkedin },
      { field: tSignUp('presentAddress'), value: presentAddress },
      { field: tSignUp('permanentAddress'), value: permanentAddress },
    ];
    for (const item of englishOnlyFields) {
      if (item.value && containsBanglaScript(item.value)) {
        setCredError(tSignUp('errEnglishOnlyField', { field: item.field }));
        return;
      }
    }

    const banglaNameFields: Array<{ field: string; value: string }> = [
      { field: tSignUp('fullNameBn'), value: nameBn },
      { field: tSignUp('fatherNameBn'), value: fatherNameBn },
      { field: tSignUp('motherNameBn'), value: motherNameBn },
      { field: tSignUp('spouseNameBn'), value: maritalStatus === 'single' ? '' : spouseNameBn },
    ];
    for (const item of banglaNameFields) {
      if (item.value.trim() && !isValidBanglaName(item.value)) {
        setCredError(tSignUp('errBanglaNameField', { field: item.field }));
        return;
      }
    }

    if (!isBdAddressComplete(presentAddressDetails)) {
      setCredError(tSignUp('errPresentAddressIncomplete'));
      return;
    }
    if (!isBdAddressComplete(effectivePermanentAddressDetails)) {
      setCredError(tSignUp('errPermanentAddressIncomplete'));
      return;
    }
    if (!photoUrl) {
      setCredError(tSignUp('errPhotoRequired'));
      return;
    }
    if (!signatureUrl) {
      setCredError(tSignUp('errSignatureRequired'));
      return;
    }

    const preparedNominees: NomineeInfo[] = [];
    const multipleNominees = nominees.length > 1;
    let shareSum = 0;

    for (let i = 0; i < nominees.length; i += 1) {
      const n = nominees[i];
      const prefix = multipleNominees
        ? tSignUp('nomineeNumber', { number: i + 1 })
        : tSignUp('primaryNominee');
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
        setCredError(tSignUp('errNomineeIncomplete', { prefix }));
        return;
      }

      const nomineeEnglishChecks: Array<{ field: string; value: string }> = [
        { field: `${prefix} · ${tSignUp('nomineeName')}`, value: n.name },
        { field: `${prefix} · ${tSignUp('occupation')}`, value: n.occupation },
        { field: `${prefix} · ${tSignUp('relation')}`, value: resolvedRelation },
        { field: `${prefix} · ${tSignUp('nidBirthReg')}`, value: n.nidOrBirthReg },
        { field: `${prefix} · ${tSignUp('nomineeMobile')}`, value: n.mobile },
        { field: `${prefix} · ${tSignUp('nomineeAddress')}`, value: n.address },
      ];
      for (const item of nomineeEnglishChecks) {
        if (item.value && containsBanglaScript(item.value)) {
          setCredError(tSignUp('errEnglishOnlyField', { field: item.field }));
          return;
        }
      }
      if (n.nameBn.trim() && !isValidBanglaName(n.nameBn)) {
        setCredError(tSignUp('errBanglaNameField', { field: `${prefix} · ${tSignUp('nomineeNameBn')}` }));
        return;
      }

      if (n.gender !== 'female' && !n.photoUrl) {
        setCredError(tSignUp('errNomineePhotoRequired', { prefix }));
        return;
      }

      let sharePercentage = 100;
      if (multipleNominees) {
        const parsed = Number(n.sharePercentage);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
          setCredError(tSignUp('errNomineeShareRange', { prefix }));
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
      setCredError(tSignUp('errTotalShare', { current: Math.round(shareSum * 100) / 100 }));
      return;
    }

    const payload: ProfileChangePayload = {
      name: name.trim(),
      nameBn: nameBn.trim(),
      email: email.trim(),
      fatherName: fatherName.trim(),
      fatherNameBn: fatherNameBn.trim(),
      motherName: motherName.trim(),
      motherNameBn: motherNameBn.trim(),
      gender: gender as MemberGender,
      maritalStatus: maritalStatus as MaritalStatus,
      spouseName: maritalStatus === 'single' ? '' : spouseName.trim(),
      spouseNameBn: maritalStatus === 'single' ? '' : spouseNameBn.trim(),
      dateOfBirth: dateOfBirth.trim(),
      referenceMemberName: referenceMemberName.trim(),
      mobile: mobile.trim(),
      occupation: occupation.trim(),
      companyOrganization: companyOrganization.trim(),
      nid: nid.trim(),
      presentAddress,
      permanentAddress,
      presentAddressDetails: { ...presentAddressDetails },
      permanentAddressDetails: { ...effectivePermanentAddressDetails },
      socialMedia: {
        whatsapp: whatsapp.trim() || undefined,
        facebook: facebook.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
      },
      photoUrl,
      signatureUrl,
      nominees: preparedNominees,
    };

    const savedReg = profile.registrationDetails;
    const savedPresentDetails = hydrateStructuredBdAddress(
      savedReg?.presentAddressDetails,
      savedReg?.presentAddress
    );
    const savedPermanentDetails = hydrateStructuredBdAddress(
      savedReg?.permanentAddressDetails,
      savedReg?.permanentAddress
    );

    const changedFields = new Set<string>();
    if ((payload.name || '') !== (profile.name || '').trim()) changedFields.add('name');
    if ((payload.nameBn || '') !== (savedReg?.nameBn || '').trim()) changedFields.add('nameBn');
    if ((payload.email || '').toLowerCase() !== (profile.email || '').trim().toLowerCase()) {
      changedFields.add('email');
    }
    if ((payload.fatherName || '') !== (savedReg?.fatherName || '').trim()) {
      changedFields.add('fatherName');
    }
    if ((payload.fatherNameBn || '') !== (savedReg?.fatherNameBn || '').trim()) {
      changedFields.add('fatherNameBn');
    }
    if ((payload.motherName || '') !== (savedReg?.motherName || '').trim()) {
      changedFields.add('motherName');
    }
    if ((payload.motherNameBn || '') !== (savedReg?.motherNameBn || '').trim()) {
      changedFields.add('motherNameBn');
    }
    if ((payload.gender || '') !== (savedReg?.gender || '')) changedFields.add('gender');
    if ((payload.maritalStatus || '') !== (savedReg?.maritalStatus || '')) {
      changedFields.add('maritalStatus');
    }
    const savedSpouse = savedReg?.maritalStatus === 'single' ? '' : (savedReg?.spouseName || '').trim();
    const savedSpouseBn =
      savedReg?.maritalStatus === 'single' ? '' : (savedReg?.spouseNameBn || '').trim();
    if ((payload.spouseName || '') !== savedSpouse) changedFields.add('spouseName');
    if ((payload.spouseNameBn || '') !== savedSpouseBn) changedFields.add('spouseNameBn');
    if ((payload.dateOfBirth || '') !== (savedReg?.dateOfBirth || '').trim()) {
      changedFields.add('dateOfBirth');
    }
    if ((payload.referenceMemberName || '') !== (savedReg?.referenceMemberName || '').trim()) {
      changedFields.add('referenceMemberName');
    }
    if ((payload.mobile || '') !== (savedReg?.mobile || '').trim()) changedFields.add('mobile');
    if ((payload.occupation || '') !== (savedReg?.occupation || '').trim()) {
      changedFields.add('occupation');
    }
    if ((payload.companyOrganization || '') !== (savedReg?.companyOrganization || '').trim()) {
      changedFields.add('companyOrganization');
    }
    if ((payload.nid || '') !== (savedReg?.nid || '').trim()) changedFields.add('nid');
    if (
      !areBdAddressesEqual(presentAddressDetails, savedPresentDetails) ||
      presentAddress !== (savedReg?.presentAddress || '').trim()
    ) {
      changedFields.add('presentAddress');
    }
    if (
      !areBdAddressesEqual(effectivePermanentAddressDetails, savedPermanentDetails) ||
      permanentAddress !== (savedReg?.permanentAddress || '').trim()
    ) {
      changedFields.add('permanentAddress');
    }
    if (
      (payload.socialMedia?.whatsapp || '') !== (savedReg?.socialMedia?.whatsapp || '').trim() ||
      (payload.socialMedia?.facebook || '') !== (savedReg?.socialMedia?.facebook || '').trim() ||
      (payload.socialMedia?.linkedin || '') !== (savedReg?.socialMedia?.linkedin || '').trim()
    ) {
      changedFields.add('socialMedia');
    }
    if ((payload.photoUrl || '') !== (savedReg?.photoUrl || profile.photoUrl || '').trim()) {
      changedFields.add('photoUrl');
    }
    if ((payload.signatureUrl || '') !== (savedReg?.signatureUrl || '').trim()) {
      changedFields.add('signatureUrl');
    }
    const normalizeNomineeCompare = (list: NomineeInfo[] = []) =>
      list.map((item) => ({
        name: item.name.trim(),
        nameBn: (item.nameBn || '').trim(),
        dateOfBirth: item.dateOfBirth.trim(),
        gender: item.gender,
        occupation: item.occupation.trim(),
        relation: item.relation.trim(),
        sharePercentage: Number(item.sharePercentage),
        nidOrBirthReg: item.nidOrBirthReg.trim(),
        mobile: (item.mobile || '').trim(),
        address: item.address.trim(),
        photoUrl: item.gender === 'female' ? '' : (item.photoUrl || '').trim(),
      }));
    if (
      JSON.stringify(normalizeNomineeCompare(preparedNominees)) !==
      JSON.stringify(normalizeNomineeCompare(savedReg?.nominees || []))
    ) {
      changedFields.add('nominees');
    }

    const previewRegistrationDetails: UserRegistrationDetails = {
      nameBn: payload.nameBn || undefined,
      fatherName: payload.fatherName || undefined,
      fatherNameBn: payload.fatherNameBn || undefined,
      motherName: payload.motherName || undefined,
      motherNameBn: payload.motherNameBn || undefined,
      gender: payload.gender,
      maritalStatus: payload.maritalStatus,
      spouseName: payload.spouseName || undefined,
      spouseNameBn: payload.spouseNameBn || undefined,
      dateOfBirth: payload.dateOfBirth || '',
      referenceMemberName: payload.referenceMemberName || '',
      mobile: payload.mobile || '',
      occupation: payload.occupation || '',
      companyOrganization: payload.companyOrganization || '',
      nid: payload.nid || '',
      presentAddress: payload.presentAddress || '',
      permanentAddress: payload.permanentAddress || '',
      presentAddressDetails: payload.presentAddressDetails,
      permanentAddressDetails: payload.permanentAddressDetails,
      socialMedia: payload.socialMedia,
      photoUrl: payload.photoUrl || '',
      signatureUrl: payload.signatureUrl || undefined,
      agreementPhotoUrl: savedReg?.agreementPhotoUrl,
      nominees: preparedNominees,
      digitalAgreement: savedReg?.digitalAgreement,
    };
    const previewSubmittedAt = new Date().toISOString();

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      maxWidthClass: 'max-w-4xl',
      title:
        user.role === 'admin'
          ? t('confirmSaveAdminTitle')
          : t('confirmSaveMemberTitle'),
      description:
        user.role === 'admin'
          ? t('confirmSaveAdminDesc')
          : t('confirmSaveMemberDesc'),
      customContent: (
        <MemberAgreementPaperPreview
          applicantName={payload.name || profile.name}
          email={payload.email || profile.email}
          memberCode={profile.memberCode}
          status={profile.status}
          submittedAt={previewSubmittedAt}
          registrationDetails={previewRegistrationDetails}
          changedFields={changedFields}
          statusNote={
            user.role === 'admin' ? 'Direct Admin Update' : 'Pending Admin Approval'
          }
        />
      ),
      secondaryAction: {
        label: tCommon('downloadPdf'),
        onClick: () => {
          void downloadMembershipApplicationPdf({
            applicantName: payload.name || profile.name,
            email: payload.email || profile.email,
            memberCode: profile.memberCode,
            status: profile.status,
            submittedAt: previewSubmittedAt,
            registrationDetails: previewRegistrationDetails,
            locale,
          });
        },
      },
      confirmLabel: user.role === 'admin' ? t('confirmSaveAdminBtn') : t('confirmSaveMemberBtn'),
      run: async () => {
        setSaving(true);
        try {
          const res = await api.updateProfile(payload);
          setModal(null);
          if (res.pendingApproval) {
            await loadProfile();
            await onRefresh();
            toast.success(
              t('updateSubmittedTitle'),
              res.message || t('updateSubmittedDesc')
            );
          } else {
            populateForm(res.user);
            setUser(res.user);
            await onRefresh();
            toast.success(t('profileSavedTitle'), t('profileSavedDesc'));
          }
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('saveFailedTitle'),
            description:
              err instanceof Error ? err.message : t('saveFailedDesc'),
          });
        } finally {
          setSaving(false);
        }
      },
    });
  }

  function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('passwordShortTitle'),
        description: t('passwordShortDesc'),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('passwordMismatchTitle'),
        description: t('passwordMismatchDesc'),
      });
      return;
    }
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('confirmPasswordTitle'),
      description: t('confirmPasswordDesc'),
      confirmLabel: t('confirmPasswordBtn'),
      run: async () => {
        setPasswordBusy(true);
        try {
          const res = await api.changePassword(currentPassword, newPassword);
          setUser(res.user);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setModal(null);
          toast.success(t('passwordUpdatedTitle'), t('passwordUpdatedDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('passwordFailedTitle'),
            description: err instanceof Error ? err.message : t('passwordFailedDesc'),
          });
        } finally {
          setPasswordBusy(false);
        }
      },
    });
  }

  async function handleStart2faSetup() {
    setTotpBusy(true);
    try {
      const res = await api.setup2fa();
      setTotpSetupData(res);
      setTotpCodeInput('');
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('totpSetupFailedTitle'),
        description: err instanceof Error ? err.message : t('totpSetupFailedDesc'),
      });
    } finally {
      setTotpBusy(false);
    }
  }

  function handleEnable2fa(e: FormEvent) {
    e.preventDefault();
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmEnable2faTitle'),
      description: t('confirmEnable2faDesc'),
      details: [{ label: t('detailVerificationCode'), value: totpCodeInput.trim() }],
      confirmLabel: t('confirmEnable2faBtn'),
      run: async () => {
        setTotpBusy(true);
        try {
          const res = await api.enable2fa(totpCodeInput.trim());
          setUser(res.user);
          setProfile(res.user);
          setTotpSetupData(null);
          setTotpCodeInput('');
          setModal(null);
          await onRefresh();
          toast.success(t('enabled2faTitle'), t('enabled2faDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('verifyFailedTitle'),
            description: err instanceof Error ? err.message : t('verifyFailedDesc'),
          });
        } finally {
          setTotpBusy(false);
        }
      },
    });
  }

  function handleRegisterMobileDevice(e: FormEvent) {
    e.preventDefault();
    const cleanPin = devicePin.trim();
    const cleanConfirm = devicePinConfirm.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidPinTitle'),
        description: t('invalidPinDesc'),
      });
      return;
    }
    if (cleanPin !== cleanConfirm) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('pinMismatchTitle'),
        description: t('pinMismatchDesc'),
      });
      return;
    }

    const label = deviceNameInput.trim() || detectDefaultMobileDeviceName();
    const registeredList = profile.registeredDevices || [];
    const matchedServerLocal =
      localDeviceId && registeredList.some((d) => d.deviceId === localDeviceId)
        ? localDeviceId
        : undefined;

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: matchedServerLocal ? t('confirmUpdatePinTitle') : t('confirmRegisterDeviceTitle'),
      description: matchedServerLocal
        ? t('confirmUpdatePinDesc')
        : t('confirmRegisterDeviceDesc'),
      details: [
        { label: t('detailAccount'), value: `${profile.name} (${profile.memberCode})` },
        { label: t('detailDeviceName'), value: label },
      ],
      confirmLabel: matchedServerLocal ? t('confirmUpdatePinBtn') : t('confirmRegisterDeviceBtn'),
      run: async () => {
        setDevicePinBusy(true);
        try {
          const res = await api.registerMobileDevice({
            pin: cleanPin,
            deviceName: label,
            existingDeviceId: matchedServerLocal,
          });
          saveRegisteredMobileAccount({
            userId: res.user.id,
            name: res.user.name,
            email: res.user.email,
            memberCode: res.user.memberCode,
            role: res.user.role,
            photoUrl: res.user.photoUrl,
            deviceId: res.device.deviceId,
            deviceSecret: res.deviceSecret,
            deviceName: res.device.deviceName,
            registeredAt: res.device.createdAt,
            lastUsedAt: res.device.lastUsedAt,
          });
          setLocalDeviceId(res.device.deviceId);
          setUser(res.user);
          setProfile(res.user);
          setDevicePin('');
          setDevicePinConfirm('');
          setModal(null);
          toast.success(
            matchedServerLocal ? t('pinUpdatedTitle') : t('deviceRegisteredTitle'),
            t('deviceRegisteredDesc')
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deviceRegFailedTitle'),
            description:
              err instanceof Error ? err.message : t('deviceRegFailedDesc'),
          });
        } finally {
          setDevicePinBusy(false);
        }
      },
    });
  }

  function handleRevokeMobileDevice(deviceId: string, deviceName: string) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('confirmRemoveDeviceTitle'),
      description: t('confirmRemoveDeviceDesc', { deviceName }),
      details: [{ label: t('detailDevice'), value: deviceName }],
      confirmLabel: t('confirmRemoveDeviceBtn'),
      run: async () => {
        setDevicePinBusy(true);
        try {
          const res = await api.revokeMobileDevice(deviceId);
          if (localDeviceId === deviceId) {
            removeRegisteredMobileAccount(profile.id, deviceId);
            setLocalDeviceId(null);
          }
          setUser(res.user);
          setProfile(res.user);
          setModal(null);
          toast.success(
            t('deviceRemovedTitle'),
            t('deviceRemovedDesc', { deviceName })
          );
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deviceRemoveFailedTitle'),
            description:
              err instanceof Error ? err.message : t('deviceRemoveFailedDesc'),
          });
        } finally {
          setDevicePinBusy(false);
        }
      },
    });
  }

  function handleDisable2fa(e: FormEvent) {
    e.preventDefault();
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('confirmDisable2faTitle'),
      description: t('confirmDisable2faDesc'),
      confirmLabel: t('confirmDisable2faBtn'),
      run: async () => {
        setTotpBusy(true);
        try {
          const res = await api.disable2fa(totpCodeInput.trim());
          setUser(res.user);
          setProfile(res.user);
          setTotpCodeInput('');
          setModal(null);
          await onRefresh();
          toast.success(t('disabled2faTitle'), t('disabled2faDesc'));
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('disable2faFailedTitle'),
            description: err instanceof Error ? err.message : t('disable2faFailedDesc'),
          });
        } finally {
          setTotpBusy(false);
        }
      },
    });
  }

  async function handleTogglePref(key: keyof NotificationPreferences) {
    const currentVal = key === 'pushAlerts' ? prefs.pushAlerts !== false : Boolean(prefs[key]);
    const nextVal = !currentVal;
    const next = { ...prefs, [key]: nextVal };
    setPrefs(next);
    setPrefsBusy(true);
    try {
      const res = await api.updatePreferences({ [key]: nextVal });
      setUser(res.user);
      setProfile(res.user);
      setPrefs(res.user.notificationPreferences || next);
      if (key === 'pushAlerts') {
        if (nextVal) {
          void syncFcmPushSubscription({ requestPermission: true });
        } else {
          void unregisterFcmPushSubscription();
        }
      }
    } catch (err) {
      setPrefs(prefs);
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('prefFailedTitle'),
        description:
          err instanceof Error ? err.message : t('prefFailedDesc'),
      });
    } finally {
      setPrefsBusy(false);
    }
  }

  const reg = profile.registrationDetails;
  const portraitUrl = reg?.photoUrl || profile.photoUrl;
  const agreementUrl = reg?.agreementPhotoUrl;

  const statusMeta =
    profile.status === 'active'
      ? {
          label: t('status.active.label'),
          shortLabel: t('status.active.short'),
          description: t('status.active.desc'),
          Icon: CheckCircle2,
          toneClass: 'text-emerald-700 dark:text-emerald-400',
          boxClass:
            'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60',
        }
      : profile.status === 'pending_approval'
        ? {
            label: t('status.pending_approval.label'),
            shortLabel: t('status.pending_approval.short'),
            description: t('status.pending_approval.desc'),
            Icon: Clock,
            toneClass: 'text-amber-700 dark:text-amber-400',
            boxClass:
              'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
          }
        : profile.status === 'pending_activation'
          ? {
              label: t('status.pending_activation.label'),
              shortLabel: t('status.pending_activation.short'),
              description: t('status.pending_activation.desc'),
              Icon: Clock,
              toneClass: 'text-teal-700 dark:text-teal-400',
              boxClass:
                'bg-teal-50/80 dark:bg-teal-950/30 border-teal-200 dark:border-teal-900/60',
            }
          : {
              label: t('status.suspended.label'),
              shortLabel: t('status.suspended.short'),
              description: t('status.suspended.desc'),
              Icon: AlertCircle,
              toneClass: 'text-rose-700 dark:text-rose-400',
              boxClass: 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60',
            };

  const StatusIcon = statusMeta.Icon;

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-4">
            <Skeleton width={64} height={64} borderRadius={12} />
            <div className="space-y-1.5">
              <Skeleton width={200} height={20} />
              <Skeleton width={260} height={14} />
            </div>
          </div>
          <Skeleton height={56} />
        </section>
        <section className="bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
          <Skeleton height={240} />
        </section>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      {/* Membership Status & Identity Summary */}
      <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-5 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {portraitUrl && !photoBroken ? (
              <a
                href={portraitUrl}
                target="_blank"
                rel="noreferrer"
                className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 block"
              >
                <img
                  src={portraitUrl}
                  alt={t('portraitAlt', { name: profile.name })}
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoBroken(true)}
                  className="w-full h-full object-cover"
                />
              </a>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-base font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <UserIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('eyebrow')}</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                {profile.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>{profile.memberCode}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize font-sans">{translateRoleLabel(profile.role, locale)}</span>
                <span aria-hidden="true">·</span>
                <span>{t('joinedPrefix', { date: formatDateTime(profile.joinedAt) })}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadProfile()}
            className="w-full md:w-auto justify-center min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-stretch md:self-center cursor-pointer transition-all duration-150 active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('refreshProfile')}</span>
          </button>
        </div>

        {/* Current Membership Status Strip */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${statusMeta.boxClass}`}>
          <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${statusMeta.toneClass}`} aria-hidden="true" />
          <div className="space-y-0.5 min-w-0">
            <div className={`text-xs font-semibold ${statusMeta.toneClass}`}>
              {t('membershipStatusLine', {
                label: statusMeta.label,
                short: statusMeta.shortLabel,
              })}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {statusMeta.description}
            </p>
          </div>
        </div>
      </section>

      {/* Main Split: Registration KYC Details (Read-Only) + Editable Contact Info */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Read-Only Registration Details */}
        <section className="xl:col-span-5 bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('credentials')}
            aria-expanded={expandedTopics.credentials}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{profile.memberCode}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {t('credentialsTitle')}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold inline-flex items-center gap-1 ${statusMeta.toneClass}`}>
                <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{statusMeta.shortLabel}</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-200 ${
                  expandedTopics.credentials
                    ? 'rotate-180 text-teal-600 dark:text-teal-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {expandedTopics.credentials && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 space-y-5">
                  <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldStatus')}</dt>
                      <dd className={`font-semibold inline-flex items-center gap-1.5 text-right ${statusMeta.toneClass}`}>
                        <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{statusMeta.label}</span>
                      </dd>
                    </div>
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldMemberCode')}</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white text-right">
                        {profile.memberCode}
                      </dd>
                    </div>
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldNid')}</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white text-right break-all">
                        {reg?.nid || t('nidNotProvided')}
                      </dd>
                    </div>
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldDob')}</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white text-right">
                        {reg?.dateOfBirth || t('notProvided')}
                      </dd>
                    </div>
                    {reg?.nameBn && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">নাম (বাংলা)</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.nameBn}
                        </dd>
                      </div>
                    )}
                    {reg?.fatherName && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldFatherName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          <div>{reg.fatherName}</div>
                          {reg.fatherNameBn && (
                            <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                              {reg.fatherNameBn}
                            </div>
                          )}
                        </dd>
                      </div>
                    )}
                    {reg?.motherName && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldMotherName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          <div>{reg.motherName}</div>
                          {reg.motherNameBn && (
                            <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                              {reg.motherNameBn}
                            </div>
                          )}
                        </dd>
                      </div>
                    )}
                    {reg?.gender && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldGender')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.gender === 'male'
                            ? t('genderMale')
                            : reg.gender === 'female'
                              ? t('genderFemale')
                              : t('genderOther')}
                        </dd>
                      </div>
                    )}
                    {reg?.maritalStatus && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldMaritalStatus')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.maritalStatus === 'single'
                            ? t('maritalSingle')
                            : reg.maritalStatus === 'married'
                              ? t('maritalMarried')
                              : reg.maritalStatus === 'widowed'
                                ? t('maritalWidowed')
                                : t('maritalDivorced')}
                        </dd>
                      </div>
                    )}
                    {(reg?.spouseName || reg?.spouseNameBn) && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldSpouseName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.spouseName && <div>{reg.spouseName}</div>}
                          {reg.spouseNameBn && (
                            <div className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                              {reg.spouseNameBn}
                            </div>
                          )}
                        </dd>
                      </div>
                    )}
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldReferenceMember')}</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white text-right">
                        {reg?.referenceMemberName || t('referenceBootstrap')}
                      </dd>
                    </div>
                    <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <dt className="text-slate-500 dark:text-slate-400">{t('fieldEncryptedMobile')}</dt>
                      <dd className="font-mono text-slate-900 dark:text-white text-right">
                        {reg?.mobile || profile.phoneMasked || t('notSet')}
                      </dd>
                    </div>
                  </dl>

                  {agreementUrl && !agreementBroken && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {t('signedAgreementTitle')}
                        </span>
                        <a
                          href={agreementUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{isPdfFileUrl(agreementUrl) ? t('openAgreementPdf') : t('openFullImage')}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                      {isPdfFileUrl(agreementUrl) ? (
                        <a
                          href={agreementUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-between gap-3 hover:border-emerald-400 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" aria-hidden="true" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {t('signedAgreementPdfCardTitle')}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t('storedOnImageKit')}
                              </div>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 aspect-[16/10]">
                          <img
                            src={agreementUrl}
                            alt={t('signedAgreementAlt', { name: profile.name })}
                            referrerPolicy="no-referrer"
                            onError={() => setAgreementBroken(true)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {reg?.signatureUrl && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {t('signatureTitle')}
                        </span>
                        <a
                          href={reg.signatureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{t('openFullImage')}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                      <div className="w-[300px] max-w-full h-[80px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white flex items-center justify-center">
                        <img
                          src={reg.signatureUrl}
                          alt={t('signatureAlt', { name: profile.name })}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {(reg?.socialMedia?.whatsapp ||
                    reg?.socialMedia?.facebook ||
                    reg?.socialMedia?.linkedin) && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                      <div className="font-medium text-slate-700 dark:text-slate-300">
                        {t('socialProfilesTitle')}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {reg.socialMedia.whatsapp && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 font-mono text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                            {t('whatsapp')}: {reg.socialMedia.whatsapp}
                          </span>
                        )}
                        {reg.socialMedia.facebook && (
                          <a
                            href={reg.socialMedia.facebook}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            <span>{t('facebook')}</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        )}
                        {reg.socialMedia.linkedin && (
                          <a
                            href={reg.socialMedia.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:underline"
                          >
                            <span>{t('linkedin')}</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {reg?.nominees && reg.nominees.length > 0 && (
                    <NomineeDetailsList nominees={reg.nominees} compact />
                  )}

                  {reg && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/45 dark:bg-emerald-950/25 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                            <ShieldCheck
                              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{t('digitalAgreementTitle')}</span>
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            {t('encryptedJsonBadge')}
                          </span>
                        </div>

                        {reg.digitalAgreement ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {t('agreementIdLabel')}:{' '}
                              </span>
                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {reg.digitalAgreement.agreementId}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {t('agreementSignedLabel')}:{' '}
                              </span>
                              <span className="font-mono">
                                {formatDateTime(reg.digitalAgreement.signedAt)}
                              </span>
                            </div>
                            {reg.digitalAgreement.activatedAt && (
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {t('agreementActivatedLabel')}:{' '}
                                </span>
                                <span className="font-mono text-emerald-700 dark:text-emerald-400">
                                  {formatDateTime(reg.digitalAgreement.activatedAt)}
                                </span>
                              </div>
                            )}
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              SHA-256: {reg.digitalAgreement.sha256Hash.slice(0, 16).toUpperCase()}…
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {t('digitalAgreementDesc')}
                          </p>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (!reg) return;
                              setModal({
                                mode: 'notice',
                                tone: 'slate',
                                maxWidthClass: 'max-w-4xl',
                                title: t('digitalAgreementTitle'),
                                description: t('previewAgreementModalDesc'),
                                customContent: (
                                  <MemberAgreementPaperPreview
                                    applicantName={profile.name}
                                    email={profile.email}
                                    memberCode={profile.memberCode}
                                    status={profile.status}
                                    submittedAt={profile.joinedAt}
                                    registrationDetails={reg}
                                    footerRightText={t('a4FormatFooter')}
                                  />
                                ),
                                secondaryAction: {
                                  label: t('downloadApplicationPdf'),
                                  onClick: () => {
                                    void downloadMembershipApplicationPdf({
                                      applicantName: profile.name,
                                      email: profile.email,
                                      memberCode: profile.memberCode,
                                      status: profile.status,
                                      submittedAt: profile.joinedAt,
                                      registrationDetails: reg,
                                      locale,
                                    });
                                  },
                                },
                                confirmLabel: tCommon('close'),
                              });
                            }}
                            className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t('previewDigitalAgreement')}</span>
                          </button>

                          <button
                            type="button"
                            disabled={downloadingAppPdf}
                            onClick={async () => {
                              if (!reg || downloadingAppPdf) return;
                              setDownloadingAppPdf(true);
                              try {
                                await downloadMembershipApplicationPdf({
                                  applicantName: profile.name,
                                  email: profile.email,
                                  memberCode: profile.memberCode,
                                  status: profile.status,
                                  submittedAt: profile.joinedAt,
                                  registrationDetails: reg,
                                  locale,
                                });
                              } finally {
                                setDownloadingAppPdf(false);
                              }
                            }}
                            className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-55 transition-colors"
                          >
                            {downloadingAppPdf ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>
                              {downloadingAppPdf ? t('generatingPdf') : t('downloadApplicationPdf')}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Editable Member Credentials Form (Matches User Registration Form without Password) */}
        <section className="xl:col-span-7 amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('contact')}
            aria-expanded={expandedTopics.contact}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <UserIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{profile.email}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {t('updateContactTitle')}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {changeRequests.some((r) => r.status === 'pending') && (
                <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
              )}
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-200 ${
                  expandedTopics.contact
                    ? 'rotate-180 text-teal-600 dark:text-teal-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {expandedTopics.contact && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 space-y-4">
                  {user.role !== 'admin' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('editsRequireApproval')}
                    </p>
                  )}

                  {locale === 'bn' && (
                    <div className="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-start gap-2.5">
                      <Languages
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div className="space-y-0.5 text-xs">
                        <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                          {tSignUp('englishInputNoticeTitle')}
                        </p>
                        <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          {tSignUp('englishInputNoticeDesc')}
                        </p>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const pendingReq = changeRequests.find((r) => r.status === 'pending');
                    const latestReq = changeRequests[0];
                    if (pendingReq) {
                      const fieldLabels = formatProfileChangeEntries(pendingReq.requestedChanges)
                        .map((item) => item.label)
                        .join(', ');
                      return (
                        <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                          <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="space-y-0.5">
                            <div className="font-semibold">
                              {t('pendingUpdateTitle', { date: formatDateTime(pendingReq.requestedAt) })}
                            </div>
                            <p>
                              {t('pendingUpdateDesc', {
                                fields: fieldLabels || Object.keys(pendingReq.requestedChanges).join(', '),
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    if (latestReq && latestReq.status === 'rejected') {
                      return (
                        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="space-y-0.5">
                            <div className="font-semibold">
                              {t('declinedUpdateTitle', {
                                reviewer: latestReq.reviewerName || t('reviewerFallback'),
                              })}
                            </div>
                            {latestReq.reviewNote && (
                              <p>{t('declineNote', { note: latestReq.reviewNote })}</p>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <AnimatePresence>
                    {credError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        role="alert"
                        className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                      >
                        {credError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleSaveContactInfo} className="space-y-6">
                    {/* 01. Personal & Account Information (without password) */}
                    <div className="space-y-3.5">
                      <h4 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                        {tSignUp('sec1')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label
                            htmlFor="profile-name"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('fullName')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={tSignUp('fullNamePh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(name)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          {containsBanglaScript(name) && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              {tSignUp('errEnglishOnlyHint')}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="profile-name-bn"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('fullNameBn')}
                          </label>
                          <input
                            id="profile-name-bn"
                            type="text"
                            value={nameBn}
                            onChange={(e) => setNameBn(e.target.value)}
                            placeholder={tSignUp('fullNameBnPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsLatinLetters(nameBn)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          {containsLatinLetters(nameBn) && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              {tSignUp('errBanglaOnlyHint')}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="profile-email"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tAuth('email')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={tAuth('emailPlaceholder')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(email)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-mobile"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('mobile')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-mobile"
                            type="tel"
                            required
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value)}
                            placeholder={tSignUp('mobilePh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tabular-nums rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(mobile)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-father-name"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('fatherName')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-father-name"
                            type="text"
                            required
                            value={fatherName}
                            onChange={(e) => setFatherName(e.target.value)}
                            placeholder={tSignUp('fatherNamePh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(fatherName)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-father-name-bn"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('fatherNameBn')}
                          </label>
                          <input
                            id="profile-father-name-bn"
                            type="text"
                            value={fatherNameBn}
                            onChange={(e) => setFatherNameBn(e.target.value)}
                            placeholder={tSignUp('fatherNameBnPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsLatinLetters(fatherNameBn)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-mother-name"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('motherName')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-mother-name"
                            type="text"
                            required
                            value={motherName}
                            onChange={(e) => setMotherName(e.target.value)}
                            placeholder={tSignUp('motherNamePh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(motherName)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-mother-name-bn"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('motherNameBn')}
                          </label>
                          <input
                            id="profile-mother-name-bn"
                            type="text"
                            value={motherNameBn}
                            onChange={(e) => setMotherNameBn(e.target.value)}
                            placeholder={tSignUp('motherNameBnPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsLatinLetters(motherNameBn)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-dob"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('dob')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-dob"
                            type="date"
                            required
                            value={dateOfBirth}
                            onChange={(e) => setDateOfBirth(e.target.value)}
                            className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-gender"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('gender')} <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="profile-gender"
                            required
                            value={gender}
                            onChange={(e) =>
                              handleApplicantGenderChange(e.target.value as '' | MemberGender)
                            }
                            className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          >
                            <option value="">{tSignUp('selectGender')}</option>
                            <option value="male">{tSignUp('male')}</option>
                            <option value="female">{tSignUp('female')}</option>
                            <option value="other">{tSignUp('other')}</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="profile-marital-status"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('maritalStatus')} <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="profile-marital-status"
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
                            className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                          >
                            <option value="">{tSignUp('selectMaritalStatus')}</option>
                            <option value="single">{tSignUp('maritalSingle')}</option>
                            <option value="married">{tSignUp('maritalMarried')}</option>
                            <option value="widowed">{tSignUp('maritalWidowed')}</option>
                            <option value="divorced">{tSignUp('maritalDivorced')}</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="profile-nid"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('nid')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-nid"
                            type="text"
                            required
                            value={nid}
                            onChange={(e) => setNid(e.target.value)}
                            placeholder={tSignUp('nidPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(nid)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        {maritalStatus && maritalStatus !== 'single' && (
                          <>
                            <div>
                              <label
                                htmlFor="profile-spouse-name"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                              >
                                {tSignUp('spouseName')}{' '}
                                {maritalStatus === 'married' ? (
                                  <span className="text-red-500">*</span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    {tSignUp('optional')}
                                  </span>
                                )}
                              </label>
                              <input
                                id="profile-spouse-name"
                                type="text"
                                required={maritalStatus === 'married'}
                                value={spouseName}
                                onChange={(e) => setSpouseName(e.target.value)}
                                placeholder={tSignUp('spouseNamePh')}
                                className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                                  containsBanglaScript(spouseName)
                                    ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                    : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                                }`}
                              />
                            </div>

                            <div>
                              <label
                                htmlFor="profile-spouse-name-bn"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                              >
                                {tSignUp('spouseNameBn')}
                              </label>
                              <input
                                id="profile-spouse-name-bn"
                                type="text"
                                value={spouseNameBn}
                                onChange={(e) => setSpouseNameBn(e.target.value)}
                                placeholder={tSignUp('spouseNameBnPh')}
                                className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                                  containsLatinLetters(spouseNameBn)
                                    ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                    : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                                }`}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 02. Reference & Employment + Social Media */}
                    <div className="space-y-3.5 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                      <h4 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                        {tSignUp('sec2')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label
                            htmlFor="profile-reference"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('referenceLabel')}
                          </label>
                          <input
                            id="profile-reference"
                            type="text"
                            list="profile-existing-members"
                            value={referenceMemberName}
                            onChange={(e) => setReferenceMemberName(e.target.value)}
                            placeholder={tSignUp('referencePh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(referenceMemberName)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                          <datalist id="profile-existing-members">
                            {referenceOptions.map((m) => (
                              <option key={m.memberCode} value={m.name}>
                                {m.name} ({m.memberCode})
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label
                            htmlFor="profile-occupation"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('occupation')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-occupation"
                            type="text"
                            required
                            value={occupation}
                            onChange={(e) => setOccupation(e.target.value)}
                            placeholder={tSignUp('occupationPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(occupation)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="profile-company"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            {tSignUp('company')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="profile-company"
                            type="text"
                            required
                            value={companyOrganization}
                            onChange={(e) => setCompanyOrganization(e.target.value)}
                            placeholder={tSignUp('companyPh')}
                            className={`w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 ${
                              containsBanglaScript(companyOrganization)
                                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/55 dark:bg-slate-950/45 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowSocialSection((prev) => !prev)}
                          aria-expanded={showSocialSection}
                          className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900/60 transition-colors"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Globe
                              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                                <span>{tSignUp('socialToggleTitle')}</span>
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                  {tSignUp('optional')}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {tSignUp('socialToggleSub')}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                            <span>{showSocialSection ? tSignUp('hideSocialBtn') : tSignUp('addSocialBtn')}</span>
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
                              <div className="px-3.5 pb-3.5 pt-3 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <label
                                      htmlFor="profile-whatsapp"
                                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                                    >
                                      {tSignUp('whatsappLabel')}
                                    </label>
                                    {mobile.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => setWhatsapp(mobile.trim())}
                                        className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                                      >
                                        {tSignUp('sameAsMobile')}
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    id="profile-whatsapp"
                                    type="tel"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    placeholder={tSignUp('whatsappPh')}
                                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor="profile-facebook"
                                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                  >
                                    {tSignUp('facebookLabel')}
                                  </label>
                                  <input
                                    id="profile-facebook"
                                    type="text"
                                    value={facebook}
                                    onChange={(e) => setFacebook(e.target.value)}
                                    placeholder={tSignUp('facebookPh')}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor="profile-linkedin"
                                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                  >
                                    {tSignUp('linkedinLabel')}
                                  </label>
                                  <input
                                    id="profile-linkedin"
                                    type="text"
                                    value={linkedin}
                                    onChange={(e) => setLinkedin(e.target.value)}
                                    placeholder={tSignUp('linkedinPh')}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* 03. Residential Addresses (Teletalk-style) */}
                    <div className="space-y-3.5 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                      <h4 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                        {tSignUp('sec3')}
                      </h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                        <TeletalkAddressFields
                          title={tSignUp('presentAddress')}
                          idPrefix="profile-present-addr"
                          value={presentAddressDetails}
                          onChange={setPresentAddressDetails}
                        />
                        <TeletalkAddressFields
                          title={tSignUp('permanentAddress')}
                          idPrefix="profile-permanent-addr"
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
                              <span>{tSignUp('sameAsPresent')}</span>
                            </label>
                          }
                        />
                      </div>
                    </div>

                    {/* 04. Nominee Information */}
                    <div className="space-y-3.5 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <h4 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                              {tSignUp('sec4')}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {tSignUp('sec4Sub')}
                          </p>
                        </div>

                        {nominees.length > 1 && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border tabular-nums ${
                                Math.abs(totalNomineeShare - 100) <= 0.05
                                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                  : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {tSignUp('totalShare', { percent: totalNomineeShare })}
                            </span>
                            <button
                              type="button"
                              onClick={handleEqualSplitShares}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {tSignUp('equalSplit')}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3.5">
                        {nominees.map((nominee, idx) => (
                          <div
                            key={nominee.id}
                            className="p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/55 space-y-3.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                  {nominees.length > 1
                                    ? tSignUp('nomineeNumber', { number: idx + 1 })
                                    : tSignUp('primaryNominee')}
                                </span>
                                <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {tSignUp('sharePercentLabel', {
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('nomineeName')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={nominee.name}
                                  onChange={(e) => updateNomineeField(idx, 'name', e.target.value)}
                                  placeholder={tSignUp('fullNamePh')}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('nomineeNameBn')}
                                </label>
                                <input
                                  type="text"
                                  value={nominee.nameBn}
                                  onChange={(e) => updateNomineeField(idx, 'nameBn', e.target.value)}
                                  placeholder={tSignUp('nomineeNameBnPh')}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('dob')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={nominee.dateOfBirth}
                                  onChange={(e) => updateNomineeField(idx, 'dateOfBirth', e.target.value)}
                                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('gender')} <span className="text-red-500">*</span>
                                </label>
                                <select
                                  required
                                  value={nominee.gender}
                                  onChange={(e) =>
                                    updateNomineeField(idx, 'gender', e.target.value as '' | NomineeGender)
                                  }
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                >
                                  <option value="">{tSignUp('selectGender')}</option>
                                  <option value="male">{tSignUp('male')}</option>
                                  <option value="female">{tSignUp('female')}</option>
                                  <option value="other">{tSignUp('other')}</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('occupation')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={nominee.occupation}
                                  onChange={(e) => updateNomineeField(idx, 'occupation', e.target.value)}
                                  placeholder={tSignUp('nomineeOccupationPh')}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('relation')} <span className="text-red-500">*</span>
                                </label>
                                {(() => {
                                  const relationOptions = getLogicalRelationOptions(nominee.gender, gender);
                                  return (
                                    <div className="space-y-1.5">
                                      <select
                                        required
                                        disabled={!nominee.gender}
                                        value={nominee.relation}
                                        onChange={(e) =>
                                          updateNomineeField(idx, 'relation', e.target.value)
                                        }
                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-60"
                                      >
                                        <option value="">
                                          {nominee.gender
                                            ? tSignUp('selectRelation')
                                            : tSignUp('selectGenderFirst')}
                                        </option>
                                        {relationOptions.map((relKey) => (
                                          <option key={relKey} value={relKey}>
                                            {tSignUp(`nomineeRelations.${relKey}`)}
                                          </option>
                                        ))}
                                        {nominee.gender && (
                                          <option value={OTHER_RELATION_VALUE}>
                                            {tSignUp('nomineeRelations.Other')}
                                          </option>
                                        )}
                                      </select>
                                      {nominee.relation === OTHER_RELATION_VALUE && (
                                        <input
                                          type="text"
                                          required
                                          value={nominee.customRelation}
                                          onChange={(e) =>
                                            updateNomineeField(idx, 'customRelation', e.target.value)
                                          }
                                          placeholder={tSignUp('customRelationPh')}
                                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                        />
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('nidBirthReg')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={nominee.nidOrBirthReg}
                                  onChange={(e) =>
                                    updateNomineeField(idx, 'nidOrBirthReg', e.target.value)
                                  }
                                  placeholder={tSignUp('nidBirthRegPh')}
                                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {tSignUp('nomineeMobile')}{' '}
                                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    {tSignUp('ifAvailable')}
                                  </span>
                                </label>
                                <input
                                  type="tel"
                                  value={nominee.mobile}
                                  onChange={(e) => updateNomineeField(idx, 'mobile', e.target.value)}
                                  placeholder={tSignUp('nomineeMobilePh')}
                                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                />
                              </div>

                              {nominees.length > 1 && (
                                <div>
                                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {tSignUp('sharePercentage')} <span className="text-red-500">*</span>
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
                                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
                              <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {tSignUp('nomineeAddress')} <span className="text-red-500">*</span>
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
                                    <span>{tSignUp('sameAsApplicantPresent')}</span>
                                  </label>
                                </div>
                                <textarea
                                  rows={2}
                                  required
                                  disabled={nominee.sameAsApplicantPresent}
                                  value={nominee.address}
                                  onChange={(e) => updateNomineeField(idx, 'address', e.target.value)}
                                  placeholder={tSignUp('nomineeAddressPh')}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 disabled:opacity-70"
                                />
                              </div>

                              <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                                    {tSignUp('nomineePhoto')}{' '}
                                    {nominee.gender === 'female' ? (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-normal">
                                        {tSignUp('notNeededFemale')}
                                      </span>
                                    ) : (
                                      <span className="text-red-500">*</span>
                                    )}
                                  </span>
                                  {nominee.photoUrl && nominee.gender !== 'female' && (
                                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                                      <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>{tSignUp('uploaded')}</span>
                                    </span>
                                  )}
                                </div>

                                {nominee.gender === 'female' ? (
                                  <div className="py-2.5 px-3 rounded-lg border border-dashed border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 text-center">
                                    {tSignUp('femalePhotoExempt')}
                                  </div>
                                ) : nominee.photoUrl ? (
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={nominee.photoUrl}
                                      alt={`Nominee ${idx + 1} portrait`}
                                      referrerPolicy="no-referrer"
                                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                                        <span>
                                          {nominee.photoUploading ? tSignUp('uploading') : tSignUp('replacePhoto')}
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
                                  <label className="flex flex-col items-center justify-center gap-1.5 py-3 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                                    {nominee.photoUploading ? (
                                      <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                                    ) : (
                                      <ImagePlus className="w-4 h-4 text-slate-400" aria-hidden="true" />
                                    )}
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                      {nominee.photoUploading
                                        ? tSignUp('uploadingToCloud')
                                        : tSignUp('chooseNomineePhoto')}
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
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleAddNominee}
                          disabled={nominees.length >= 10}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{tSignUp('addNominee')}</span>
                        </button>
                      </div>
                    </div>

                    {/* 05. Identity Photo & Signature (300x80 px) */}
                    <div className="space-y-3.5 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                      <h4 className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
                        {t('sec5IdentityMedia')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Member Photo */}
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {tSignUp('memberPhoto')} <span className="text-red-500">*</span>
                            </span>
                            {photoUrl && (
                              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                                <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{tSignUp('uploaded')}</span>
                              </span>
                            )}
                          </div>

                          {photoUrl ? (
                            <div className="flex items-center gap-3">
                              <img
                                src={photoUrl}
                                alt={tSignUp('memberPhoto')}
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                              />
                              <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                                <span>{photoUploading ? tSignUp('uploading') : tSignUp('replacePhoto')}</span>
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
                            <label className="flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                              {photoUploading ? (
                                <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                              ) : (
                                <ImagePlus className="w-5 h-5 text-slate-400" aria-hidden="true" />
                              )}
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                {photoUploading ? tSignUp('uploadingToCloud') : tSignUp('chooseMemberPhoto')}
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

                        {/* Signature 300x80 px */}
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {tSignUp('signatureLabel')} <span className="text-red-500">*</span>
                            </span>
                            {signatureUrl && (
                              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                                <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{tSignUp('signatureVerifiedBadge')}</span>
                              </span>
                            )}
                          </div>

                          {pendingSignature ? (
                            <div className="p-3 rounded-lg border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/75 dark:bg-amber-950/30 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                  <span>
                                    {tSignUp('signatureDimMismatch', {
                                      width: pendingSignature.width,
                                      height: pendingSignature.height,
                                    })}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPendingSignature(null)}
                                  aria-label={tCommon('cancel')}
                                  className="p-1 rounded text-amber-800 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-amber-900/50 cursor-pointer shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                              <div className="w-[300px] max-w-full h-[80px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden p-1">
                                <img
                                  src={pendingSignature.previewUrl}
                                  alt={tSignUp('signatureLabel')}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={signatureUploading}
                                  onClick={() => void handleAutoResizeSignature()}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  {signatureUploading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                  )}
                                  <span>
                                    {signatureUploading ? tSignUp('uploading') : tSignUp('autoResizeUpload')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={signatureUploading}
                                  onClick={() => setPendingSignature(null)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                  {tCommon('cancel')}
                                </button>
                              </div>
                            </div>
                          ) : signatureUrl ? (
                            <div className="flex flex-col gap-2.5">
                              <div className="w-[300px] max-w-full h-[80px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden">
                                <img
                                  src={signatureUrl}
                                  alt={tSignUp('signatureLabel')}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                                  <span>{signatureUploading ? tSignUp('uploading') : tSignUp('replaceSignature')}</span>
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
                                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                                >
                                  {tCommon('remove')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center gap-2 py-3.5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer text-center transition-colors">
                              <div className="w-[150px] h-[36px] rounded border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center gap-1.5 text-[10px] font-mono text-slate-400">
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
                                {signatureUploading ? tSignUp('uploadingToCloud') : tSignUp('chooseSignature')}
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
                      </div>
                    </div>

                    <div className="pt-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2.5 [&>button]:justify-center [&>button]:min-h-[44px] sm:[&>button]:min-h-0">
                      <button
                        type="button"
                        onClick={() => {
                          populateForm(profile);
                        }}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t('resetChanges')}
                      </button>

                      <button
                        type="submit"
                        disabled={
                          saving ||
                          photoUploading ||
                          signatureUploading ||
                          anyNomineePhotoUploading
                        }
                        className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md inline-flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{saving ? t('savingProfile') : t('saveContactInfo')}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Instant Password Change (No Approval Needed) */}
      <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
        <button
          type="button"
          onClick={() => toggleTopic('password')}
          aria-expanded={expandedTopics.password}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('passwordEyebrow')}</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
              {t('passwordHeading')}
            </h3>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
              expandedTopics.password
                ? 'rotate-180 text-amber-600 dark:text-amber-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {expandedTopics.password && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <form
                onSubmit={handlePasswordChange}
                className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label
                    htmlFor="current-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('labelCurrentPassword')}
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('placeholderCurrentPassword')}
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('labelNewPassword')}
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('placeholderNewPassword')}
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('labelConfirmPassword')}
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('placeholderConfirmPassword')}
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordBusy}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 cursor-pointer whitespace-nowrap"
                >
                  {passwordBusy ? t('updatingPassword') : t('updatePasswordNow')}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Mobile Device Registration & 4-Digit PIN Login */}
      {(() => {
        const devices = profile.registeredDevices || [];
        const thisDeviceEntry = localDeviceId
          ? devices.find((d) => d.deviceId === localDeviceId) || null
          : null;
        return (
          <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleTopic('mobilePin')}
              aria-expanded={expandedTopics.mobilePin}
              className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t('mobileEyebrow')}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  {t('mobileHeading')}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs font-mono font-semibold ${
                    thisDeviceEntry
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {thisDeviceEntry
                    ? t('thisDeviceActiveBadge')
                    : t('registeredCountBadge', { count: devices.length })}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`w-4 h-4 transition-transform duration-200 ${
                    expandedTopics.mobilePin
                      ? 'rotate-180 text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
              </div>
            </button>

            <AnimatePresence initial={false}>
              {expandedTopics.mobilePin && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('mobileSubheading')}
                    </p>

                    <form
                      onSubmit={handleRegisterMobileDevice}
                      className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                    >
                      <div>
                        <label
                          htmlFor="mobile-device-label"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelDeviceLabel')}
                        </label>
                        <input
                          id="mobile-device-label"
                          type="text"
                          maxLength={60}
                          value={deviceNameInput}
                          onChange={(e) => setDeviceNameInput(e.target.value)}
                          placeholder={t('placeholderDeviceLabel')}
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="mobile-device-pin"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {thisDeviceEntry ? t('labelNewPin') : t('labelPin')}
                        </label>
                        <input
                          id="mobile-device-pin"
                          type="password"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          required
                          value={devicePin}
                          onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="••••"
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="mobile-device-pin-confirm"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelConfirmPin')}
                        </label>
                        <input
                          id="mobile-device-pin-confirm"
                          type="password"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          required
                          value={devicePinConfirm}
                          onChange={(e) =>
                            setDevicePinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))
                          }
                          placeholder="••••"
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={devicePinBusy}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 cursor-pointer whitespace-nowrap"
                      >
                        {devicePinBusy
                          ? t('savingPin')
                          : thisDeviceEntry
                            ? t('confirmUpdatePinBtn')
                            : t('confirmRegisterDeviceBtn')}
                      </button>
                    </form>

                    {devices.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {devices.map((dev) => {
                          const isCurrent = dev.deviceId === localDeviceId;
                          return (
                            <div
                              key={dev.deviceId}
                              className="py-2.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                  <span className="truncate">{dev.deviceName}</span>
                                  {isCurrent && (
                                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                      {t('thisDeviceTag')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  {t('lastUsed', { date: formatDateTime(dev.lastUsedAt) })}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={devicePinBusy}
                                onClick={() => handleRevokeMobileDevice(dev.deviceId, dev.deviceName)}
                                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{tCommon('remove')}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })()}

      {/* Step-Up Two-Factor Authentication & Alert Preferences */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-6 bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('totp')}
            aria-expanded={expandedTopics.totp}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <KeyRound className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('totpEyebrow')}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {t('totpHeading')}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs font-mono font-semibold ${
                  profile.totpEnabled
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {profile.totpEnabled ? t('totpEnabledBadge') : t('totpOffBadge')}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-200 ${
                  expandedTopics.totp
                    ? 'rotate-180 text-teal-600 dark:text-teal-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {expandedTopics.totp && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                  <AnimatePresence mode="wait" initial={false}>
                    {profile.totpEnabled ? (
                      <motion.form
                        key="totp-enabled"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={handleDisable2fa}
                        className="space-y-3 pt-1"
                      >
                        <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>{t('totpActiveNotice')}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            required
                            value={totpCodeInput}
                            onChange={(e) => setTotpCodeInput(e.target.value)}
                            placeholder={t('placeholder6Digit')}
                            className="w-full sm:w-40 min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="submit"
                            disabled={totpBusy}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                          >
                            {totpBusy ? t('disabling2fa') : t('confirmDisable2faBtn')}
                          </button>
                        </div>
                      </motion.form>
                    ) : !totpSetupData ? (
                      <motion.button
                        key="totp-start"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        type="button"
                        disabled={totpBusy}
                        onClick={() => void handleStart2faSetup()}
                        className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{totpBusy ? t('generatingSecret') : t('enable2faBtn')}</span>
                      </motion.button>
                    ) : (
                      <motion.form
                        key="totp-verify"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22 }}
                        onSubmit={handleEnable2fa}
                        className="space-y-4 pt-1"
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-4 p-3.5 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60">
                          <img
                            src={totpSetupData.qrDataUrl}
                            alt={t('qrAlt')}
                            referrerPolicy="no-referrer"
                            className="w-32 h-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
                          />
                          <div className="space-y-2 text-xs min-w-0">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              {t('qrInstructions')}
                            </p>
                            <div className="font-mono text-[11px] px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white break-all select-all">
                              {totpSetupData.secret}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            required
                            value={totpCodeInput}
                            onChange={(e) => setTotpCodeInput(e.target.value)}
                            placeholder={t('placeholderEnter6Digit')}
                            className="w-full sm:w-44 min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="submit"
                            disabled={totpBusy}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-700/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50"
                          >
                            {totpBusy ? t('verifying2fa') : t('verifyActivate2fa')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTotpSetupData(null);
                              setTotpCodeInput('');
                            }}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          >
                            {tCommon('cancel')}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="xl:col-span-6 amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('alerts')}
            aria-expanded={expandedTopics.alerts}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('alertsEyebrow')}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {t('alertsHeading')}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {prefsBusy && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {tCommon('saving')}
                </span>
              )}
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-200 ${
                  expandedTopics.alerts
                    ? 'rotate-180 text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {expandedTopics.alerts && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('alertsSubheading')}
                  </p>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {(
                      [
                        {
                          key: 'pushAlerts',
                          title: t('prefRows.pushAlerts.title'),
                          desc: t('prefRows.pushAlerts.desc'),
                        },
                        {
                          key: 'inAppAlerts',
                          title: t('prefRows.inAppAlerts.title'),
                          desc: t('prefRows.inAppAlerts.desc'),
                        },
                        {
                          key: 'soundEnabled',
                          title: t('prefRows.soundEnabled.title'),
                          desc: t('prefRows.soundEnabled.desc'),
                        },
                        {
                          key: 'emailBallots',
                          title: t('prefRows.emailBallots.title'),
                          desc: t('prefRows.emailBallots.desc'),
                        },
                        {
                          key: 'emailRepayments',
                          title: t('prefRows.emailRepayments.title'),
                          desc: t('prefRows.emailRepayments.desc'),
                        },
                        {
                          key: 'emailCommunity',
                          title: t('prefRows.emailCommunity.title'),
                          desc: t('prefRows.emailCommunity.desc'),
                        },
                      ] as const
                    ).map((row) => (
                      <label
                        key={row.key}
                        className="py-3 min-h-[44px] flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white">{row.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.desc}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={
                            row.key === 'pushAlerts'
                              ? prefs.pushAlerts !== false
                              : Boolean(prefs[row.key])
                          }
                          onChange={() => void handleTogglePref(row.key)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600 shrink-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        customContent={modal?.customContent}
        maxWidthClass={modal?.maxWidthClass}
        secondaryAction={modal?.secondaryAction}
        confirmLabel={
          modal?.confirmLabel || (modal?.mode === 'confirm' ? undefined : tCommon('okGotIt'))
        }
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async () => {
                setModalBusy(true);
                try {
                  await modal.run();
                } finally {
                  setModalBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
