import type {
  MobileMemberOverviewIconsConfig,
  MobileMemberTileId,
} from '../types/coop.ts';

export type MobileMemberTileNavKey =
  | 'contributions'
  | 'qardHasan'
  | 'requestLoan'
  | 'myAmanah'
  | 'members'
  | 'community'
  | 'balanceSheet'
  | 'transactions'
  | 'statistics'
  | 'managerCycle'
  | 'voting'
  | 'charter'
  | 'howItWorks'
  | 'about'
  | 'faq'
  | 'publicWebsite'
  | 'notifications'
  | 'profile'
  | 'managerDesk'
  | 'memberRegistry'
  | 'siteSettings'
  | 'siteActivity';

export type MobileMemberTileEditorKey =
  | 'tiles.monthlyPulse'
  | 'tiles.activeBorrowers'
  | 'tiles.approvalQueues'
  | 'tiles.managerContributions'
  | 'tiles.managerLoans'
  | 'tiles.managerInstallments';

export interface MobileMemberTileMeta {
  id: MobileMemberTileId;
  navKey?: MobileMemberTileNavKey;
  editorKey?: MobileMemberTileEditorKey;
  managerOnly?: boolean;
  adminOnly?: boolean;
  memberOnly?: boolean;
  iconBgClass: string;
  iconColorClass: string;
}

const MEDALLION_EMERALD_BG =
  'bg-gradient-to-b from-emerald-50 to-emerald-100/85 dark:from-emerald-950/90 dark:to-emerald-900/50 border-emerald-200/90 dark:border-emerald-700/45';
const MEDALLION_EMERALD_ICON = 'text-emerald-700 dark:text-emerald-300';

const MEDALLION_TEAL_BG =
  'bg-gradient-to-b from-teal-50 to-emerald-100/75 dark:from-teal-950/90 dark:to-teal-900/50 border-teal-200/90 dark:border-teal-700/45';
const MEDALLION_TEAL_ICON = 'text-teal-700 dark:text-teal-300';

const MEDALLION_GOLD_BG =
  'bg-gradient-to-b from-amber-50 to-amber-100/85 dark:from-amber-950/85 dark:to-amber-900/45 border-amber-200/90 dark:border-amber-700/40';
const MEDALLION_GOLD_ICON = 'text-amber-700 dark:text-amber-300';

const MEDALLION_SAPPHIRE_BG =
  'bg-gradient-to-b from-indigo-50/95 to-indigo-100/75 dark:from-indigo-950/85 dark:to-slate-900/90 border-indigo-200/85 dark:border-indigo-700/45';
const MEDALLION_SAPPHIRE_ICON = 'text-indigo-700 dark:text-indigo-300';

const MEDALLION_SLATE_BG =
  'bg-gradient-to-b from-slate-50 to-slate-100/95 dark:from-slate-800/95 dark:to-slate-900/95 border-slate-200/95 dark:border-slate-700/60';
const MEDALLION_SLATE_ICON = 'text-slate-700 dark:text-slate-200';

const MEDALLION_CRIMSON_BG =
  'bg-gradient-to-b from-rose-50 to-rose-100/80 dark:from-rose-950/85 dark:to-rose-900/45 border-rose-200/90 dark:border-rose-700/40';
const MEDALLION_CRIMSON_ICON = 'text-rose-700 dark:text-rose-300';

