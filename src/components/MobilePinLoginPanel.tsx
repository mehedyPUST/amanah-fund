'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { triggerHaptic } from '../utils/haptics.ts';
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
  const [pinFocused, setPinFocused] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeTick, setShakeTick] = useState(0);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

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
      triggerHaptic('success');
      onSuccess(res.user);
    } catch (err) {
      triggerHaptic('error');
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
      setShakeTick((t) => t + 1);
      setError(err instanceof Error ? err.message : tAuth('pin.pinFailed'));
      window.setTimeout(() => {
        pinInputRef.current?.focus();
      }, 60);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitPinLogin(pin.trim());
  }

  function handlePinChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, '').slice(0, 4);
    if (digits !== pin) {
      triggerHaptic('selection');
    }
    setPin(digits);
    if (error) setError(null);
    if (digits.length === 4 && !submitting) {
      void submitPinLogin(digits);
    }
  }

  function handleRemoveLocalAccount(target: LocalRegisteredAccount) {
    triggerHaptic('warning');
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

  const inputId = compact ? 'mobile-gate-pin' : 'signin-device-pin';
  const activeSlotIndex = Math.min(pin.length, 3);

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
              onClick={() => {
                triggerHaptic('selection');
                setAccountPickerOpen((v) => !v);
              }}
              className="min-h-[44px] px-2 -mr-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>{tAuth('pin.switchAccount')}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${accountPickerOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        <div className="p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 ring-1 ring-inset ring-white/60 dark:ring-white/5 bg-emerald-50/55 dark:bg-emerald-950/25 shadow-2xs flex items-center justify-between gap-2.5">
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
                <span className="font-mono tabular-nums">{selectedAccount.memberCode}</span>
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
            className="min-w-[44px] min-h-[44px] -mr-1 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
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
                      triggerHaptic('selection');
                      setSelectedUserId(acc.userId);
                      setSelectedPinAccountId(acc.userId);
                      setAccountPickerOpen(false);
                      setPin('');
                      setError(null);
                    }}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
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
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor={inputId}
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {tAuth('pin.enterPin')}
            </label>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setShowPin((v) => !v);
              }}
              aria-label={showPin ? tAuth('pin.hidePin') : tAuth('pin.showPin')}
              className="min-w-[44px] min-h-[36px] px-2 -mr-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 inline-flex items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors"
            >
              {showPin ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{showPin ? tAuth('pin.hidePin') : tAuth('pin.showPin')}</span>
            </button>
          </div>

          <motion.div
            key={shakeTick}
            animate={shakeTick > 0 ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => pinInputRef.current?.focus()}
            className="relative"
          >
            <input
              ref={pinInputRef}
              id={inputId}
              type="tel"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoComplete="one-time-code"
              autoFocus
              disabled={submitting}
              value={pin}
              onFocus={() => setPinFocused(true)}
              onBlur={() => setPinFocused(false)}
              onChange={(e) => handlePinChange(e.target.value)}
              aria-label={tAuth('pin.enterPin')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-base"
            />

            <div className="grid grid-cols-4 gap-2.5" aria-hidden="true">
              {[0, 1, 2, 3].map((slot) => {
                const digit = pin[slot] || '';
                const isFilled = digit.length > 0;
                const isActive = pinFocused && !submitting && slot === activeSlotIndex;
                return (
                  <div
                    key={slot}
                    className={`h-[54px] rounded-2xl border flex items-center justify-center transition-all duration-150 ${
                      error
                        ? 'border-rose-400 dark:border-rose-600 bg-rose-50/50 dark:bg-rose-950/25'
                        : isActive
                        ? 'border-emerald-600 dark:border-[#00ED64] bg-white dark:bg-slate-950 ring-2 ring-emerald-600/20 dark:ring-[#00ED64]/20 shadow-xs'
                        : isFilled
                        ? 'border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-950'
                    }`}
                  >
                    {isFilled ? (
                      showPin ? (
                        <span className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {digit}
                        </span>
                      ) : (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.12 }}
                          className="w-3 h-3 rounded-full bg-emerald-700 dark:bg-[#00ED64]"
                        />
                      )
                    ) : (
                      <span
                        className={`w-2 h-0.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-600 dark:bg-[#00ED64] animate-pulse'
                            : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>

          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {tAuth('pin.tapDigitsHint')}
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || pin.length !== 4}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-55 text-white text-sm font-semibold shadow-sm shadow-emerald-900/15 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
        >
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{submitting ? tAuth('pin.verifyingPin') : tAuth('pin.signInWithPin')}</span>
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          triggerHaptic('selection');
          onUsePassword();
        }}
        className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] transition-all whitespace-nowrap"
      >
        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{tAuth('useEmailPassword')}</span>
      </button>
    </div>
  );
}
