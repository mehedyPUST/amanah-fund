import type { EmailNotification, NotificationType, PublicUser } from '../types/coop.ts';
import { isNotificationForUser } from './notificationAlerts.ts';

const BROADCAST_GROUPABLE_TYPES = new Set<NotificationType>([
  'meeting_scheduled',
  'cooperative_notice',
  'decision_vote_requested',
  'loan_vote_requested',
  'community_post_created',
  'monthly_contribution_reminder',
  'profit_distribution_notice',
  'signup_pending_admin',
  'profile_update_requested',
  'contribution_placed_manager',
  'loan_repayment_notice',
]);

const BATCH_WINDOW_MS = 120_000;

export interface NotificationGroup {
  id: string;
  primary: EmailNotification;
  items: EmailNotification[];
  isBroadcast: boolean;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  relatedId?: string;
  viewerUnreadIds: string[];
  isUnread: boolean;
  queuedIds: string[];
  sentItems: EmailNotification[];
  readCount: number;
}

function getNormalizedBatchSubject(item: EmailNotification): string {
  const raw = (item.subject || '').trim();
  if (item.type === 'profit_distribution_notice') {
    const stripped = raw.replace(/:\s*[^:]+$/, '').trim();
    return stripped || raw;
  }
  return raw;
}

function sanitizeBroadcastBody(
  primary: EmailNotification,
  viewerItem: EmailNotification | undefined,
  itemCount: number,
  normalizedTitle: string
): string {
  if (itemCount <= 1) {
    return primary.body;
  }
  if (viewerItem) {
    return viewerItem.body;
  }
  if (primary.type === 'profit_distribution_notice') {
    return `${normalizedTitle} — cooperative dividend payouts recorded across ${itemCount} participating members.`;
  }
  const rawBody = primary.body || '';
  return rawBody.replace(/^Assalamu Alaikum\s+[^,]+,\s*/i, 'Assalamu Alaikum, ');
}

export function groupNotificationsForView(
  notifications: EmailNotification[],
  viewer: Pick<PublicUser, 'id' | 'email' | 'role'>
): NotificationGroup[] {
  interface MutableBucket {
    anchorMs: number;
    key: string;
    normalizedTitle: string;
    items: EmailNotification[];
  }

  const buckets: MutableBucket[] = [];

  for (const item of notifications) {
    if (!BROADCAST_GROUPABLE_TYPES.has(item.type)) {
      buckets.push({
        anchorMs: Date.parse(item.createdAt) || 0,
        key: `single::${item.id}`,
        normalizedTitle: item.subject,
        items: [item],
      });
      continue;
    }

    const normalizedTitle = getNormalizedBatchSubject(item);
    const key = `${item.type}::${item.relatedId || ''}::${normalizedTitle}`;
    const itemMs = Date.parse(item.createdAt) || 0;

    const existing = buckets.find(
      (b) =>
        b.key === key &&
        (itemMs === 0 ||
          b.anchorMs === 0 ||
          Math.abs(b.anchorMs - itemMs) <= BATCH_WINDOW_MS)
    );

    if (existing) {
      existing.items.push(item);
    } else {
      buckets.push({
        anchorMs: itemMs,
        key,
        normalizedTitle,
        items: [item],
      });
    }
  }

  return buckets.map((bucket) => {
    const { items, normalizedTitle } = bucket;
    const viewerItems = items.filter((i) => isNotificationForUser(i, viewer));
    const viewerItem = viewerItems[0];
    const primary = viewerItem || items[0];
    const isBroadcast = items.length > 1;
    const viewerUnreadIds = viewerItems
      .filter((i) => !i.readByRecipient)
      .map((i) => i.id);
    const queuedIds = items
      .filter((i) => i.deliveryStatus === 'queued')
      .map((i) => i.id);
    const sentItems = items.filter((i) => i.deliveryStatus === 'sent_via_gmail');
    const readCount = items.filter((i) => Boolean(i.readByRecipient)).length;

    const title =
      isBroadcast && primary.type === 'profit_distribution_notice'
        ? normalizedTitle
        : primary.subject;

    const body = sanitizeBroadcastBody(primary, viewerItem, items.length, normalizedTitle);

    return {
      id: `grp-${primary.id}`,
      primary,
      items,
      isBroadcast,
      type: primary.type,
      title,
      body,
      createdAt: primary.createdAt,
      relatedId: primary.relatedId,
      viewerUnreadIds,
      isUnread: viewerUnreadIds.length > 0,
      queuedIds,
      sentItems,
      readCount,
    };
  });
}
