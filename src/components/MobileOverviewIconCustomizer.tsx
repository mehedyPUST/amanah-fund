'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type {
  MobileMemberOverviewIconsConfig,
  MobileMemberTileId,
} from '../types/coop.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOBILE_MEMBER_TILE_CATALOG,
  type MobileMemberTileMeta,
} from '../utils/mobileOverviewTiles.ts';
import {
  AboutSecurityIcon,
  ActiveBorrowersIcon,
  ApprovalQueuesIcon,
  BalanceSheetIcon,
  CharterIcon,
  CommunityIcon,
  ContributionIcon,
  FaqIcon,
  HowItWorksIcon,
  ManagerContributionsIcon,
  ManagerCycleIcon,
  ManagerDeskIcon,
  ManagerInstallmentsIcon,
  ManagerLoansIcon,
  MemberRegistryIcon,
  MembersIcon,
  MonthlyPulseIcon,
  MyAmanahIcon,
  NotificationBellIcon,
  ProfileIcon,
  PublicWebsiteIcon,
  QardHasanIcon,
  RequestLoanIcon,
  SiteActivityIcon,
  SiteSettingsIcon,
  StatisticsIcon,
  TransactionHistoryIcon,
  VotingIcon,
  type TileIconComponent,
} from './MobileTileIcons.tsx';

export const MOBILE_MEMBER_TILE_ICONS: Record<MobileMemberTileId, TileIconComponent> = {
  'pay-monthly-contribution': ContributionIcon,
  'quard-hasan': QardHasanIcon,
  'request-loan': RequestLoanIcon,
  'my-amanah': MyAmanahIcon,
  members: MembersIcon,
  community: CommunityIcon,
  'balance-sheet': BalanceSheetIcon,
  'transaction-history': TransactionHistoryIcon,
  statistics: StatisticsIcon,
  'manager-cycle': ManagerCycleIcon,
  voting: VotingIcon,
  'monthly-pulse': MonthlyPulseIcon,
  'active-borrowers': ActiveBorrowersIcon,
  'approval-queues': ApprovalQueuesIcon,
  charter: CharterIcon,
  'how-it-works': HowItWorksIcon,
  about: AboutSecurityIcon,
  faq: FaqIcon,
  'public-website': PublicWebsiteIcon,
  notification: NotificationBellIcon,
  'my-profile': ProfileIcon,
  'manager-desk': ManagerDeskIcon,
  'member-registry': MemberRegistryIcon,
  'manager-contributions': ManagerContributionsIcon,
  'manager-loans': ManagerLoansIcon,
  'manager-installments': ManagerInstallmentsIcon,
  'site-settings': SiteSettingsIcon,
  'site-activity': SiteActivityIcon,
};

const PREVIEW_SURFACE_CLASS =
  'border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/90 ring-1 ring-inset ring-white/90 dark:ring-white/[0.04]';

type TilePlacement = 'services' | 'more' | 'hidden';

interface MobileOverviewIconEditorProps {
  value: MobileMemberOverviewIconsConfig;
  onChange: (next: MobileMemberOverviewIconsConfig) => void;
  allowManagerTiles?: boolean;
  allowAdminTiles?: boolean;
  onReset?: () => void;
  disableReset?: boolean;
  resetLabel?: string;
}

