import { describe, expect, it } from 'vitest';
import { buildDashboardOverview } from '../src/server/coopService.ts';
import type { VaultState } from '../src/server/db.ts';
import type { EmailNotification, NotificationType, PublicUser } from '../src/types/coop.ts';
import { buildBellAlerts, isNotificationForUser } from '../src/utils/notificationAlerts.ts';

const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'signup_pending_admin',
  'signup_activation_issued',
  'signup_approved',
  'contribution_placed_manager',
  'contribution_accepted',
  'contribution_rejected',
  'loan_vote_requested',
  'loan_guarantor_requested',
  'loan_approved_confirmation',
  'loan_rejected_notice',
  'loan_repayment_notice',
  'loan_repayment_rejected',
  'monthly_contribution_reminder',
  'profit_distribution_notice',
  'meeting_scheduled',
  'decision_vote_requested',
  'profile_update_requested',
  'profile_update_reviewed',
  'community_post_created',
  'community_moderation',
  'community_mention',
  'cooperative_notice',
];

const mockTranslate = Object.assign(
  (key: string) => key,
  {
    has: (key: string) => key.startsWith('types.') && !key.includes('legacy_unknown'),
  }
);

function createMember(overrides?: Partial<PublicUser>): PublicUser {
  return {
    id: 'usr-1',
    name: 'Mehedy Hasan',
    email: 'Mehedy@Example.com',
    memberCode: 'AC-011',
    role: 'member',
    status: 'active',
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createNotification(
  id: string,
  type: NotificationType,
  overrides?: Partial<EmailNotification>
): EmailNotification {
  return {
    id,
    type,
    recipientEmail: 'mehedy@example.com',
    recipientName: 'Mehedy Hasan',
    recipientUserId: 'usr-1',
    subject: `Subject for ${type}`,
    body: `Body for ${type}`,
    deliveryChannel: 'in_app_outbox',
    deliveryStatus: 'queued',
    createdAt: '2026-11-20T08:00:00.000Z',
    readByRecipient: false,
    ...overrides,
  };
}

function createMinimalVault(user: PublicUser, notifications: EmailNotification[]): VaultState {
  return {
    users: [
      {
        ...user,
        registeredDevices: undefined,
        passwordHash: 'hash',
      },
    ],
    fundConfig: {
      id: 'default-config',
      fundName: 'Amanah',
      currency: 'BDT',
      monthlyContributionAmount: 5000,
      maxLoansPerYear: 3,
      maxLoanAmount: 50000,
      maxInstallmentMonths: 10,
      voteThresholdNumerator: 2,
      voteThresholdDenominator: 3,
      maturityDate: '2036-12-31',
      halalInvestmentThesis: 'Vision 36',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'System',
    },
    contributions: [],
    loans: [],
    halalProjects: [],
    emailNotifications: notifications,
    auditLogs: [],
    communityPosts: [],
    privateMessages: [],
    fcmTokens: [],
  };
}

describe('Notification bell alerts & unread count alignment', () => {
  it('maps every single NotificationType to a BellAlertItem without dropping any unread alert', () => {
    const member = createMember();
    for (const type of ALL_NOTIFICATION_TYPES) {
      const notif = createNotification(`n-${type}`, type);
      const alerts = buildBellAlerts({
        user: member,
        userUnread: [notif],
        overview: null,
        contributions: [],
        loans: [],
        tNotif: mockTranslate,
        now: new Date('2026-11-20T10:00:00.000Z'),
      });

      expect(alerts.some((a) => a.notificationId === notif.id)).toBe(true);
    }
  });

  it('never drops unread notifications for admin (including fallback or legacy types)', () => {
    const admin = createMember({ id: 'adm-1', role: 'admin', email: 'admin@example.com' });
    const legacyNotif = createNotification(
      'n-legacy',
      'legacy_unknown_type' as NotificationType,
      { recipientUserId: 'adm-1', recipientEmail: 'admin@example.com' }
    );
    const adminReminder = createNotification('n-rem', 'monthly_contribution_reminder', {
      recipientUserId: 'adm-1',
      recipientEmail: 'admin@example.com',
    });

    const alerts = buildBellAlerts({
      user: admin,
      userUnread: [legacyNotif, adminReminder],
      overview: null,
      contributions: [],
      loans: [],
      tNotif: mockTranslate,
      now: new Date('2026-11-20T10:00:00.000Z'),
    });

    expect(alerts.map((a) => a.notificationId)).toEqual(['n-legacy', 'n-rem']);
  });

  it('keeps server unreadNotificationsCount case-insensitively aligned with client isNotificationForUser', () => {
    const member = createMember({ id: 'usr-99', email: 'Member.Case@Example.COM' });
    const notifications: EmailNotification[] = [
      createNotification('n-1', 'signup_approved', {
        recipientUserId: undefined,
        recipientEmail: 'member.case@example.com',
        readByRecipient: false,
      }),
      createNotification('n-2', 'profit_distribution_notice', {
        recipientUserId: 'usr-99',
        recipientEmail: 'other@example.com',
        readByRecipient: false,
      }),
      createNotification('n-3', 'cooperative_notice', {
        recipientUserId: 'usr-99',
        recipientEmail: 'member.case@example.com',
        readByRecipient: true,
      }),
      createNotification('n-4', 'signup_pending_admin', {
        recipientUserId: undefined,
        recipientEmail: '',
        readByRecipient: false,
      }),
    ];

    const state = createMinimalVault(member, notifications);
    const overview = buildDashboardOverview(state, member);
    const clientUnread = notifications.filter(
      (n) => !n.readByRecipient && isNotificationForUser(n, member)
    );

    expect(overview.treasury.unreadNotificationsCount).toBe(2);
    expect(clientUnread.length).toBe(overview.treasury.unreadNotificationsCount);

    const alerts = buildBellAlerts({
      user: member,
      userUnread: clientUnread,
      overview,
      contributions: [],
      loans: [],
      tNotif: mockTranslate,
    });
    expect(alerts.length).toBeGreaterThanOrEqual(clientUnread.length);
  });
});
