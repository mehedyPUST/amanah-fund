import fs from 'node:fs';
import path from 'node:path';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import type {
  EmailNotification,
  FcmDeviceTokenRecord,
  FcmPushPlatform,
  FirebaseClientWebConfig,
  NotificationType,
  PrivateMessage,
  PushTestResponse,
  UserRole,
} from '../types/coop.ts';
import { updateVaultState, type VaultState } from './db.ts';

const FCM_APP_NAME = 'amanah-fcm-server';
const MAX_TOKENS_PER_USER = 10;

interface RawAppletConfigFile {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

let cachedAppletConfig: RawAppletConfigFile | null = null;

function loadFirebaseAppletConfigFile(): RawAppletConfigFile {
  if (cachedAppletConfig) return cachedAppletConfig;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RawAppletConfigFile;
      cachedAppletConfig = parsed || {};
      return cachedAppletConfig;
    }
  } catch {
    // ignore missing or malformed firebase-applet-config.json
  }
  cachedAppletConfig = {};
  return cachedAppletConfig;
}

export function getPublicFirebaseWebConfig(): FirebaseClientWebConfig | null {
  const fileCfg = loadFirebaseAppletConfigFile();
  const apiKey = (process.env.FIREBASE_API_KEY || fileCfg.apiKey || '').trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID || fileCfg.projectId || '').trim();
  const messagingSenderId = (
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    fileCfg.messagingSenderId ||
    ''
  ).trim();
  const appId = (process.env.FIREBASE_APP_ID || fileCfg.appId || '').trim();
  const authDomain = (
    process.env.FIREBASE_AUTH_DOMAIN ||
    fileCfg.authDomain ||
    (projectId ? `${projectId}.firebaseapp.com` : '')
  ).trim();
  const storageBucket = (
    process.env.FIREBASE_STORAGE_BUCKET ||
    fileCfg.storageBucket ||
    (projectId ? `${projectId}.firebasestorage.app` : '')
  ).trim();

  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function getFirebaseVapidPublicKey(): string {
  return (
    process.env.FIREBASE_VAPID_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    ''
  ).trim();
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };
      const projectId = (parsed.project_id || parsed.projectId || '').trim();
      const clientEmail = (parsed.client_email || parsed.clientEmail || '').trim();
      const privateKey = (parsed.private_key || parsed.privateKey || '')
        .replace(/\\n/g, '\n')
        .trim();
      if (clientEmail && privateKey) {
        return {
          projectId: projectId || getPublicFirebaseWebConfig()?.projectId,
          clientEmail,
          privateKey,
        };
      }
    } catch (err) {
      console.warn('[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON format:', err);
    }
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    getPublicFirebaseWebConfig()?.projectId ||
    ''
  ).trim();

  if (clientEmail && privateKey && projectId) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  return null;
}