export function MobileOverviewIconEditor({
  value,
  onChange,
  allowManagerTiles = false,
  allowAdminTiles = false,
  onReset,
  disableReset = false,
  resetLabel,
}: MobileOverviewIconEditorProps) {
  const t = useTranslations('MobileIconEditor');
  const tNav = useTranslations('Navigation');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TilePlacement>('services');

  const availableCatalog = useMemo(
    () =>
      MOBILE_MEMBER_TILE_CATALOG.filter((item) => {
        if (allowAdminTiles) {
          return !item.memberOnly && (allowManagerTiles || !item.managerOnly);
        }
        if (item.adminOnly) return false;
        return allowManagerTiles ? true : !item.managerOnly;
      }),
    [allowManagerTiles, allowAdminTiles]
  );

  const catalogById = useMemo(
    () => new Map(availableCatalog.map((item) => [item.id, item])),
    [availableCatalog]
  );

  const getTileLabel = (meta: MobileMemberTileMeta): string => {
    if (allowAdminTiles) {
      if (meta.id === 'member-registry') return tNav('usersAndRoles');
      if (meta.id === 'manager-desk') return tNav('governanceDesk');
    }
    if (meta.navKey) return tNav(meta.navKey);
    if (meta.editorKey) return t(meta.editorKey);
    return meta.id;
  };

  const servicesIds = useMemo(
    () => value.services.filter((id) => catalogById.has(id)),
    [value.services, catalogById]
  );
  const moreIds = useMemo(
    () => value.more.filter((id) => catalogById.has(id) && !servicesIds.includes(id)),
    [value.more, catalogById, servicesIds]
  );
  const hiddenIds = useMemo(() => {
    const activeSet = new Set<MobileMemberTileId>([...servicesIds, ...moreIds]);
    return availableCatalog.map((item) => item.id).filter((id) => !activeSet.has(id));
  }, [availableCatalog, servicesIds, moreIds]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const matchesSearch = (id: MobileMemberTileId): boolean => {
    if (!isFiltering) return true;
    const meta = catalogById.get(id);
    if (!meta) return false;
    const label = getTileLabel(meta).toLowerCase();
    return label.includes(normalizedQuery) || id.toLowerCase().includes(normalizedQuery);
  };

  const searchMatches: Array<{ id: MobileMemberTileId; placement: TilePlacement }> = useMemo(() => {
    if (!isFiltering) return [];
    return [
      ...servicesIds.filter(matchesSearch).map((id) => ({ id, placement: 'services' as const })),
      ...moreIds.filter(matchesSearch).map((id) => ({ id, placement: 'more' as const })),
      ...hiddenIds.filter(matchesSearch).map((id) => ({ id, placement: 'hidden' as const })),
    ];
  }, [isFiltering, servicesIds, moreIds, hiddenIds, normalizedQuery]);

  const setPlacement = (id: MobileMemberTileId, target: TilePlacement) => {
    triggerHaptic('selection');
    const nextServices = servicesIds.filter((item) => item !== id);
    const nextMore = moreIds.filter((item) => item !== id);
    if (target === 'services') {
      nextServices.push(id);
    } else if (target === 'more') {
      nextMore.push(id);
    }
    onChange({
      services: nextServices,
      more: nextMore,
    });
  };

  const moveTile = (
    group: 'services' | 'more',
    id: MobileMemberTileId,
    direction: -1 | 1
  ) => {
    const list = group === 'services' ? [...servicesIds] : [...moreIds];
    const index = list.indexOf(id);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    triggerHaptic('selection');
    const [moved] = list.splice(index, 1);
    list.splice(nextIndex, 0, moved);
    onChange({
      services: group === 'services' ? list : servicesIds,
      more: group === 'more' ? list : moreIds,
    });
  };

  const previewTargetGroup: 'services' | 'more' =
    activeTab === 'more' ? 'more' : 'services';
  const previewIds = previewTargetGroup === 'more' ? moreIds : servicesIds;

  const renderSearchRow = (id: MobileMemberTileId, placement: TilePlacement) => {
    const meta = catalogById.get(id);
    if (!meta) return null;
    const Icon = MOBILE_MEMBER_TILE_ICONS[id];
    const label = getTileLabel(meta);

    return (
      <div
        key={id}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 bg-white/85 dark:bg-slate-950/60"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_6px_-3px_rgba(0,104,74,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_10px_-4px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
          >
            <Icon className={`w-[17px] h-[17px] ${meta.iconColorClass}`} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {label}
            </span>
            {meta.adminOnly && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-teal-700 dark:text-teal-300 shrink-0">
                · {t('adminOnlyTag')}
              </span>
            )}
            {meta.managerOnly && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
                · {t('managerOnlyTag')}
              </span>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label={label}
          className="inline-flex self-end sm:self-auto rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-slate-100/90 dark:bg-slate-800/85 p-0.5 shrink-0"
        >
          {(['services', 'more', 'hidden'] as const).map((option) => {
            const active = placement === option;
            const optionText =
              option === 'services'
                ? t('placeServices')
                : option === 'more'
                  ? t('placeMore')
                  : t('placeHide');
            return (
              <button
                key={option}
                type="button"
                onClick={() => setPlacement(id, option)}
                aria-pressed={active}
                className={`min-h-[30px] px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? option === 'hidden'
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs'
                      : 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {optionText}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderActiveGroupRow = (
    id: MobileMemberTileId,
    group: 'services' | 'more',
    index: number,
    groupLength: number
  ) => {
    const meta = catalogById.get(id);
    if (!meta) return null;
    const Icon = MOBILE_MEMBER_TILE_ICONS[id];
    const label = getTileLabel(meta);
    const otherGroup: 'services' | 'more' = group === 'services' ? 'more' : 'services';

    return (
      <div
        key={id}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-white/85 dark:bg-slate-950/60"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_6px_-3px_rgba(0,104,74,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_10px_-4px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
          >
            <Icon className={`w-[17px] h-[17px] ${meta.iconColorClass}`} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
              <span className="truncate">{label}</span>
              {meta.adminOnly && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-300 shrink-0">
                  · {t('adminOnlyTag')}
                </span>
              )}
              {meta.managerOnly && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
                  · {t('managerOnlyTag')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {groupLength > 1 && (
            <>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveTile(group, id, -1)}
                aria-label={t('moveUp', { label })}
                title={t('moveUp', { label })}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={index === groupLength - 1}
                onClick={() => moveTile(group, id, 1)}
                aria-label={t('moveDown', { label })}
                title={t('moveDown', { label })}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setPlacement(id, otherGroup)}
            aria-label={
              group === 'services'
                ? t('moveToMore', { label })
                : t('moveToServices', { label })
            }
            title={
              group === 'services'
                ? t('moveToMore', { label })
                : t('moveToServices', { label })
            }
            className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:border-emerald-700 dark:hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            <ArrowDownUp className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{otherGroup === 'services' ? t('placeServices') : t('placeMore')}</span>
          </button>

          <button
            type="button"
            onClick={() => setPlacement(id, 'hidden')}
            aria-label={t('hideTile', { label })}
            title={t('hideTile', { label })}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/30 flex items-center justify-center cursor-pointer transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  const renderAvailableRow = (id: MobileMemberTileId) => {
    const meta = catalogById.get(id);
    if (!meta) return null;
    const Icon = MOBILE_MEMBER_TILE_ICONS[id];
    const label = getTileLabel(meta);

    return (
      <div
        key={id}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-white/85 dark:bg-slate-950/60"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_6px_-3px_rgba(0,104,74,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_10px_-4px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
          >
            <Icon className={`w-[17px] h-[17px] ${meta.iconColorClass}`} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
              <span className="truncate">{label}</span>
              {meta.adminOnly && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-300 shrink-0">
                  · {t('adminOnlyTag')}
                </span>
              )}
              {meta.managerOnly && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
                  · {t('managerOnlyTag')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPlacement(id, 'services')}
            className="h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            <span>{t('placeServices')}</span>
          </button>
          <button
            type="button"
            onClick={() => setPlacement(id, 'more')}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            <span>{t('placeMore')}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3.5">
      {/* Top hint + Reset button */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          {t('tapToSwitchHint')}
        </span>
        {onReset && (
          <button
            type="button"
            disabled={disableReset}
            onClick={onReset}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{resetLabel || t('resetBtn')}</span>
          </button>
        )}
      </div>

      {/* Live 4-Column Mini Preview */}
      {!isFiltering && (
        <div className="rounded-2xl border border-slate-200/85 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/50 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {t('livePreview')} ·{' '}
              <span className="text-emerald-700 dark:text-emerald-400">
                {previewTargetGroup === 'more' ? t('placeMore') : t('placeServices')}
              </span>
            </span>
            <span className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
              {previewIds.length}
            </span>
          </div>

          {previewIds.length === 0 ? (
            <div className="py-3 text-center text-[11px] text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              {previewTargetGroup === 'more' ? t('emptyMore') : t('emptyServices')}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {previewIds.map((id) => {
                const meta = catalogById.get(id);
                if (!meta) return null;
                const Icon = MOBILE_MEMBER_TILE_ICONS[id];
                const label = getTileLabel(meta);
                return (
                  <div
                    key={id}
                    className={`aspect-[5/6] rounded-[10px] border px-1 py-1.5 flex flex-col items-center justify-center gap-1.5 text-center shadow-[0_2px_8px_-5px_rgba(15,23,42,0.1)] dark:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.45)] ${PREVIEW_SURFACE_CLASS}`}
                  >
                    <span
                      className={`w-8 h-8 rounded-[10px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_6px_-3px_rgba(0,104,74,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_8px_-4px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
                    >
                      <Icon
                        className={`w-[17px] h-[17px] shrink-0 ${meta.iconColorClass}`}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-[9.5px] font-medium text-slate-700 dark:text-slate-200 leading-tight line-clamp-1 w-full">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search
          className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          className="w-full min-h-[40px] pl-9 pr-9 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/75 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label={t('placeHide')}
            className="min-w-[32px] min-h-[32px] rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {isFiltering ? (
        searchMatches.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
            {t('noSearchMatches', { query: searchQuery.trim() })}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
            {searchMatches.map((item) => renderSearchRow(item.id, item.placement))}
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {/* 3-Tab Switcher: Services | More | Available */}
          <div
            role="tablist"
            aria-label={t('searchAria')}
            className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700/80"
          >
            {(
              [
                { key: 'services' as const, label: t('placeServices'), count: servicesIds.length },
                { key: 'more' as const, label: t('placeMore'), count: moreIds.length },
                { key: 'hidden' as const, label: t('tabAvailable'), count: hiddenIds.length },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    triggerHaptic('selection');
                    setActiveTab(tab.key);
                  }}
                  className={`relative min-h-[36px] px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    selected
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="customizer-tab-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 truncate">{tab.label}</span>
                  <span
                    className={`relative z-10 font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                      selected
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
          {activeTab === 'services' && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                {t('sectionServicesHint')}
              </p>
              {servicesIds.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center space-y-2">
                  <div>{t('emptyServices')}</div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('hidden')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    {t('tabAvailable')}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
                  {servicesIds.map((id, idx) =>
                    renderActiveGroupRow(id, 'services', idx, servicesIds.length)
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'more' && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                {t('sectionMoreHint')}
              </p>
              {moreIds.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center space-y-2">
                  <div>{t('emptyMore')}</div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('hidden')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    {t('tabAvailable')}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
                  {moreIds.map((id, idx) =>
                    renderActiveGroupRow(id, 'more', idx, moreIds.length)
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'hidden' && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                {t('sectionHiddenHint')}
              </p>
              {hiddenIds.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
                  {t('emptyHidden')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
                  {hiddenIds.map((id) => renderAvailableRow(id))}
                </div>
              )}
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
