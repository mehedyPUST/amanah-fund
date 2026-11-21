import { describe, expect, it } from 'vitest';
import {
  areMobileOverviewConfigsEqual,
  DEFAULT_MOBILE_ADMIN_OVERVIEW_ICONS,
  DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS,
  MOBILE_MEMBER_TILE_CATALOG,
  resolveMemberMobileOverviewIcons,
  sanitizeMobileMemberOverviewIcons,
} from '../src/utils/mobileOverviewTiles.ts';

describe('mobileOverviewTiles sanitization & resolution', () => {
  it('filters unknown IDs, enforces uniqueness across sections, and strips manager-only icons unless permitted', () => {
    const cleanedMember = sanitizeMobileMemberOverviewIcons(
      {
        services: ['my-amanah', 'unknown-tile', 'quard-hasan', 'manager-desk', 'my-amanah'],
        more: ['quard-hasan', 'notification', 'member-registry', 'voting'],
      },
      { allowManagerTiles: false }
    );

    expect(cleanedMember).toEqual({
      services: ['my-amanah', 'quard-hasan'],
      more: ['notification', 'voting'],
    });

    const cleanedManager = sanitizeMobileMemberOverviewIcons(
      {
        services: ['manager-desk', 'quard-hasan'],
        more: ['member-registry', 'manager-desk'],
      },
      { allowManagerTiles: true }
    );

    expect(cleanedManager).toEqual({
      services: ['manager-desk', 'quard-hasan'],
      more: ['member-registry'],
    });
  });

  it('allows all extended action, sheet, and public portal icons for members and manager desk shortcuts for managers', () => {
    const nonManagerIds = MOBILE_MEMBER_TILE_CATALOG.filter((item) => !item.managerOnly).map(
      (item) => item.id
    );
    const managerIds = MOBILE_MEMBER_TILE_CATALOG.filter((item) => item.managerOnly).map(
      (item) => item.id
    );

    expect(nonManagerIds).toContain('request-loan');
    expect(nonManagerIds).toContain('monthly-pulse');
    expect(nonManagerIds).toContain('active-borrowers');
    expect(nonManagerIds).toContain('approval-queues');
    expect(nonManagerIds).toContain('how-it-works');
    expect(nonManagerIds).toContain('about');
    expect(nonManagerIds).toContain('faq');
    expect(nonManagerIds).toContain('public-website');
    expect(managerIds).toContain('manager-contributions');
    expect(managerIds).toContain('manager-loans');
    expect(managerIds).toContain('manager-installments');

    const memberAttemptWithAll = sanitizeMobileMemberOverviewIcons(
      {
        services: ['request-loan', 'monthly-pulse', 'manager-contributions'],
        more: ['how-it-works', 'about', 'faq', 'public-website', 'active-borrowers', 'approval-queues'],
      },
      { allowManagerTiles: false }
    );
    expect(memberAttemptWithAll).toEqual({
      services: ['request-loan', 'monthly-pulse'],
      more: ['how-it-works', 'about', 'faq', 'public-website', 'active-borrowers', 'approval-queues'],
    });

    const managerAttemptWithAll = sanitizeMobileMemberOverviewIcons(
      {
        services: ['manager-contributions', 'manager-loans'],
        more: ['manager-installments', 'request-loan'],
      },
      { allowManagerTiles: true }
    );
    expect(managerAttemptWithAll).toEqual({
      services: ['manager-contributions', 'manager-loans'],
      more: ['manager-installments', 'request-loan'],
    });
  });

  it('rejects non-object or malformed payloads cleanly', () => {
    expect(sanitizeMobileMemberOverviewIcons(null)).toBeNull();
    expect(sanitizeMobileMemberOverviewIcons([])).toBeNull();
    expect(sanitizeMobileMemberOverviewIcons({ services: 'voting', more: [] })).toBeNull();
  });

  it('resolves priority user > coop > default and auto-attaches manager tiles only until manager customizes personally', () => {
    const builtInMember = resolveMemberMobileOverviewIcons({
      userIcons: null,
      coopIcons: null,
      isManager: false,
    });
    expect(builtInMember).toEqual(DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS);

    const builtInManager = resolveMemberMobileOverviewIcons({
      userIcons: null,
      coopIcons: null,
      isManager: true,
    });
    expect(builtInManager.more).toContain('manager-desk');
    expect(builtInManager.more).toContain('member-registry');

    const coopOverride = resolveMemberMobileOverviewIcons({
      userIcons: null,
      coopIcons: {
        services: ['my-amanah', 'pay-monthly-contribution'],
        more: ['voting', 'notification'],
      },
      isManager: false,
    });
    expect(coopOverride).toEqual({
      services: ['my-amanah', 'pay-monthly-contribution'],
      more: ['voting', 'notification'],
    });

    const personalOverride = resolveMemberMobileOverviewIcons({
      userIcons: {
        services: ['voting'],
        more: ['my-profile'],
      },
      coopIcons: {
        services: ['my-amanah', 'pay-monthly-contribution'],
        more: ['voting', 'notification'],
      },
      isManager: true,
    });
    expect(personalOverride).toEqual({
      services: ['voting'],
      more: ['my-profile'],
    });
  });

  it('compares configurations accurately', () => {
    expect(
      areMobileOverviewConfigsEqual(
        DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS,
        {
          services: [...DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS.services],
          more: [...DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS.more],
        }
      )
    ).toBe(true);

    expect(
      areMobileOverviewConfigsEqual(DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS, {
        services: ['voting'],
        more: ['charter'],
      })
    ).toBe(false);
  });

  it('supports admin tile sanitization while filtering member-only and admin-only permissions accurately', () => {
    const cleanedForAdmin = sanitizeMobileMemberOverviewIcons(
      {
        services: ['site-settings', 'pay-monthly-contribution', 'manager-desk', 'quard-hasan'],
        more: ['site-activity', 'request-loan', 'my-amanah', 'manager-contributions'],
      },
      { allowManagerTiles: true, allowAdminTiles: true }
    );

    expect(cleanedForAdmin).toEqual({
      services: ['site-settings', 'manager-desk'],
      more: ['site-activity', 'manager-contributions'],
    });

    const cleanedForManager = sanitizeMobileMemberOverviewIcons(
      {
        services: ['site-settings', 'manager-desk', 'pay-monthly-contribution'],
        more: ['site-activity', 'manager-loans'],
      },
      { allowManagerTiles: true, allowAdminTiles: false }
    );

    expect(cleanedForManager).toEqual({
      services: ['manager-desk', 'pay-monthly-contribution'],
      more: ['manager-loans'],
    });
  });

  it('resolves admin defaults independently of member coop overrides and honors personal admin customizations', () => {
    const adminDefault = resolveMemberMobileOverviewIcons({
      userIcons: null,
      coopIcons: {
        services: ['pay-monthly-contribution', 'quard-hasan'],
        more: ['my-amanah'],
      },
      isManager: false,
      isAdmin: true,
    });
    expect(adminDefault).toEqual(DEFAULT_MOBILE_ADMIN_OVERVIEW_ICONS);

    const adminPersonal = resolveMemberMobileOverviewIcons({
      userIcons: {
        services: ['site-settings', 'member-registry', 'manager-desk'],
        more: ['site-activity', 'voting'],
      },
      coopIcons: null,
      isManager: false,
      isAdmin: true,
    });
    expect(adminPersonal).toEqual({
      services: ['site-settings', 'member-registry', 'manager-desk'],
      more: ['site-activity', 'voting'],
    });
  });
});