export const MOBILE_MEMBER_TILE_CATALOG: readonly MobileMemberTileMeta[] = [
  {
    id: 'pay-monthly-contribution',
    navKey: 'contributions',
    memberOnly: true,
    iconBgClass: MEDALLION_EMERALD_BG,
    iconColorClass: MEDALLION_EMERALD_ICON,
  },
  {
    id: 'quard-hasan',
    navKey: 'qardHasan',
    memberOnly: true,
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'request-loan',
    navKey: 'requestLoan',
    memberOnly: true,
    iconBgClass: MEDALLION_EMERALD_BG,
    iconColorClass: MEDALLION_EMERALD_ICON,
  },
  {
    id: 'my-amanah',
    navKey: 'myAmanah',
    memberOnly: true,
    iconBgClass: MEDALLION_TEAL_BG,
    iconColorClass: MEDALLION_TEAL_ICON,
  },
  {
    id: 'members',
    navKey: 'members',
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'community',
    navKey: 'community',
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'balance-sheet',
    navKey: 'balanceSheet',
    iconBgClass: MEDALLION_TEAL_BG,
    iconColorClass: MEDALLION_TEAL_ICON,
  },
  {
    id: 'transaction-history',
    navKey: 'transactions',
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'statistics',
    navKey: 'statistics',
    iconBgClass: MEDALLION_EMERALD_BG,
    iconColorClass: MEDALLION_EMERALD_ICON,
  },
  {
    id: 'manager-cycle',
    navKey: 'managerCycle',
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'voting',
    navKey: 'voting',
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'monthly-pulse',
    editorKey: 'tiles.monthlyPulse',
    iconBgClass: MEDALLION_TEAL_BG,
    iconColorClass: MEDALLION_TEAL_ICON,
  },
  {
    id: 'active-borrowers',
    editorKey: 'tiles.activeBorrowers',
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'approval-queues',
    editorKey: 'tiles.approvalQueues',
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'charter',
    navKey: 'charter',
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'how-it-works',
    navKey: 'howItWorks',
    iconBgClass: MEDALLION_TEAL_BG,
    iconColorClass: MEDALLION_TEAL_ICON,
  },
  {
    id: 'about',
    navKey: 'about',
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'faq',
    navKey: 'faq',
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'public-website',
    navKey: 'publicWebsite',
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'notification',
    navKey: 'notifications',
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'my-profile',
    navKey: 'profile',
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'manager-desk',
    navKey: 'managerDesk',
    managerOnly: true,
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'member-registry',
    navKey: 'memberRegistry',
    managerOnly: true,
    iconBgClass: MEDALLION_SAPPHIRE_BG,
    iconColorClass: MEDALLION_SAPPHIRE_ICON,
  },
  {
    id: 'manager-contributions',
    editorKey: 'tiles.managerContributions',
    managerOnly: true,
    iconBgClass: MEDALLION_EMERALD_BG,
    iconColorClass: MEDALLION_EMERALD_ICON,
  },
  {
    id: 'manager-loans',
    editorKey: 'tiles.managerLoans',
    managerOnly: true,
    iconBgClass: MEDALLION_GOLD_BG,
    iconColorClass: MEDALLION_GOLD_ICON,
  },
  {
    id: 'manager-installments',
    editorKey: 'tiles.managerInstallments',
    managerOnly: true,
    iconBgClass: MEDALLION_CRIMSON_BG,
    iconColorClass: MEDALLION_CRIMSON_ICON,
  },
  {
    id: 'site-settings',
    navKey: 'siteSettings',
    adminOnly: true,
    iconBgClass: MEDALLION_SLATE_BG,
    iconColorClass: MEDALLION_SLATE_ICON,
  },
  {
    id: 'site-activity',
    navKey: 'siteActivity',
    adminOnly: true,
    iconBgClass: MEDALLION_TEAL_BG,
    iconColorClass: MEDALLION_TEAL_ICON,
  },
] as const;

export const MOBILE_MEMBER_TILE_MAP: Record<MobileMemberTileId, MobileMemberTileMeta> =
  Object.fromEntries(
    MOBILE_MEMBER_TILE_CATALOG.map((item) => [item.id, item])
  ) as Record<MobileMemberTileId, MobileMemberTileMeta>;

const ALL_VALID_IDS = new Set<MobileMemberTileId>(
  MOBILE_MEMBER_TILE_CATALOG.map((item) => item.id)
);

const NON_MANAGER_VALID_IDS = new Set<MobileMemberTileId>(
  MOBILE_MEMBER_TILE_CATALOG.filter((item) => !item.managerOnly && !item.adminOnly).map(
    (item) => item.id
  )
);

const MANAGER_VALID_IDS = new Set<MobileMemberTileId>(
  MOBILE_MEMBER_TILE_CATALOG.filter((item) => !item.adminOnly).map((item) => item.id)
);

const ADMIN_VALID_IDS = new Set<MobileMemberTileId>(
  MOBILE_MEMBER_TILE_CATALOG.filter((item) => !item.memberOnly).map((item) => item.id)
);

export const DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS: MobileMemberOverviewIconsConfig = {
  services: [
    'pay-monthly-contribution',
    'quard-hasan',
    'members',
    'community',
    'balance-sheet',
    'transaction-history',
  ],
  more: ['statistics', 'manager-cycle', 'voting', 'charter'],
};

