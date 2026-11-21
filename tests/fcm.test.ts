import { describe, expect, it } from 'vitest';
import type { VaultState } from '../src/server/db.ts';
import {
  getPublicFirebaseWebConfig,
  pruneInvalidFcmTokensInState,
  removeFcmDeviceTokenInState,
  resolveNotificationTargetUrl,
  upsertFcmDeviceTokenInState,
} from '../src/server/fcmService.ts';

function createMinimalVault(): VaultState {
  return {
    users: [],
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
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
    fcmTokens: [],
  };
}

describe('Firebase Cloud Messaging (FCM) server service', () => {
  it('loads public Firebase web config from firebase-applet-config.json', () => {
    const cfg = getPublicFirebaseWebConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.projectId).toBeTruthy();
    expect(cfg?.messagingSenderId).toBeTruthy();
    expect(cfg?.appId).toBeTruthy();
  });

  it('upserts, deduplicates, re-binds across users, and caps FCM tokens per user', () => {
    const state = createMinimalVault();

    // Register 11 tokens for usr-1 -> capped at 10 newest
    for (let i = 1; i <= 11; i++) {
      upsertFcmDeviceTokenInState(state, {
        userId: 'usr-1',
        token: `token-device-${String(i).padStart(2, '0')}-abcdef1234567890`,
        platform: 'pwa',
        userAgentLabel: `Device ${i}`,
        nowIso: new Date(Date.UTC(2026, 0, i)).toISOString(),
      });
    }

    const usr1Tokens = (state.fcmTokens || []).filter((t) => t.userId === 'usr-1');
    expect(usr1Tokens.length).toBe(10);
    expect(usr1Tokens.some((t) => t.token.startsWith('token-device-01'))).toBe(false);
    expect(usr1Tokens.some((t) => t.token.startsWith('token-device-11'))).toBe(true);

    // Re-binding an existing token to usr-2 moves ownership cleanly without duplicating
    const rebound = upsertFcmDeviceTokenInState(state, {
      userId: 'usr-2',
      token: 'token-device-11-abcdef1234567890',
      platform: 'web',
    });
    expect(rebound.isNew).toBe(true);
    expect((state.fcmTokens || []).filter((t) => t.token === 'token-device-11-abcdef1234567890')).toHaveLength(1);
    expect((state.fcmTokens || []).find((t) => t.token === 'token-device-11-abcdef1234567890')?.userId).toBe('usr-2');
  });

  it('removes user tokens and prunes invalid tokens cleanly', () => {
    const state = createMinimalVault();
    upsertFcmDeviceTokenInState(state, {
      userId: 'usr-1',
      token: 'valid-token-usr1-00000000000001',
      platform: 'web',
    });
    upsertFcmDeviceTokenInState(state, {
      userId: 'usr-1',
      token: 'stale-token-usr1-00000000000002',
      platform: 'pwa',
    });
    upsertFcmDeviceTokenInState(state, {
      userId: 'usr-2',
      token: 'valid-token-usr2-00000000000003',
      platform: 'android',
    });

    const pruned = pruneInvalidFcmTokensInState(state, ['stale-token-usr1-00000000000002']);
    expect(pruned).toBe(1);
    expect(state.fcmTokens?.map((t) => t.token)).toEqual([
      'valid-token-usr2-00000000000003',
      'valid-token-usr1-00000000000001',
    ]);

    const removed = removeFcmDeviceTokenInState(state, 'usr-1', 'valid-token-usr1-00000000000001');
    expect(removed).toBe(1);
    expect(state.fcmTokens?.map((t) => t.userId)).toEqual(['usr-2']);
  });

  it('resolves deep-link dashboard URLs per notification type and recipient role', () => {
    expect(resolveNotificationTargetUrl('contribution_accepted', 'member')).toBe(
      '/dashboard?page=monthly-contribution'
    );
    expect(resolveNotificationTargetUrl('contribution_placed_manager', 'manager')).toBe(
      '/dashboard?page=manager-desk'
    );
    expect(
      resolveNotificationTargetUrl('loan_vote_requested', 'manager', 'Loan Ready to Initiate Vote')
    ).toBe('/dashboard?page=manager-desk');
    expect(resolveNotificationTargetUrl('loan_vote_requested', 'member', 'Vote now on Qard Hasan')).toBe(
      '/dashboard?page=ballot'
    );
    expect(resolveNotificationTargetUrl('community_mention', 'member')).toBe(
      '/dashboard?page=community'
    );
    expect(resolveNotificationTargetUrl('meeting_scheduled', 'member')).toBe(
      '/dashboard?page=notification'
    );
  });
});
