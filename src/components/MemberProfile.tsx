'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Save,
  User as UserIcon,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import type { PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime } from '../utils/format.ts';
import { useCoopSession } from './AppProviders.tsx';

interface MemberProfileProps {
  user: PublicUser;
  onRefresh: () => Promise<void>;
}

export function MemberProfile({ user, onRefresh }: MemberProfileProps) {
  const { setUser } = useCoopSession();

  const [profile, setProfile] = useState<PublicUser>(user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [agreementBroken, setAgreementBroken] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Editable contact & profile fields
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState('');
  const [presentAddress, setPresentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [occupation, setOccupation] = useState('');
  const [companyOrganization, setCompanyOrganization] = useState('');

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
    setPhotoBroken(false);
    setAgreementBroken(false);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProfile();
      populateForm(res.user);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load member profile details.',
      });
    } finally {
      setLoading(false);
    }
  }, [populateForm]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSaveContactInfo(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (!mobile.trim() || !presentAddress.trim() || !permanentAddress.trim()) {
      setFeedback({
        type: 'error',
        text: 'Mobile number, present address, and permanent address are required.',
      });
      return;
    }

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
      populateForm(res.user);
      setUser(res.user);
      setFeedback({
        type: 'success',
        text: 'Your contact information has been encrypted and saved to your member profile.',
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update contact information.',
      });
    } finally {
      setSaving(false);
    }
  }

  const reg = profile.registrationDetails;
  const portraitUrl = reg?.photoUrl || profile.photoUrl;
  const agreementUrl = reg?.agreementPhotoUrl;

  const statusMeta =
    profile.status === 'active'
      ? {
          label: 'Verified Member',
          shortLabel: 'Verified',
          description:
            'Your KYC registration is verified and active. You can submit monthly contributions, vote on 2/3 governance ballots, and request Qard Hasan loans.',
          Icon: CheckCircle2,
          toneClass: 'text-emerald-700 dark:text-emerald-400',
          boxClass:
            'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60',
        }
      : profile.status === 'pending_approval'
        ? {
            label: 'Pending Verification',
            shortLabel: 'Pending',
            description:
              'Your membership registration is currently pending administrator verification.',
            Icon: Clock,
            toneClass: 'text-amber-700 dark:text-amber-400',
            boxClass:
              'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
          }
        : {
            label: 'Suspended',
            shortLabel: 'Suspended',
            description: 'This membership account is currently suspended. Contact an administrator.',
            Icon: AlertCircle,
            toneClass: 'text-red-700 dark:text-red-400',
            boxClass: 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/60',
          };

  const StatusIcon = statusMeta.Icon;

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton width={64} height={64} borderRadius={12} />
            <div className="space-y-1.5">
              <Skeleton width={200} height={20} />
              <Skeleton width={260} height={14} />
            </div>
          </div>
          <Skeleton height={56} />
        </section>
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <Skeleton height={240} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Membership Status & Identity Summary */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
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
                  alt={`${profile.name} portrait`}
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
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <UserIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Member Profile & Verification Status</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                {profile.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>{profile.memberCode}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize font-sans">{profile.role}</span>
                <span aria-hidden="true">·</span>
                <span>Joined {formatDateTime(profile.joinedAt)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadProfile()}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start md:self-center cursor-pointer transition-all duration-200 active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Refresh Profile</span>
          </button>
        </div>

        {/* Current Membership Status Strip */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${statusMeta.boxClass}`}>
          <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${statusMeta.toneClass}`} aria-hidden="true" />
          <div className="space-y-0.5 min-w-0">
            <div className={`text-xs font-semibold ${statusMeta.toneClass}`}>
              Membership Status: {statusMeta.label} ({statusMeta.shortLabel})
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
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Registration Credentials
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified KYC identity details recorded during cooperative onboarding
            </p>
          </div>

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Membership Status</dt>
              <dd className={`font-semibold inline-flex items-center gap-1.5 ${statusMeta.toneClass}`}>
                <StatusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{statusMeta.label}</span>
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Member Code</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                {profile.memberCode}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">National ID (NID)</dt>
              <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {reg?.nid || 'Not provided (Admin bootstrap)'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Date of Birth</dt>
              <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {reg?.dateOfBirth || 'Not provided'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Reference Member</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {reg?.referenceMemberName || 'Bootstrap Founding Member'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Encrypted Mobile</dt>
              <dd className="font-mono text-slate-900 dark:text-white">
                {reg?.mobile || profile.phoneMasked || 'Not set'}
              </dd>
            </div>
          </dl>

          {agreementUrl && !agreementBroken && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Signed Agreement Paper
                </span>
                <a
                  href={agreementUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Full Image</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 aspect-[16/10]">
                <img
                  src={agreementUrl}
                  alt={`${profile.name} signed cooperative agreement`}
                  referrerPolicy="no-referrer"
                  onError={() => setAgreementBroken(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </section>

        {/* Editable Contact Information Form */}
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-all duration-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Update Contact Information
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Keep your mobile number, email, occupation, and residential addresses up to date.
              Updates are AES-256-GCM encrypted in the cooperative vault.
            </p>
          </div>

          {feedback && (
            <div
              role="status"
              className={`p-3.5 rounded-lg border text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <form onSubmit={handleSaveContactInfo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-mobile"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Mobile Number
                </label>
                <input
                  id="profile-mobile"
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 017XXXXXXXX"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-occupation"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Occupation
                </label>
                <input
                  id="profile-occupation"
                  type="text"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. Senior Engineer"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-company"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Company / Organization
              </label>
              <input
                id="profile-company"
                type="text"
                value={companyOrganization}
                onChange={(e) => setCompanyOrganization(e.target.value)}
                placeholder="Organization or employer name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="profile-present-address"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Present Address
              </label>
              <textarea
                id="profile-present-address"
                rows={2}
                required
                value={presentAddress}
                onChange={(e) => setPresentAddress(e.target.value)}
                placeholder="Current residential address"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="profile-permanent-address"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Permanent Address
              </label>
              <textarea
                id="profile-permanent-address"
                rows={2}
                required
                value={permanentAddress}
                onChange={(e) => setPermanentAddress(e.target.value)}
                placeholder="Permanent home address"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  populateForm(profile);
                  setFeedback(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                Reset Changes
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{saving ? 'Saving Profile…' : 'Save Contact Information'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
