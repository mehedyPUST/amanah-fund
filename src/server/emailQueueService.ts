import crypto from 'node:crypto';
import type {
  EmailQueueAttachment,
  EmailQueueCategory,
  EmailQueueItem,
  EmailQueueStats,
} from '../types/coop.ts';
import { loadVaultState, updateVaultState, type VaultState } from './db.ts';
import {
  deliverEmailDirect,
  type EmailAttachmentInput,
  registerEmailFailureHandler,
} from './emailService.ts';
import { broadcastRealtimeEvent } from './realtime.ts';

export const DEFAULT_EMAIL_MAX_ATTEMPTS = 5;
const MAX_STORED_SENT_HISTORY = 200;

let queueWorkerRunning = false;

export function computeRetryBackoffMs(attempts: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempts));
  if (safeAttempt === 1) return 60_000; // 1 min
  if (safeAttempt === 2) return 3 * 60_000; // 3 min
  if (safeAttempt === 3) return 10 * 60_000; // 10 min
  if (safeAttempt === 4) return 30 * 60_000; // 30 min
  return 60 * 60_000; // 60 min fallback
}

export function computeEmailQueueStats(items: EmailQueueItem[] = []): EmailQueueStats {
  let pending = 0;
  let retrying = 0;
  let failed = 0;
  let sent = 0;
  for (const item of items) {
    if (item.status === 'pending') pending += 1;
    else if (item.status === 'retrying') retrying += 1;
    else if (item.status === 'failed') failed += 1;
    else if (item.status === 'sent') sent += 1;
  }
  return {
    total: items.length,
    pending,
    retrying,
    failed,
    sent,
  };
}

function encodeAttachmentsForQueue(
  attachments?: EmailAttachmentInput[]
): EmailQueueAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const encoded: EmailQueueAttachment[] = [];
  for (const att of attachments) {
    if (!att.content || att.content.length > 2 * 1024 * 1024) continue;
    encoded.push({
      filename: att.filename,
      contentBase64: att.content.toString('base64'),
      contentType: att.contentType,
    });
  }
  return encoded.length > 0 ? encoded : undefined;
}

function decodeAttachmentsFromQueue(
  attachments?: EmailQueueAttachment[]
): EmailAttachmentInput[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((att) => ({
    filename: att.filename,
    content: Buffer.from(att.contentBase64, 'base64'),
    contentType: att.contentType,
  }));
}

function pruneSentHistoryInState(state: VaultState): void {
  const queue = state.emailQueue || [];
  let sentCount = 0;
  state.emailQueue = queue.filter((item) => {
    if (item.status !== 'sent') return true;
    sentCount += 1;
    return sentCount <= MAX_STORED_SENT_HISTORY;
  });
}