export function isPushServerConfigured(): boolean {
  if (parseServiceAccountFromEnv()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  return false;
}

function getOrCreateFcmAdminApp(): App | null {
  const existing = getApps().find((app) => app.name === FCM_APP_NAME);
  if (existing) return existing;

  const serviceAccount = parseServiceAccountFromEnv();
  const webCfg = getPublicFirebaseWebConfig();
  const projectId = (
    serviceAccount?.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    webCfg?.projectId ||
    ''
  ).trim();

  if (serviceAccount) {
    return initializeApp(
      {
        credential: cert(serviceAccount),
        ...(projectId ? { projectId } : {}),
      },
      FCM_APP_NAME
    );
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    try {
      return initializeApp(
        {
          ...(projectId ? { projectId } : {}),
        },
        FCM_APP_NAME
      );
    } catch {
      return null;
    }
  }

  return getApps().length > 0 ? getApp() : null;
}

export function sanitizeFcmPlatform(value: unknown): FcmPushPlatform {
  if (value === 'pwa' || value === 'android' || value === 'ios') return value;
  return 'web';
}

export function upsertFcmDeviceTokenInState(
  state: VaultState,
  params: {
    userId: string;
    token: string;
    platform?: FcmPushPlatform;
    userAgentLabel?: string;
    nowIso?: string;
  }
): { record: FcmDeviceTokenRecord; isNew: boolean } {
  const cleanToken = params.token.trim();
  const nowIso = params.nowIso || new Date().toISOString();
  const cleanLabel = params.userAgentLabel?.trim().slice(0, 120) || undefined;
  const list = Array.isArray(state.fcmTokens) ? [...state.fcmTokens] : [];

  const existingByToken = list.find((item) => item.token === cleanToken);
  const filtered = list.filter((item) => item.token !== cleanToken);

  const record: FcmDeviceTokenRecord = {
    id:
      existingByToken?.id ||
      `fcm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    token: cleanToken,
    platform: params.platform || existingByToken?.platform || 'web',
    userAgentLabel: cleanLabel || existingByToken?.userAgentLabel,
    createdAt: existingByToken?.createdAt || nowIso,
    updatedAt: nowIso,
    lastSuccessAt: existingByToken?.lastSuccessAt,
  };

  const userTokens = filtered
    .filter((item) => item.userId === params.userId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_TOKENS_PER_USER - 1);
  const userTokenIds = new Set(userTokens.map((t) => t.id));
  const otherTokens = filtered.filter((item) => item.userId !== params.userId);

  state.fcmTokens = [
    record,
    ...filtered.filter((item) => userTokenIds.has(item.id)),
    ...otherTokens,
  ];

  return {
    record,
    isNew: !existingByToken || existingByToken.userId !== params.userId,
  };
}

export function removeFcmDeviceTokenInState(
  state: VaultState,
  userId: string,
  token?: string
): number {
  const existing = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
  if (existing.length === 0) return 0;

  const cleanToken = typeof token === 'string' ? token.trim() : '';
  const next = cleanToken
    ? existing.filter((item) => !(item.userId === userId && item.token === cleanToken))
    : existing.filter((item) => item.userId !== userId);

  const removed = existing.length - next.length;
  state.fcmTokens = next;
  return removed;
}

export function pruneInvalidFcmTokensInState(
  state: VaultState,
  invalidTokens: string[]
): number {
  if (invalidTokens.length === 0) return 0;
  const badSet = new Set(invalidTokens.map((t) => t.trim()).filter(Boolean));
  const existing = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
  const next = existing.filter((item) => !badSet.has(item.token));
  state.fcmTokens = next;
  return existing.length - next.length;
}

export function resolveNotificationTargetUrl(
  type: NotificationType,
  recipientRole: UserRole,
  subject = ''
): string {
  const isStaff = recipientRole === 'admin' || recipientRole === 'manager';
  const lower = subject.toLowerCase();

  switch (type) {
    case 'signup_pending_admin':
    case 'profile_update_requested':
      return '/dashboard?page=member-registry';
    case 'profile_update_reviewed':
      return '/dashboard?page=my-profile';
    case 'contribution_placed_manager':
      return isStaff ? '/dashboard?page=manager-desk' : '/dashboard?page=monthly-contribution';
    case 'contribution_accepted':
    case 'contribution_rejected':
    case 'monthly_contribution_reminder':
      return recipientRole === 'admin'
        ? '/dashboard?page=notification'
        : '/dashboard?page=monthly-contribution';
    case 'loan_vote_requested':
      if (isStaff && (lower.includes('initiate vote') || lower.includes('ready to initiate'))) {
        return '/dashboard?page=manager-desk';
      }
      return '/dashboard?page=ballot';
    case 'decision_vote_requested':
      return '/dashboard?page=ballot';
    case 'loan_guarantor_requested':
    case 'loan_approved_confirmation':
    case 'loan_rejected_notice':
    case 'loan_repayment_notice':
    case 'loan_repayment_rejected':
      return recipientRole === 'admin'
        ? '/dashboard?page=notification'
        : '/dashboard?page=quard-hasan';
    case 'profit_distribution_notice':
      return '/dashboard?page=my-amanah';
    case 'community_post_created':
    case 'community_moderation':
    case 'community_mention':
      return '/dashboard?page=community';
    case 'meeting_scheduled':
    case 'cooperative_notice':
    default:
      return '/dashboard?page=notification';
  }
}

export interface PushDispatchPayload {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  data?: Record<string, string>;
}

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

async function sendMulticastPush(
  tokens: string[],
  payload: Omit<PushDispatchPayload, 'userId'>
): Promise<{
  deliveredTokens: string[];
  invalidTokens: string[];
  failedCount: number;
  lastError?: string;
}> {
  if (tokens.length === 0 || !isPushServerConfigured()) {
    return { deliveredTokens: [], invalidTokens: [], failedCount: 0 };
  }

  const app = getOrCreateFcmAdminApp();
  if (!app) {
    return {
      deliveredTokens: [],
      invalidTokens: [],
      failedCount: tokens.length,
      lastError: 'Firebase Admin messaging is not initialized.',
    };
  }

  const messaging = getMessaging(app);
  const deliveredTokens: string[] = [];
  const invalidTokens: string[] = [];
  let failedCount = 0;
  let lastError: string | undefined;

  const cleanTitle = payload.title.slice(0, 120);
  const cleanBody = payload.body.slice(0, 240);

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const multicast: MulticastMessage = {
      tokens: chunk,
      notification: {
        title: cleanTitle,
        body: cleanBody,
      },
      data: {
        title: cleanTitle,
        body: cleanBody,
        url: payload.url,
        tag: payload.tag,
        ...(payload.data || {}),
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400',
        },
        notification: {
          title: cleanTitle,
          body: cleanBody,
          icon: '/pwa-192x192.png',
          badge: '/favicon-32x32.png',
          tag: payload.tag,
          renotify: true,
        },
        fcmOptions: {
          link: payload.url,
        },
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'amanah_alerts',
          tag: payload.tag,
        },
      },
    };

    const batchRes = await messaging.sendEachForMulticast(multicast);
    batchRes.responses.forEach((resp, idx) => {
      const token = chunk[idx];
      if (resp.success) {
        deliveredTokens.push(token);
      } else {
        failedCount += 1;
        const code = resp.error?.code || '';
        lastError = resp.error?.message || code || 'FCM delivery failed';
        if (INVALID_TOKEN_ERROR_CODES.has(code)) {
          invalidTokens.push(token);
        }
      }
    });
  }

  return { deliveredTokens, invalidTokens, failedCount, lastError };
}

export async function dispatchPushPayloads(
  state: VaultState,
  payloads: PushDispatchPayload[]
): Promise<{
  deliveredCount: number;
  failedCount: number;
  invalidTokens: string[];
  deliveredTokens: string[];
  lastError?: string;
}> {
  if (payloads.length === 0 || !isPushServerConfigured()) {
    return {
      deliveredCount: 0,
      failedCount: 0,
      invalidTokens: [],
      deliveredTokens: [],
    };
  }

  const allTokens = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
  if (allTokens.length === 0) {
    return {
      deliveredCount: 0,
      failedCount: 0,
      invalidTokens: [],
      deliveredTokens: [],
    };
  }

  const tokensByUser = new Map<string, string[]>();
  for (const record of allTokens) {
    const existing = tokensByUser.get(record.userId) || [];
    existing.push(record.token);
    tokensByUser.set(record.userId, existing);
  }

  const allInvalid: string[] = [];
  const allDelivered: string[] = [];
  let totalFailed = 0;
  let lastError: string | undefined;

  const jobs = payloads.map(async (item) => {
    const userTokens = tokensByUser.get(item.userId);
    if (!userTokens || userTokens.length === 0) return;

    const user = state.users.find((u) => u.id === item.userId);
    if (!user || user.status !== 'active') return;
    if (user.notificationPreferences?.pushAlerts === false) return;

    const result = await sendMulticastPush(userTokens, item);
    allDelivered.push(...result.deliveredTokens);
    allInvalid.push(...result.invalidTokens);
    totalFailed += result.failedCount;
    if (result.lastError) lastError = result.lastError;
  });

  await Promise.allSettled(jobs);

  if (allInvalid.length > 0 || allDelivered.length > 0) {
    const deliveredSet = new Set(allDelivered);
    const nowIso = new Date().toISOString();
    await updateVaultState((draft) => {
      if (allInvalid.length > 0) {
        pruneInvalidFcmTokensInState(draft, allInvalid);
      }
      if (deliveredSet.size > 0 && Array.isArray(draft.fcmTokens)) {
        for (const rec of draft.fcmTokens) {
          if (deliveredSet.has(rec.token)) {
            rec.lastSuccessAt = nowIso;
          }
        }
      }
      return draft;
    }).catch(() => undefined);
  }

  return {
    deliveredCount: allDelivered.length,
    failedCount: totalFailed,
    invalidTokens: allInvalid,
    deliveredTokens: allDelivered,
    lastError,
  };
}

export async function dispatchPushForNewNotifications(
  addedNotifications: EmailNotification[],
  state: VaultState
): Promise<void> {
  if (addedNotifications.length === 0 || !isPushServerConfigured()) return;
  const fcmTokens = Array.isArray(state.fcmTokens) ? state.fcmTokens : [];
  if (fcmTokens.length === 0) return;

  const tokenUserIds = new Set(fcmTokens.map((t) => t.userId));
  const payloads: PushDispatchPayload[] = [];

  for (const notif of addedNotifications) {
    const recipient = notif.recipientUserId
      ? state.users.find((u) => u.id === notif.recipientUserId)
      : state.users.find(
          (u) => u.email.toLowerCase() === notif.recipientEmail.toLowerCase()
        );
    if (!recipient || !tokenUserIds.has(recipient.id)) continue;
    if (recipient.status !== 'active') continue;
    if (recipient.notificationPreferences?.pushAlerts === false) continue;

    const url = resolveNotificationTargetUrl(notif.type, recipient.role, notif.subject);
    payloads.push({
      userId: recipient.id,
      title: notif.subject,
      body: notif.body,
      url,
      tag: `amanah-${notif.type}-${notif.relatedId || notif.id}`,
      data: {
        type: notif.type,
        notificationId: notif.id,
        ...(notif.relatedId ? { relatedId: notif.relatedId } : {}),
      },
    });
  }

  if (payloads.length > 0) {
    await dispatchPushPayloads(state, payloads);
  }
}

export async function dispatchPushForPrivateMessage(
  state: VaultState,
  dm: PrivateMessage
): Promise<void> {
  if (!isPushServerConfigured()) return;
  const hasRecipientTokens = (state.fcmTokens || []).some(
    (t) => t.userId === dm.recipientId
  );
  if (!hasRecipientTokens) return;

  const preview = dm.body.trim().replace(/\s+/g, ' ');
  const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;

  await dispatchPushPayloads(state, [
    {
      userId: dm.recipientId,
      title: `Message from ${dm.senderName}`,
      body: body || 'Sent you a private message',
      url: `/dashboard?page=community&dm=${encodeURIComponent(dm.senderId)}`,
      tag: `amanah-dm-${dm.conversationId}`,
      data: {
        type: 'direct_message',
        conversationId: dm.conversationId,
        peerId: dm.senderId,
        messageId: dm.id,
      },
    },
  ]);
}

export async function sendTestPushToUser(
  state: VaultState,
  userId: string
): Promise<PushTestResponse> {
  const userTokens = (state.fcmTokens || [])
    .filter((t) => t.userId === userId)
    .map((t) => t.token);

  if (userTokens.length === 0) {
    return {
      ok: false,
      deliveredCount: 0,
      failedCount: 0,
      removedInvalidCount: 0,
      totalDevices: 0,
      configuredServer: isPushServerConfigured(),
      reason: 'No browser or PWA device is registered for push notifications on this account yet.',
    };
  }

  if (!isPushServerConfigured()) {
    return {
      ok: false,
      deliveredCount: 0,
      failedCount: userTokens.length,
      removedInvalidCount: 0,
      totalDevices: userTokens.length,
      configuredServer: false,
      reason:
        'Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) are not configured on the server.',
    };
  }

  const user = state.users.find((u) => u.id === userId);
  const memberName = user?.name || 'Member';
  const result = await sendMulticastPush(userTokens, {
    title: 'Amanah Push Notifications Active',
    body: `Assalamu Alaikum ${memberName}, real-time cooperative & Qard Hasan push alerts are connected on this device.`,
    url: '/dashboard?page=notification',
    tag: `amanah-push-test-${userId}`,
    data: {
      type: 'push_test',
      userId,
    },
  });

  if (result.invalidTokens.length > 0 || result.deliveredTokens.length > 0) {
    const deliveredSet = new Set(result.deliveredTokens);
    const nowIso = new Date().toISOString();
    await updateVaultState((draft) => {
      if (result.invalidTokens.length > 0) {
        pruneInvalidFcmTokensInState(draft, result.invalidTokens);
      }
      if (deliveredSet.size > 0 && Array.isArray(draft.fcmTokens)) {
        for (const rec of draft.fcmTokens) {
          if (deliveredSet.has(rec.token)) {
            rec.lastSuccessAt = nowIso;
          }
        }
      }
      return draft;
    });
  }

  return {
    ok: result.deliveredTokens.length > 0,
    deliveredCount: result.deliveredTokens.length,
    failedCount: result.failedCount,
    removedInvalidCount: result.invalidTokens.length,
    totalDevices: userTokens.length,
    configuredServer: true,
    ...(result.deliveredTokens.length === 0 && result.lastError
      ? { reason: result.lastError }
      : {}),
  };
}
