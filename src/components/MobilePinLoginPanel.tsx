'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Smartphone,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  getMobileAutoLogoutNotice,
  getRegisteredMobileAccounts,
  getSelectedPinAccountId,
  removeRegisteredMobileAccount,
  setMobileAutoLogoutNotice,
  setSelectedPinAccountId,
  syncLocalAccountsWithServerUser,
  type LocalRegisteredAccount,
} from '../utils/mobileDeviceAuth.ts';
import { AmanahLogo } from './AmanahLogo.tsx';

interface MobilePinLoginPanelProps {
  onSuccess: (user: PublicUser) => void;
  onUsePassword: () => void;
  compact?: boolean;
}

export function MobilePinLoginPanel({
  onSuccess,
  onUsePassword,
  compact = false,
}: MobilePinLoginPanelProps) {
  const tAuth = useTranslations('Auth');
  const tCommon = useTranslations('Common');
  const [accounts, setAccounts] = useState<LocalRegisteredAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const list = getRegisteredMobileAccounts();
      setAccounts(list);
      const preferredId = getSelectedPinAccountId();
      const matched = list.find((a) => a.userId === preferredId) || list[0];
      setSelectedUserId(matched?.userId || '');
      setAutoLogoutNotice(getMobileAutoLogoutNotice());
    };
    sync();
    window.addEventListener('amanah:mobile-devices-updated', sync);
    return () => window.removeEventListener('amanah:mobile-devices-updated', sync);
  }, []);

  const selectedAccount =
    accounts.find((a) => a.userId === selectedUserId) || accounts[0] || null;

  if (!selectedAccount) return null;

  async function submitPinLogin(pinValue: string) {
    if (!selectedAccount || pinValue.length !== 4 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.pinLogin({
        userId: selectedAccount.userId,
        deviceId: selectedAccount.deviceId,
        deviceSecret: selectedAccount.deviceSecret,
        pin: pinValue,
      });
      setMobileAutoLogoutNotice(null);
      setAutoLogoutNotice(null);
      syncLocalAccountsWithServerUser(res.user);
      setSelectedPinAccountId(res.user.id);
      onSuccess(res.user);
    } catch (err) {
      const errWithCode = err as Error & { code?: string };
      if (
        errWithCode.code === 'DEVICE_NOT_REGISTERED' ||
        errWithCode.code === 'USER_NOT_FOUND'
      ) {
        removeRegisteredMobileAccount(selectedAccount.userId, selectedAccount.deviceId);
        const remaining = getRegisteredMobileAccounts();
        setAccounts(remaining);
        if (remaining.length === 0) {
          onUsePassword();
          return;
        }
      }
      setPin('');
      setError(err instanceof Error ? err.message : tAuth('pin.pinFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitPinLogin(pin.trim());
  }

  function handleRemoveLocalAccount(target: LocalRegisteredAccount) {
    removeRegisteredMobileAccount(target.userId, target.deviceId);
    const remaining = getRegisteredMobileAccounts();
    setAccounts(remaining);
    setError(null);
    setPin('');
    if (remaining.length === 0) {
      onUsePassword();
    } else {
      setSelectedUserId(remaining[0].userId);
    }
  }

  const initials = selectedAccount.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className={compact ? 'space-y-3.5' : 'space-y-4'}>
      <AnimatePresence>
        {autoLogoutNotice && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2"
          >
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {autoLogoutNotice === '__AUTO_LOGOUT_1M__'
                ? tCommon('autoLogoutNotice')
                : autoLogoutNotice}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Registered Account Card */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <AmanahLogo size="xs" decorative className="w-5 h-5 rounded-md" />
            <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tAuth('pin.registeredDevice')}</span>
          </span>
          {accounts.length > 1 && (
            <button
              type="button"
              onClick={() => setAccountPickerOpen((v) => !v)}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>{tAuth('pin.switchAccount')}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${accountPickerOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        <div className="p-3.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 ring-1 ring-inset ring-white/60 dark:ring-white/5 bg-emerald-50/55 dark:bg-emerald-950/25 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {selectedAccount.photoUrl ? (
              <img
                src={selectedAccount.photoUrl}
                alt={selectedAccount.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover border border-emerald-200 dark:border-emerald-800 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {initials || 'AM'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {selectedAccount.name}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <span className="font-mono">{selectedAccount.memberCode}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{selectedAccount.deviceName}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleRemoveLocalAccount(selectedAccount)}
            title={tAuth('pin.forgetDevice')}
            aria-label={tAuth('pin.removeAccountAria', { name: selectedAccount.name })}
            className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <AnimatePresence>
          {accountPickerOpen && accounts.length > 1 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800"
            >
              {accounts.map((acc) => {
                const isSelected = acc.userId === selectedAccount.userId;
                return (
                  <button
                    key={acc.userId}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(acc.userId);
                      setSelectedPinAccountId(acc.userId);
                      setAccountPickerOpen(false);
                      setPin('');
                      setError(null);
                    }}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{acc.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {acc.memberCode} · {acc.email}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div>
          <label
            htmlFor={compact ? 'mobile-gate-pin' : 'signin-device-pin'}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {tAuth('pin.enterPin')}
          </label>
          <div className="relative">
            <input
              id={compact ? 'mobile-gate-pin' : 'signin-device-pin'}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoComplete="one-time-code"
              autoFocus
              value={pin}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                setPin(digits);
                if (error) setError(null);
              }}
              placeholder="••••"
              className="w-full min-h-[50px] pl-4 pr-11 py-2.5 text-center font-mono text-2xl tracking-[0.65em] tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-600 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-label={showPin ? tAuth('pin.hidePin') : tAuth('pin.showPin')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
            >
              {showPin ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || pin.length !== 4}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 disabled:opacity-55 text-white text-sm font-semibold shadow-sm shadow-emerald-600/25 flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer whitespace-nowrap"
        >
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{submitting ? tAuth('pin.verifyingPin') : tAuth('pin.signInWithPin')}</span>
        </button>
      </form>

      <button
        type="button"
        onClick={onUsePassword}
        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
      >
        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{tAuth('useEmailPassword')}</span>
      </button>
    </div>
  );
}
