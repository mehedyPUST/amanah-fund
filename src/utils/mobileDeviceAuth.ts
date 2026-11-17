'use client';

import type { PublicUser, UserRole } from '../types/coop.ts';

const REGISTERED_MOBILE_ACCOUNTS_KEY = 'amanah_registered_mobile_accounts_v1';
const SELECTED_PIN_ACCOUNT_KEY = 'amanah_selected_pin_account_id_v1';
const MOBILE_BG_HIDDEN_AT_KEY = 'amanah_mobile_bg_hidden_at_v1';
const MOBILE_AUTO_LOGOUT_NOTICE_KEY = 'amanah_mobile_auto_logout_notice_v1';

export const MOBILE_MINIMIZE_LOGOUT_MS = 60_000;

export interface LocalRegisteredAccount {
  userId: string;
  name: string;
  email: string;
  memberCode: string;
  role: UserRole;
  photoUrl?: string;
  deviceId: string;
  deviceSecret: string;
  deviceName: string;
  registeredAt: string;
  lastUsedAt: string;
}

export function detectDefaultMobileDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Mobile Device';
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone WebApp';
  if (/iPad/i.test(ua)) return 'iPad WebApp';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android [^;]+;\s*([^)]+?)\s*(?:Build\/|\))/i);
    const model = match?.[1]?.trim();
    if (model && model.length <= 36) return model;
    return 'Android Phone';
  }
  if (/Mobile/i.test(ua)) return 'Mobile Browser';
  return 'This Device';
}

export function getRegisteredMobileAccounts(): LocalRegisteredAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REGISTERED_MOBILE_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalRegisteredAccount =>
        Boolean(item) &&
        typeof item.userId === 'string' &&
        typeof item.deviceId === 'string' &&
        typeof item.deviceSecret === 'string' &&
        typeof item.name === 'string'
    );
  } catch {
    return [];
  }
}

function writeRegisteredMobileAccounts(accounts: LocalRegisteredAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REGISTERED_MOBILE_ACCOUNTS_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new CustomEvent('amanah:mobile-devices-updated'));
  } catch {
    // ignore storage quota/restrictions
  }
}

export function saveRegisteredMobileAccount(entry: LocalRegisteredAccount): void {
  const existing = getRegisteredMobileAccounts().filter((a) => a.userId !== entry.userId);
  const next = [entry, ...existing];
  writeRegisteredMobileAccounts(next);
  setSelectedPinAccountId(entry.userId);
}

export function removeRegisteredMobileAccount(userId: string, deviceId?: string): void {
  const existing = getRegisteredMobileAccounts();
  const next = existing.filter((a) => {
    if (a.userId !== userId) return true;
    if (deviceId && a.deviceId !== deviceId) return true;
    return false;
  });
  writeRegisteredMobileAccounts(next);
  if (getSelectedPinAccountId() === userId) {
    setSelectedPinAccountId(next[0]?.userId || null);
  }
}

export function getLocalDeviceForUser(userId: string): LocalRegisteredAccount | null {
  return getRegisteredMobileAccounts().find((a) => a.userId === userId) || null;
}

export function getSelectedPinAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SELECTED_PIN_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setSelectedPinAccountId(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      window.localStorage.setItem(SELECTED_PIN_ACCOUNT_KEY, userId);
    } else {
      window.localStorage.removeItem(SELECTED_PIN_ACCOUNT_KEY);
    }
  } catch {
    // ignore
  }
}

export function getPreferredRegisteredAccount(): LocalRegisteredAccount | null {
  const accounts = getRegisteredMobileAccounts();
  if (accounts.length === 0) return null;
  const selectedId = getSelectedPinAccountId();
  if (selectedId) {
    const match = accounts.find((a) => a.userId === selectedId);
    if (match) return match;
  }
  return accounts[0];
}

export function syncLocalAccountsWithServerUser(user: PublicUser | null): void {
  if (!user || typeof window === 'undefined') return;
  const accounts = getRegisteredMobileAccounts();
  const local = accounts.find((a) => a.userId === user.id);
  if (!local) return;

  const serverDevices = Array.isArray(user.registeredDevices) ? user.registeredDevices : [];
  const serverMatch = serverDevices.find((d) => d.deviceId === local.deviceId);
  if (!serverMatch) {
    removeRegisteredMobileAccount(user.id, local.deviceId);
    return;
  }

  const updated: LocalRegisteredAccount = {
    ...local,
    name: user.name,
    email: user.email,
    memberCode: user.memberCode,
    role: user.role,
    photoUrl: user.photoUrl,
    deviceName: serverMatch.deviceName,
    lastUsedAt: serverMatch.lastUsedAt,
  };
  const next = accounts.map((a) => (a.userId === user.id ? updated : a));
  writeRegisteredMobileAccounts(next);
  setSelectedPinAccountId(user.id);
}

export function getMobileBackgroundHiddenAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MOBILE_BG_HIDDEN_AT_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export function setMobileBackgroundHiddenAt(timestamp: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (timestamp && Number.isFinite(timestamp)) {
      window.localStorage.setItem(MOBILE_BG_HIDDEN_AT_KEY, String(timestamp));
    } else {
      window.localStorage.removeItem(MOBILE_BG_HIDDEN_AT_KEY);
    }
  } catch {
    // ignore
  }
}

export function setMobileAutoLogoutNotice(message: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (message) {
      window.localStorage.setItem(MOBILE_AUTO_LOGOUT_NOTICE_KEY, message);
    } else {
      window.localStorage.removeItem(MOBILE_AUTO_LOGOUT_NOTICE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getMobileAutoLogoutNotice(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(MOBILE_AUTO_LOGOUT_NOTICE_KEY);
  } catch {
    return null;
  }
}
