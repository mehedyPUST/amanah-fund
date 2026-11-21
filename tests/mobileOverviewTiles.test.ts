import { describe, expect, it } from 'vitest';
import {
  areMobileOverviewConfigsEqual,
  DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS,
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
});
