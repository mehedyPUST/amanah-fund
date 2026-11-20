'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
} from 'firebase/messaging';
import type {
  FcmPushPlatform,
  FirebaseClientWebConfig,
  PushNotificationStatusResponse,
} from '../types/coop.ts';
import { api } from './api.ts';

const FCM_TOKEN_STORAGE_KEY = 'amanah_fcm_token_v1';
const FCM_CLIENT_APP_NAME = 'amanah-fcm-client';

export interface PushClientCapabilities {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  isIosSafariNeedsInstall: boolean;
  platform: FcmPushPlatform;
}

export interface IncomingForegroundPush {
  title: string;
  body: string;
  url: string;
  tag: string;
  data?: Record<string, string>;
}

function detectPlatform(): FcmPushPlatform {
  if (typeof window === 'undefined') return 'web';
  const ua = window.navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  if (isStandalone) return 'pwa';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

function buildDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Browser';
  const ua = window.navigator.userAgent || '';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Firefox\//i.test(ua)
      ? 'Firefox'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Device';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return `${browser} · ${os}${isStandalone ? ' PWA' : ''}`;
}

export function getPushClientCapabilities(): PushClientCapabilities {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported',
      isIosSafariNeedsInstall: false,
      platform: 'web',
    };
  }

  const ua = window.navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  const hasBrowserApis =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  return {
    supported: hasBrowserApis,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    isIosSafariNeedsInstall: isIos && !isStandalone && !hasBrowserApis,
    platform: detectPlatform(),
  };
}

export function getCachedFcmToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

function setCachedFcmToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token && token.trim()) {
      window.localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token.trim());
    } else {
      window.localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function getOrInitFirebaseClientApp(config: FirebaseClientWebConfig): FirebaseApp {
  const existing = getApps().find((app) => app.name === FCM_CLIENT_APP_NAME);
  if (existing) return existing;
  try {
    return initializeApp(config, FCM_CLIENT_APP_NAME);
  } catch {
    return getApp(FCM_CLIENT_APP_NAME);
  }
}

async function getReadyMessaging(
  config: FirebaseClientWebConfig
): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  const messagingSupported = await isSupported().catch(() => false);
  if (!messagingSupported) return null;
  const app = getOrInitFirebaseClientApp(config);
  return getMessaging(app);
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    return existing;
  }
  await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  return navigator.serviceWorker.ready;
}

export interface SyncPushResult {
  ok: boolean;
  reason?:
    | 'unsupported'
    | 'ios_install_required'
    | 'permission_denied'
    | 'permission_dismissed'
    | 'not_configured_client'
    | 'token_unavailable'
    | 'error';
  message?: string;
  token?: string;
  status?: PushNotificationStatusResponse;
}

export async function syncFcmPushSubscription(options?: {
  requestPermission?: boolean;
}): Promise<SyncPushResult> {
  const caps = getPushClientCapabilities();
  if (caps.isIosSafariNeedsInstall) {
    return {
      ok: false,
      reason: 'ios_install_required',
      message: 'Install Amanah to your Home Screen first to enable iOS Web Push notifications.',
    };
  }
  if (!caps.supported) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'This browser does not support Web Push notifications.',
    };
  }

  let permission = Notification.permission;
  if (permission === 'default' && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission === 'denied') {
    return {
      ok: false,
      reason: 'permission_denied',
      message: 'Notifications are blocked in your browser site settings.',
    };
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'permission_dismissed',
      message: 'Notification permission was not granted.',
    };
  }

  try {
    const status = await api.getPushStatus();
    const vapidKey =
      status.vapidPublicKey ||
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
      '';
    if (!status.firebaseConfig || !vapidKey) {
      return {
        ok: false,
        reason: 'not_configured_client',
        status,
        message: 'Firebase Web Push VAPID public key is not configured on the server yet.',
      };
    }

    const messaging = await getReadyMessaging(status.firebaseConfig);
    if (!messaging) {
      return {
        ok: false,
        reason: 'unsupported',
        status,
        message: 'Firebase Cloud Messaging is not supported in this browser environment.',
      };
    }

    const swReg = await ensureServiceWorkerRegistration();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return {
        ok: false,
        reason: 'token_unavailable',
        status,
        message: 'Browser did not return an FCM registration token.',
      };
    }

    setCachedFcmToken(token);
    await api.subscribePushToken({
      token,
      platform: caps.platform,
      userAgentLabel: buildDeviceLabel(),
    });

    const refreshedStatus = await api.getPushStatus().catch(() => status);
    return {
      ok: true,
      token,
      status: refreshedStatus,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Failed to enable push notifications.',
    };
  }
}

export async function unregisterFcmPushSubscription(
  firebaseConfig?: FirebaseClientWebConfig | null
): Promise<void> {
  const cachedToken = getCachedFcmToken();
  try {
    if (firebaseConfig && typeof window !== 'undefined') {
      const messaging = await getReadyMessaging(firebaseConfig);
      if (messaging) {
        await deleteToken(messaging).catch(() => false);
      }
    }
  } catch {
    // ignore Firebase client deleteToken failures
  }

  if (cachedToken) {
    await api.unsubscribePushToken(cachedToken).catch(() => undefined);
    setCachedFcmToken(null);
  }
}

export async function subscribeForegroundFcmMessages(
  firebaseConfig: FirebaseClientWebConfig,
  onIncoming: (push: IncomingForegroundPush) => void
): Promise<() => void> {
  const messaging = await getReadyMessaging(firebaseConfig);
  if (!messaging) return () => undefined;

  return onMessage(messaging, (payload: MessagePayload) => {
    const title =
      payload.notification?.title ||
      payload.data?.title ||
      'Amanah Co-op Treasury';
    const body = payload.notification?.body || payload.data?.body || '';
    const url =
      payload.data?.url ||
      payload.fcmOptions?.link ||
      '/dashboard?page=notification';
    const tag = payload.data?.tag || 'amanah-push';
    onIncoming({
      title,
      body,
      url,
      tag,
      data: payload.data,
    });
  });
}
