import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { RegisteredDeviceSummary } from '../types/coop.ts';
import { computeSha256Hash } from './crypto.ts';
import type { StoredRegisteredDevice, StoredUser } from './db.ts';

export const MAX_REGISTERED_DEVICES_PER_USER = 10;
export const MAX_PIN_FAILED_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

export function isValidFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(String(pin || '').trim());
}

export function sanitizeDeviceName(raw?: string): string {
  const cleaned = String(raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'Mobile Device';
}

export function sanitizeRegisteredDevices(
  devices?: StoredRegisteredDevice[]
): RegisteredDeviceSummary[] {
  if (!Array.isArray(devices)) return [];
  return devices.map((d) => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    createdAt: d.createdAt,
    lastUsedAt: d.lastUsedAt,
  }));
}

function timingSafeHashEqual(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, 'utf8');
  const b = Buffer.from(hashB, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function registerDeviceOnUser(
  user: StoredUser,
  params: { pin: string; deviceName?: string; existingDeviceId?: string },
  nowIso = new Date().toISOString()
): { device: RegisteredDeviceSummary; deviceSecret: string; isUpdate: boolean } {
  const pin = String(params.pin || '').trim();
  if (!isValidFourDigitPin(pin)) {
    throw new Error('INVALID_PIN_FORMAT');
  }

  const deviceName = sanitizeDeviceName(params.deviceName);
  const pinHash = bcrypt.hashSync(pin, 10);
  const deviceSecret = crypto.randomBytes(32).toString('base64url');
  const deviceSecretHash = computeSha256Hash(deviceSecret);

  const existingList = Array.isArray(user.registeredDevices) ? [...user.registeredDevices] : [];
  const existingIdx = params.existingDeviceId
    ? existingList.findIndex((d) => d.deviceId === params.existingDeviceId)
    : -1;

  let record: StoredRegisteredDevice;
  let isUpdate = false;

  if (existingIdx >= 0) {
    isUpdate = true;
    const prev = existingList[existingIdx];
    record = {
      ...prev,
      deviceName,
      pinHash,
      deviceSecretHash,
      failedAttempts: 0,
      lockedUntil: undefined,
      lastUsedAt: nowIso,
    };
    existingList[existingIdx] = record;
  } else {
    const deviceId = `dev-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    record = {
      deviceId,
      deviceName,
      pinHash,
      deviceSecretHash,
      failedAttempts: 0,
      createdAt: nowIso,
      lastUsedAt: nowIso,
    };
    existingList.unshift(record);
    if (existingList.length > MAX_REGISTERED_DEVICES_PER_USER) {
      existingList.length = MAX_REGISTERED_DEVICES_PER_USER;
    }
  }

  user.registeredDevices = existingList;

  return {
    device: {
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    },
    deviceSecret,
    isUpdate,
  };
}

export type VerifyDevicePinResult =
  | { ok: true; device: StoredRegisteredDevice }
  | {
      ok: false;
      code:
        | 'USER_NOT_FOUND'
        | 'ACCOUNT_PENDING'
        | 'ACCOUNT_SUSPENDED'
        | 'DEVICE_NOT_REGISTERED'
        | 'INVALID_PIN_FORMAT'
        | 'PIN_LOCKED'
        | 'INVALID_PIN';
      message: string;
      remainingAttempts?: number;
      lockedMinutes?: number;
    };

export function verifyRegisteredDevicePinLogin(
  user: StoredUser | undefined,
  params: { deviceId: string; deviceSecret: string; pin: string },
  nowMs = Date.now()
): VerifyDevicePinResult {
  const pin = String(params.pin || '').trim();
  if (!isValidFourDigitPin(pin)) {
    return {
      ok: false,
      code: 'INVALID_PIN_FORMAT',
      message: 'Enter a valid 4-digit numeric PIN.',
    };
  }

  if (!user) {
    return {
      ok: false,
      code: 'USER_NOT_FOUND',
      message: 'Selected account was not found. Sign in with email and password.',
    };
  }

  if (user.status === 'pending_approval') {
    return {
      ok: false,
      code: 'ACCOUNT_PENDING',
      message: 'Your registration is awaiting administrator approval.',
    };
  }

  if (user.status === 'pending_activation') {
    return {
      ok: false,
      code: 'ACCOUNT_PENDING',
      message:
        'Your membership is approved and awaiting activation. Please sign in with email and password to enter your Member ID and 6-digit OTP.',
    };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      code: 'ACCOUNT_SUSPENDED',
      message: 'Account is suspended. Contact an administrator.',
    };
  }

  const deviceId = String(params.deviceId || '').trim();
  const deviceSecret = String(params.deviceSecret || '').trim();
  const devices = Array.isArray(user.registeredDevices) ? user.registeredDevices : [];
  const device = devices.find((d) => d.deviceId === deviceId);

  if (!device || !deviceSecret) {
    return {
      ok: false,
      code: 'DEVICE_NOT_REGISTERED',
      message: 'This mobile device is no longer registered. Sign in with email and password.',
    };
  }

  const lockedUntilMs = device.lockedUntil ? new Date(device.lockedUntil).getTime() : 0;
  if (lockedUntilMs > nowMs) {
    const lockedMinutes = Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60_000));
    return {
      ok: false,
      code: 'PIN_LOCKED',
      lockedMinutes,
      message: `Too many incorrect PIN attempts. Try again in ${lockedMinutes} min or sign in with password.`,
    };
  }

  const incomingSecretHash = computeSha256Hash(deviceSecret);
  if (!timingSafeHashEqual(incomingSecretHash, device.deviceSecretHash)) {
    return {
      ok: false,
      code: 'DEVICE_NOT_REGISTERED',
      message: 'Device credential expired or revoked. Sign in with email and password.',
    };
  }

  if (!bcrypt.compareSync(pin, device.pinHash)) {
    const nextFailed = (device.failedAttempts || 0) + 1;
    device.failedAttempts = nextFailed;
    if (nextFailed >= MAX_PIN_FAILED_ATTEMPTS) {
      device.lockedUntil = new Date(nowMs + PIN_LOCKOUT_MS).toISOString();
      return {
        ok: false,
        code: 'PIN_LOCKED',
        remainingAttempts: 0,
        lockedMinutes: Math.ceil(PIN_LOCKOUT_MS / 60_000),
        message:
          'PIN locked for 15 minutes after 5 incorrect attempts. Use your email and password to sign in.',
      };
    }

    const remainingAttempts = MAX_PIN_FAILED_ATTEMPTS - nextFailed;
    return {
      ok: false,
      code: 'INVALID_PIN',
      remainingAttempts,
      message: `Incorrect 4-digit PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
    };
  }

  device.failedAttempts = 0;
  device.lockedUntil = undefined;
  device.lastUsedAt = new Date(nowMs).toISOString();
  return { ok: true, device };
}

export function revokeDeviceOnUser(
  user: StoredUser,
  deviceId: string
): StoredRegisteredDevice | null {
  if (!Array.isArray(user.registeredDevices)) return null;
  const idx = user.registeredDevices.findIndex((d) => d.deviceId === deviceId);
  if (idx < 0) return null;
  const [removed] = user.registeredDevices.splice(idx, 1);
  return removed;
}