export function enqueueEmailFailureInState(
  state: VaultState,
  payload: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: EmailAttachmentInput[];
    category?: EmailQueueCategory;
    maxAttempts?: number;
  },
  reason: string,
  nowDate = new Date()
): EmailQueueItem {
  state.emailQueue = Array.isArray(state.emailQueue) ? state.emailQueue : [];
  const nowIso = nowDate.toISOString();
  const maxAttempts = Math.max(1, payload.maxAttempts || DEFAULT_EMAIL_MAX_ATTEMPTS);
  const attempts = 1;
  const isTerminal = attempts >= maxAttempts;
  const nextAttemptAt = new Date(
    nowDate.getTime() + computeRetryBackoffMs(attempts)
  ).toISOString();

  const item: EmailQueueItem = {
    id: `emq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    attachments: encodeAttachmentsForQueue(payload.attachments),
    category: payload.category || 'general',
    status: isTerminal ? 'failed' : 'retrying',
    attempts,
    maxAttempts,
    lastError: reason || 'SMTP delivery failed',
    nextAttemptAt,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  state.emailQueue.unshift(item);
  pruneSentHistoryInState(state);
  return item;
}

export function markQueueItemSuccessInState(
  state: VaultState,
  id: string,
  messageId?: string,
  nowDate = new Date()
): EmailQueueItem | null {
  state.emailQueue = Array.isArray(state.emailQueue) ? state.emailQueue : [];
  const item = state.emailQueue.find((q) => q.id === id);
  if (!item) return null;
  const nowIso = nowDate.toISOString();
  item.status = 'sent';
  item.attempts += 1;
  item.lastError = undefined;
  item.messageId = messageId;
  item.sentAt = nowIso;
  item.updatedAt = nowIso;
  pruneSentHistoryInState(state);
  return item;
}

export function markQueueItemRetryFailedInState(
  state: VaultState,
  id: string,
  reason: string,
  nowDate = new Date()
): EmailQueueItem | null {
  state.emailQueue = Array.isArray(state.emailQueue) ? state.emailQueue : [];
  const item = state.emailQueue.find((q) => q.id === id);
  if (!item) return null;
  const nowIso = nowDate.toISOString();
  item.attempts += 1;
  item.lastError = reason || 'SMTP delivery failed';
  item.updatedAt = nowIso;

  if (item.attempts >= item.maxAttempts) {
    item.status = 'failed';
    item.nextAttemptAt = nowIso;
  } else {
    item.status = 'retrying';
    item.nextAttemptAt = new Date(
      nowDate.getTime() + computeRetryBackoffMs(item.attempts)
    ).toISOString();
  }
  return item;
}

export function scheduleManualRetryInState(
  state: VaultState,
  id: string,
  nowDate = new Date()
): EmailQueueItem | null {
  state.emailQueue = Array.isArray(state.emailQueue) ? state.emailQueue : [];
  const item = state.emailQueue.find((q) => q.id === id);
  if (!item) return null;
  const nowIso = nowDate.toISOString();
  item.status = 'pending';
  item.attempts = 0;
  item.nextAttemptAt = nowIso;
  item.updatedAt = nowIso;
  return item;
}

export function sanitizeQueueItemForMonitor(item: EmailQueueItem): Omit<
  EmailQueueItem,
  'html' | 'attachments'
> & {
  attachmentFilenames: string[];
  textPreview: string;
} {
  const rawText = item.text || '';
  const maskedText =
    item.category === 'password_reset'
      ? rawText.replace(
          /(Temporary Password:\s*)([^\s\r\n]+)/gi,
          '$1••••••••'
        )
      : rawText;

  return {
    id: item.id,
    to: item.to,
    subject: item.subject,
    text: maskedText,
    textPreview: maskedText.slice(0, 800),
    category: item.category,
    status: item.status,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    lastError: item.lastError,
    messageId: item.messageId,
    nextAttemptAt: item.nextAttemptAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sentAt: item.sentAt,
    attachmentFilenames: (item.attachments || []).map((a) => a.filename),
  };
}

export async function enqueueFailedEmail(
  payload: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: EmailAttachmentInput[];
    category?: EmailQueueCategory;
  },
  reason: string
): Promise<EmailQueueItem> {
  let created!: EmailQueueItem;
  await updateVaultState((draft) => {
    created = enqueueEmailFailureInState(draft, payload, reason);
    return draft;
  });
  broadcastRealtimeEvent('email-queue:updated', {
    action: 'enqueued',
    id: created.id,
    status: created.status,
  });
  return created;
}

registerEmailFailureHandler(enqueueFailedEmail);

export async function processDueEmailQueue(options?: {
  forceAllPending?: boolean;
  limit?: number;
}): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  if (queueWorkerRunning) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  queueWorkerRunning = true;
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    const state = await loadVaultState();
    const nowMs = Date.now();
    const limit = Math.max(1, Math.min(50, options?.limit ?? 20));
    const dueItems = (state.emailQueue || [])
      .filter((item) => {
        if (item.status !== 'pending' && item.status !== 'retrying') return false;
        if (options?.forceAllPending) return true;
        const dueMs = Date.parse(item.nextAttemptAt || item.createdAt);
        return Number.isNaN(dueMs) || dueMs <= nowMs;
      })
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, limit);

    if (dueItems.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    for (const item of dueItems) {
      processed += 1;
      const result = await deliverEmailDirect({
        to: item.to,
        subject: item.subject,
        text: item.text,
        html: item.html,
        attachments: decodeAttachmentsFromQueue(item.attachments),
      });

      if (result.sent) {
        sent += 1;
        await updateVaultState((draft) => {
          markQueueItemSuccessInState(draft, item.id, result.messageId);
          return draft;
        });
      } else {
        failed += 1;
        await updateVaultState((draft) => {
          markQueueItemRetryFailedInState(
            draft,
            item.id,
            result.reason || 'SMTP delivery failed'
          );
          return draft;
        });
      }
    }

    broadcastRealtimeEvent('email-queue:updated', {
      action: 'processed',
      processed,
      sent,
      failed,
    });
    return { processed, sent, failed };
  } finally {
    queueWorkerRunning = false;
  }
}

export async function retryEmailQueueItemNow(id: string): Promise<{
  found: boolean;
  sent: boolean;
  reason?: string;
  item?: EmailQueueItem;
}> {
  const state = await loadVaultState();
  const target = (state.emailQueue || []).find((q) => q.id === id);
  if (!target) {
    return { found: false, sent: false, reason: 'NOT_FOUND' };
  }

  const result = await deliverEmailDirect({
    to: target.to,
    subject: target.subject,
    text: target.text,
    html: target.html,
    attachments: decodeAttachmentsFromQueue(target.attachments),
  });

  let updatedItem: EmailQueueItem | null = null;
  await updateVaultState((draft) => {
    const existing = (draft.emailQueue || []).find((q) => q.id === id);
    if (!existing) return draft;
    if (result.sent) {
      updatedItem = markQueueItemSuccessInState(draft, id, result.messageId);
    } else {
      // Allow manual retry to record the attempt and stay retryable or mark failed cleanly
      if (existing.attempts >= existing.maxAttempts) {
        existing.maxAttempts = existing.attempts + 1;
      }
      updatedItem = markQueueItemRetryFailedInState(
        draft,
        id,
        result.reason || 'SMTP delivery failed'
      );
    }
    return draft;
  });

  broadcastRealtimeEvent('email-queue:updated', {
    action: 'manual_retry',
    id,
    sent: result.sent,
  });

  return {
    found: true,
    sent: result.sent,
    reason: result.reason,
    item: updatedItem || undefined,
  };
}

export async function retryAllFailedEmailQueueItems(): Promise<{
  queuedCount: number;
  processed: number;
  sent: number;
  failed: number;
}> {
  let queuedCount = 0;
  await updateVaultState((draft) => {
    draft.emailQueue = Array.isArray(draft.emailQueue) ? draft.emailQueue : [];
    for (const item of draft.emailQueue) {
      if (item.status === 'failed' || item.status === 'retrying' || item.status === 'pending') {
        scheduleManualRetryInState(draft, item.id);
        queuedCount += 1;
      }
    }
    return draft;
  });

  if (queuedCount === 0) {
    return { queuedCount: 0, processed: 0, sent: 0, failed: 0 };
  }

  const res = await processDueEmailQueue({ forceAllPending: true, limit: 50 });
  return { queuedCount, ...res };
}