export const DEFAULT_MOBILE_ADMIN_OVERVIEW_ICONS: MobileMemberOverviewIconsConfig = {
  services: [
    'member-registry',
    'manager-desk',
    'site-settings',
    'community',
    'members',
    'voting',
  ],
  more: [
    'transaction-history',
    'statistics',
    'balance-sheet',
    'manager-cycle',
    'charter',
    'notification',
    'site-activity',
    'my-profile',
  ],
};

const MANAGER_EXTRA_TILES: readonly MobileMemberTileId[] = [
  'manager-desk',
  'member-registry',
];

export function sanitizeMobileMemberOverviewIcons(
  raw: unknown,
  options?: { allowManagerTiles?: boolean; allowAdminTiles?: boolean }
): MobileMemberOverviewIconsConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as { services?: unknown; more?: unknown };
  if (!Array.isArray(obj.services) || !Array.isArray(obj.more)) {
    return null;
  }

  const allowed = options?.allowAdminTiles
    ? ADMIN_VALID_IDS
    : options?.allowManagerTiles
      ? MANAGER_VALID_IDS
      : NON_MANAGER_VALID_IDS;

  const seen = new Set<MobileMemberTileId>();

  const pickValid = (arr: unknown[]): MobileMemberTileId[] => {
    const out: MobileMemberTileId[] = [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const id = item.trim() as MobileMemberTileId;
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };

  return {
    services: pickValid(obj.services),
    more: pickValid(obj.more),
  };
}

export function resolveMemberMobileOverviewIcons(params: {
  userIcons?: MobileMemberOverviewIconsConfig | null;
  coopIcons?: MobileMemberOverviewIconsConfig | null;
  isManager: boolean;
  isAdmin?: boolean;
}): MobileMemberOverviewIconsConfig {
  const { userIcons, coopIcons, isManager, isAdmin = false } = params;

  if (isAdmin) {
    const sanitizedAdmin = userIcons
      ? sanitizeMobileMemberOverviewIcons(userIcons, {
          allowManagerTiles: true,
          allowAdminTiles: true,
        })
      : null;
    const base = sanitizedAdmin ?? DEFAULT_MOBILE_ADMIN_OVERVIEW_ICONS;
    return {
      services: [...base.services],
      more: [...base.more],
    };
  }

  const sanitizedUser = userIcons
    ? sanitizeMobileMemberOverviewIcons(userIcons, { allowManagerTiles: isManager })
    : null;
  const sanitizedCoop = coopIcons
    ? sanitizeMobileMemberOverviewIcons(coopIcons, { allowManagerTiles: false })
    : null;

  const base = sanitizedUser ?? sanitizedCoop ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS;
  const services = [...base.services];
  const more = [...base.more];

  // For managers who haven't customized their personal layout yet, ensure
  // manager tools are included in More so nothing disappears when coop defaults change.
  if (isManager && !sanitizedUser) {
    const present = new Set<MobileMemberTileId>([...services, ...more]);
    for (const mgrId of MANAGER_EXTRA_TILES) {
      if (!present.has(mgrId)) {
        more.push(mgrId);
      }
    }
  }

  return { services, more };
}

function sanitizeAnyValidMobileIcons(
  raw: unknown
): MobileMemberOverviewIconsConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as { services?: unknown; more?: unknown };
  if (!Array.isArray(obj.services) || !Array.isArray(obj.more)) {
    return null;
  }
  const seen = new Set<MobileMemberTileId>();
  const pickValid = (arr: unknown[]): MobileMemberTileId[] => {
    const out: MobileMemberTileId[] = [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const id = item.trim() as MobileMemberTileId;
      if (!ALL_VALID_IDS.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  return {
    services: pickValid(obj.services),
    more: pickValid(obj.more),
  };
}

export function areMobileOverviewConfigsEqual(
  a?: MobileMemberOverviewIconsConfig | null,
  b?: MobileMemberOverviewIconsConfig | null
): boolean {
  const normA = sanitizeAnyValidMobileIcons(a) ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS;
  const normB = sanitizeAnyValidMobileIcons(b) ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS;

  if (normA.services.length !== normB.services.length) return false;
  if (normA.more.length !== normB.more.length) return false;

  for (let i = 0; i < normA.services.length; i += 1) {
    if (normA.services[i] !== normB.services[i]) return false;
  }
  for (let i = 0; i < normA.more.length; i += 1) {
    if (normA.more[i] !== normB.more[i]) return false;
  }
  return true;
}
