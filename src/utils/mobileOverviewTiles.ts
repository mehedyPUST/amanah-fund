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

export const MOBILE_MEMBER_TILE_CATALOG: readonly MobileMemberTileMeta[] = [
  {
    id: 'pay-monthly-contribution',
    navKey: 'contributions',
    memberOnly: true,
    iconBgClass:
      'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
    iconColorClass: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    id: 'quard-hasan',
    navKey: 'qardHasan',
    memberOnly: true,
    iconBgClass:
      'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
    iconColorClass: 'text-amber-600 dark:text-amber-300',
  },
  {
    id: 'request-loan',
    navKey: 'requestLoan',
    memberOnly: true,
    iconBgClass:
      'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
    iconColorClass: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'my-amanah',
    navKey: 'myAmanah',
    memberOnly: true,
    iconBgClass:
      'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
    iconColorClass: 'text-teal-700 dark:text-teal-300',
  },
  {
    id: 'members',
    navKey: 'members',
    iconBgClass:
      'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
    iconColorClass: 'text-sky-600 dark:text-sky-300',
  },
  {
    id: 'community',
    navKey: 'community',
    iconBgClass:
      'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
    iconColorClass: 'text-indigo-600 dark:text-indigo-300',
  },
  {
    id: 'balance-sheet',
    navKey: 'balanceSheet',
    iconBgClass:
      'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
    iconColorClass: 'text-teal-600 dark:text-teal-300',
  },
  {
    id: 'transaction-history',
    navKey: 'transactions',
    iconBgClass:
      'bg-cyan-100/90 dark:bg-cyan-500/20 border-cyan-300/85 dark:border-cyan-400/45',
    iconColorClass: 'text-cyan-700 dark:text-cyan-300',
  },
  {
    id: 'statistics',
    navKey: 'statistics',
    iconBgClass:
      'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
    iconColorClass: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    id: 'manager-cycle',
    navKey: 'managerCycle',
    iconBgClass:
      'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
    iconColorClass: 'text-violet-600 dark:text-violet-300',
  },
  {
    id: 'voting',
    navKey: 'voting',
    iconBgClass:
      'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
    iconColorClass: 'text-amber-600 dark:text-amber-300',
  },
  {
    id: 'monthly-pulse',
    editorKey: 'tiles.monthlyPulse',
    iconBgClass:
      'bg-teal-100/90 dark:bg-teal-500/20 border-teal-300/85 dark:border-teal-400/45',
    iconColorClass: 'text-teal-700 dark:text-teal-300',
  },
  {
    id: 'active-borrowers',
    editorKey: 'tiles.activeBorrowers',
    iconBgClass:
      'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
    iconColorClass: 'text-amber-700 dark:text-amber-300',
  },
  {
    id: 'approval-queues',
    editorKey: 'tiles.approvalQueues',
    iconBgClass:
      'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
    iconColorClass: 'text-violet-700 dark:text-violet-300',
  },
  {
    id: 'charter',
    navKey: 'charter',
    iconBgClass:
      'bg-rose-100/90 dark:bg-rose-500/20 border-rose-300/85 dark:border-rose-400/45',
    iconColorClass: 'text-rose-600 dark:text-rose-300',
  },
  {
    id: 'how-it-works',
    navKey: 'howItWorks',
    iconBgClass:
      'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
    iconColorClass: 'text-sky-700 dark:text-sky-300',
  },
  {
    id: 'about',
    navKey: 'about',
    iconBgClass:
      'bg-slate-100/90 dark:bg-slate-500/20 border-slate-300/85 dark:border-slate-400/45',
    iconColorClass: 'text-slate-700 dark:text-slate-300',
  },
  {
    id: 'faq',
    navKey: 'faq',
    iconBgClass:
      'bg-cyan-100/90 dark:bg-cyan-500/20 border-cyan-300/85 dark:border-cyan-400/45',
    iconColorClass: 'text-cyan-700 dark:text-cyan-300',
  },
  {
    id: 'public-website',
    navKey: 'publicWebsite',
    iconBgClass:
      'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
    iconColorClass: 'text-indigo-700 dark:text-indigo-300',
  },
  {
    id: 'notification',
    navKey: 'notifications',
    iconBgClass:
      'bg-orange-100/90 dark:bg-orange-500/20 border-orange-300/85 dark:border-orange-400/45',
    iconColorClass: 'text-orange-600 dark:text-orange-300',
  },
  {
    id: 'my-profile',
    navKey: 'profile',
    iconBgClass:
      'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
    iconColorClass: 'text-indigo-600 dark:text-indigo-300',
  },
  {
    id: 'manager-desk',
    navKey: 'managerDesk',
    managerOnly: true,
    iconBgClass:
      'bg-orange-100/90 dark:bg-orange-500/20 border-orange-300/85 dark:border-orange-400/45',
    iconColorClass: 'text-orange-600 dark:text-orange-300',
  },
  {
    id: 'member-registry',
    navKey: 'memberRegistry',
    managerOnly: true,
    iconBgClass:
      'bg-sky-100/90 dark:bg-sky-500/20 border-sky-300/85 dark:border-sky-400/45',
    iconColorClass: 'text-sky-600 dark:text-sky-300',
  },
  {
    id: 'manager-contributions',
    editorKey: 'tiles.managerContributions',
    managerOnly: true,
    iconBgClass:
      'bg-emerald-100/90 dark:bg-emerald-500/20 border-emerald-300/85 dark:border-emerald-400/45',
    iconColorClass: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'manager-loans',
    editorKey: 'tiles.managerLoans',
    managerOnly: true,
    iconBgClass:
      'bg-amber-100/90 dark:bg-amber-500/20 border-amber-300/85 dark:border-amber-400/45',
    iconColorClass: 'text-amber-700 dark:text-amber-300',
  },
  {
    id: 'manager-installments',
    editorKey: 'tiles.managerInstallments',
    managerOnly: true,
    iconBgClass:
      'bg-rose-100/90 dark:bg-rose-500/20 border-rose-300/85 dark:border-rose-400/45',
    iconColorClass: 'text-rose-700 dark:text-rose-300',
  },
  {
    id: 'site-settings',
    navKey: 'siteSettings',
    adminOnly: true,
    iconBgClass:
      'bg-indigo-100/90 dark:bg-indigo-500/20 border-indigo-300/85 dark:border-indigo-400/45',
    iconColorClass: 'text-indigo-600 dark:text-indigo-300',
  },
  {
    id: 'site-activity',
    navKey: 'siteActivity',
    adminOnly: true,
    iconBgClass:
      'bg-violet-100/90 dark:bg-violet-500/20 border-violet-300/85 dark:border-violet-400/45',
    iconColorClass: 'text-violet-600 dark:text-violet-300',
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
