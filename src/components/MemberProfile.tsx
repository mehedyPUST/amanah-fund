'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
import type { NotificationPreferences, ProfileChangeRequest, PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { downloadMembershipApplicationPdf } from '../utils/applicationFormPdf.ts';
import { formatDateTime, isPdfFileUrl } from '../utils/format.ts';
import {
  detectDefaultMobileDeviceName,
  getLocalDeviceForUser,
  removeRegisteredMobileAccount,
  saveRegisteredMobileAccount,
} from '../utils/mobileDeviceAuth.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { NomineeDetailsList } from './NomineeDetailsList.tsx';

interface MemberProfileProps {
  user: PublicUser;
  onRefresh: () => Promise<void>;
}

export function MemberProfile({ user, onRefresh }: MemberProfileProps) {
  const t = useTranslations('Profile');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const { setUser } = useCoopSession();

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

  // Editable contact & profile fields
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState('');
  const [presentAddress, setPresentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [occupation, setOccupation] = useState('');
  const [companyOrganization, setCompanyOrganization] = useState('');

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
        confirmLabel: string;
        run: () => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
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
    }
  );
  const [prefsBusy, setPrefsBusy] = useState(false);

  const populateForm = useCallback((loaded: PublicUser) => {
    const reg = loaded.registrationDetails;
    setProfile(loaded);
    setName(loaded.name);
    setEmail(loaded.email);
    setMobile(reg?.mobile || '');
    setPresentAddress(reg?.presentAddress || '');
    setPermanentAddress(reg?.permanentAddress || '');
    setOccupation(reg?.occupation || '');
    setCompanyOrganization(reg?.companyOrganization || '');
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
      const [res, reqRes] = await Promise.all([
        api.getProfile(),
        api.getProfileChangeRequests().catch(() => ({ requests: [] as ProfileChangeRequest[] })),
      ]);
      populateForm(res.user);
      setChangeRequests(reqRes.requests.filter((r) => r.userId === user.id));
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
    const syncLocal = () => {
      const local = getLocalDeviceForUser(user.id);
      setLocalDeviceId(local?.deviceId || null);
      setDeviceNameInput((prev) => prev || local?.deviceName || detectDefaultMobileDeviceName());
    };
    syncLocal();
    window.addEventListener('amanah:mobile-devices-updated', syncLocal);
    return () => window.removeEventListener('amanah:mobile-devices-updated', syncLocal);
  }, [user.id]);

  function handleSaveContactInfo(e: FormEvent) {
    e.preventDefault();

    if (!mobile.trim() || !presentAddress.trim() || !permanentAddress.trim()) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('missingContactTitle'),
        description: t('missingContactDesc'),
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title:
        user.role === 'admin'
          ? t('confirmSaveAdminTitle')
          : t('confirmSaveMemberTitle'),
      description:
        user.role === 'admin'
          ? t('confirmSaveAdminDesc')
          : t('confirmSaveMemberDesc'),
      details: [
        { label: t('detailFullName'), value: name.trim() },
        { label: t('detailEmail'), value: email.trim() },
        { label: t('detailMobile'), value: mobile.trim() },
        { label: t('detailOccupation'), value: occupation.trim() || '—' },
      ],
      confirmLabel: user.role === 'admin' ? t('confirmSaveAdminBtn') : t('confirmSaveMemberBtn'),
      run: async () => {
        setSaving(true);
        try {
          const res = await api.updateProfile({
            name: name.trim(),
            email: email.trim(),
            mobile: mobile.trim(),
            presentAddress: presentAddress.trim(),
            permanentAddress: permanentAddress.trim(),
            occupation: occupation.trim(),
            companyOrganization: companyOrganization.trim(),
          });
          if (res.pendingApproval) {
            await loadProfile();
            await onRefresh();
            setModal({
              mode: 'notice',
              tone: 'emerald',
              title: t('updateSubmittedTitle'),
              description: res.message || t('updateSubmittedDesc'),
            });
          } else {
            populateForm(res.user);
            setUser(res.user);
            await onRefresh();
            setModal({
              mode: 'notice',
              tone: 'emerald',
              title: t('profileSavedTitle'),
              description: t('profileSavedDesc'),
            });
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
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('passwordUpdatedTitle'),
            description: t('passwordUpdatedDesc'),
          });
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
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('enabled2faTitle'),
            description: t('enabled2faDesc'),
          });
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
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: matchedServerLocal ? t('pinUpdatedTitle') : t('deviceRegisteredTitle'),
            description: t('deviceRegisteredDesc'),
          });
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
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('deviceRemovedTitle'),
            description: t('deviceRemovedDesc', { deviceName }),
          });
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
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('disabled2faTitle'),
            description: t('disabled2faDesc'),
          });
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
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setPrefsBusy(true);
    try {
      const res = await api.updatePreferences({ [key]: next[key] });
      setUser(res.user);
      setProfile(res.user);
      setPrefs(res.user.notificationPreferences || next);
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
              toneClass: 'text-indigo-700 dark:text-indigo-400',
              boxClass:
                'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/60',
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
        <section className="amanah-card-emerald border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton width={64} height={64} borderRadius={12} />
            <div className="space-y-1.5">
              <Skeleton width={200} height={20} />
              <Skeleton width={260} height={14} />
            </div>
          </div>
          <Skeleton height={56} />
        </section>
        <section className="amanah-card-violet border rounded-2xl p-6">
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
      <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
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
              <div className="w-16 h-16 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-center text-base font-bold text-indigo-700 dark:text-indigo-400 shrink-0">
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
            className="w-full md:w-auto justify-center min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-stretch md:self-center cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
        <section className="xl:col-span-5 amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('credentials')}
            aria-expanded={expandedTopics.credentials}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
                    ? 'rotate-180 text-indigo-600 dark:text-indigo-400'
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
                    {reg?.fatherName && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldFatherName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.fatherName}
                        </dd>
                      </div>
                    )}
                    {reg?.motherName && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldMotherName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.motherName}
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
                    {reg?.spouseName && (
                      <div className="py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <dt className="text-slate-500 dark:text-slate-400">{t('fieldSpouseName')}</dt>
                        <dd className="font-semibold text-slate-900 dark:text-white text-right">
                          {reg.spouseName}
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
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
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
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
                        className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-55 transition-colors"
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
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Editable Contact Information Form */}
        <section className="xl:col-span-7 amanah-card-teal border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
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

                  {(() => {
                    const pendingReq = changeRequests.find((r) => r.status === 'pending');
                    const latestReq = changeRequests[0];
                    if (pendingReq) {
                      return (
                        <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                          <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="space-y-0.5">
                            <div className="font-semibold">
                              {t('pendingUpdateTitle', { date: formatDateTime(pendingReq.requestedAt) })}
                            </div>
                            <p>
                              {t('pendingUpdateDesc', {
                                fields: Object.keys(pendingReq.requestedChanges).join(', '),
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

                  <form onSubmit={handleSaveContactInfo} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="profile-name"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelFullName')}
                        </label>
                        <input
                          id="profile-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="profile-email"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelEmail')}
                        </label>
                        <input
                          id="profile-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="profile-mobile"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelMobile')}
                        </label>
                        <input
                          id="profile-mobile"
                          type="tel"
                          required
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          placeholder={t('placeholderMobile')}
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="profile-occupation"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {t('labelOccupation')}
                        </label>
                        <input
                          id="profile-occupation"
                          type="text"
                          value={occupation}
                          onChange={(e) => setOccupation(e.target.value)}
                          placeholder={t('placeholderOccupation')}
                          className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="profile-company"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        {t('labelCompany')}
                      </label>
                      <input
                        id="profile-company"
                        type="text"
                        value={companyOrganization}
                        onChange={(e) => setCompanyOrganization(e.target.value)}
                        placeholder={t('placeholderCompany')}
                        className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-present-address"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        {t('labelPresentAddress')}
                      </label>
                      <textarea
                        id="profile-present-address"
                        rows={2}
                        required
                        value={presentAddress}
                        onChange={(e) => setPresentAddress(e.target.value)}
                        placeholder={t('placeholderPresentAddress')}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-permanent-address"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        {t('labelPermanentAddress')}
                      </label>
                      <textarea
                        id="profile-permanent-address"
                        rows={2}
                        required
                        value={permanentAddress}
                        onChange={(e) => setPermanentAddress(e.target.value)}
                        placeholder={t('placeholderPermanentAddress')}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                      />
                    </div>

                    <div className="pt-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2.5 [&>button]:justify-center [&>button]:min-h-[44px] sm:[&>button]:min-h-0">
                      <button
                        type="button"
                        onClick={() => {
                          populateForm(profile);
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t('resetChanges')}
                      </button>

                      <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] cursor-pointer whitespace-nowrap"
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
      <section className="amanah-card-amber border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
        <button
          type="button"
          onClick={() => toggleTopic('password')}
          aria-expanded={expandedTopics.password}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
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
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
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
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordBusy}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
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
          <section className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
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
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
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
                                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
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
        <section className="xl:col-span-6 amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
          <button
            type="button"
            onClick={() => toggleTopic('totp')}
            aria-expanded={expandedTopics.totp}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
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
                    ? 'rotate-180 text-indigo-600 dark:text-indigo-400'
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
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                          >
                            {totpBusy ? t('verifying2fa') : t('verifyActivate2fa')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTotpSetupData(null);
                              setTotpCodeInput('');
                            }}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
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

        <section className="xl:col-span-6 amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200">
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
                          checked={Boolean(prefs[row.key])}
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
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
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
