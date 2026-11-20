import { describe, expect, it } from 'vitest';
import type { EmailNotification, PublicUser } from '../src/types/coop.ts';
import { groupNotificationsForView } from '../src/utils/notificationGroups.ts';

const adminViewer: Pick<PublicUser, 'id' | 'email' | 'role'> = {
  id: 'usr-admin',
  email: 'admin@amanah.org',
  role: 'admin',
};

const memberViewer: Pick<PublicUser, 'id' | 'email' | 'role'> = {
  id: 'usr-m1',
  email: 'm1@amanah.org',
  role: 'member',
};

function makeNotif(overrides: Partial<EmailNotification>): EmailNotification {
  return {
    id: `n-${Math.random().toString(36).slice(2, 7)}`,
    type: 'meeting_scheduled',
    recipientEmail: 'm1@amanah.org',
    recipientName: 'Member One',
    recipientUserId: 'usr-m1',
    subject: 'Cooperative Meeting Notice: Monthly Shura',
    body: 'Assalamu Alaikum Member One, meeting tomorrow.',
    deliveryChannel: 'in_app_outbox',
    deliveryStatus: 'queued',
    relatedId: 'mtg-1',
    createdAt: '2026-11-20T09:00:00.000Z',
    readByRecipient: false,
    ...overrides,
  };
}

describe('groupNotificationsForView', () => {
  it('collapses a common broadcast notification generated per member into 1 grouped entry', () => {
    const raw: EmailNotification[] = [
      makeNotif({
        id: 'n-m1',
        recipientUserId: 'usr-m1',
        recipientEmail: 'm1@amanah.org',
        recipientName: 'Member One',
        body: 'Assalamu Alaikum Member One, meeting tomorrow.',
        readByRecipient: false,
      }),
      makeNotif({
        id: 'n-m2',
        recipientUserId: 'usr-m2',
        recipientEmail: 'm2@amanah.org',
        recipientName: 'Member Two',
        body: 'Assalamu Alaikum Member Two, meeting tomorrow.',
        readByRecipient: true,
      }),
      makeNotif({
        id: 'n-admin',
        recipientUserId: 'usr-admin',
        recipientEmail: 'admin@amanah.org',
        recipientName: 'Admin',
        body: 'Assalamu Alaikum Admin, meeting tomorrow.',
        readByRecipient: false,
        deliveryStatus: 'sent_via_gmail',
      }),
    ];

    const groups = groupNotificationsForView(raw, adminViewer);
    expect(groups).toHaveLength(1);
    expect(groups[0].isBroadcast).toBe(true);
    expect(groups[0].items).toHaveLength(3);
    expect(groups[0].primary.id).toBe('n-admin');
    expect(groups[0].viewerUnreadIds).toEqual(['n-admin']);
    expect(groups[0].isUnread).toBe(true);
    expect(groups[0].queuedIds).toEqual(['n-m1', 'n-m2']);
    expect(groups[0].sentItems.map((i) => i.id)).toEqual(['n-admin']);
    expect(groups[0].readCount).toBe(1);
  });

  it('keeps distinct events and personal notifications separate while grouping profit distribution batches', () => {
    const raw: EmailNotification[] = [
      makeNotif({
        id: 'p-1',
        type: 'profit_distribution_notice',
        relatedId: 'proj-1',
        subject: 'Halal Profit Distribution (Q4 2026): 1200 BDT',
        recipientUserId: 'usr-m1',
        recipientEmail: 'm1@amanah.org',
        recipientName: 'Member One',
      }),
      makeNotif({
        id: 'p-2',
        type: 'profit_distribution_notice',
        relatedId: 'proj-1',
        subject: 'Halal Profit Distribution (Q4 2026): 2400 BDT',
        recipientUserId: 'usr-m2',
        recipientEmail: 'm2@amanah.org',
        recipientName: 'Member Two',
      }),
      makeNotif({
        id: 'c-1',
        type: 'contribution_accepted',
        relatedId: 'ctr-1',
        subject: 'Contribution Approved',
        recipientUserId: 'usr-m1',
        recipientEmail: 'm1@amanah.org',
      }),
      makeNotif({
        id: 'poll-1',
        type: 'decision_vote_requested',
        relatedId: 'poll-9',
        subject: 'Opinion Ballot Open: Budget 2027',
        recipientUserId: 'usr-m1',
        recipientEmail: 'm1@amanah.org',
      }),
      makeNotif({
        id: 'poll-2',
        type: 'decision_vote_requested',
        relatedId: 'poll-9',
        subject: 'Opinion Ballot Open: Budget 2027',
        recipientUserId: 'usr-m2',
        recipientEmail: 'm2@amanah.org',
      }),
    ];

    const groups = groupNotificationsForView(raw, adminViewer);
    expect(groups).toHaveLength(3);
    expect(groups[0].type).toBe('profit_distribution_notice');
    expect(groups[0].title).toBe('Halal Profit Distribution (Q4 2026)');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].isUnread).toBe(false);

    expect(groups[1].type).toBe('contribution_accepted');
    expect(groups[1].isBroadcast).toBe(false);

    expect(groups[2].type).toBe('decision_vote_requested');
    expect(groups[2].isBroadcast).toBe(true);
    expect(groups[2].isUnread).toBe(false);
  });

  it('sanitizes personal greeting when viewer is not in a broadcast group and preserves single member unread status', () => {
    const raw: EmailNotification[] = [
      makeNotif({
        id: 'v-1',
        type: 'decision_vote_requested',
        relatedId: 'poll-2',
        subject: 'Opinion Ballot Open: Bylaw Update',
        recipientUserId: 'usr-m1',
        recipientEmail: 'm1@amanah.org',
        recipientName: 'Member One',
        body: 'Assalamu Alaikum Member One, please vote.',
      }),
      makeNotif({
        id: 'v-2',
        type: 'decision_vote_requested',
        relatedId: 'poll-2',
        subject: 'Opinion Ballot Open: Bylaw Update',
        recipientUserId: 'usr-m2',
        recipientEmail: 'm2@amanah.org',
        recipientName: 'Member Two',
        body: 'Assalamu Alaikum Member Two, please vote.',
      }),
    ];

    const adminGroups = groupNotificationsForView(raw, adminViewer);
    expect(adminGroups).toHaveLength(1);
    expect(adminGroups[0].body).toBe('Assalamu Alaikum, please vote.');
    expect(adminGroups[0].isUnread).toBe(false);

    const memberView = groupNotificationsForView([raw[0]], memberViewer);
    expect(memberView).toHaveLength(1);
    expect(memberView[0].isBroadcast).toBe(false);
    expect(memberView[0].isUnread).toBe(true);
    expect(memberView[0].viewerUnreadIds).toEqual(['v-1']);
  });
});
