'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Compass,
  CreditCard,
  FileCheck,
  FileSpreadsheet,
  Globe,
  HandCoins,
  HelpCircle,
  History,
  Info,
  Landmark,
  ListChecks,
  MessageSquare,
  PlusCircle,
  RotateCcw,
  ScrollText,
  Search,
  User,
  UserCheck,
  Users,
  Vote,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  MobileMemberOverviewIconsConfig,
  MobileMemberTileId,
} from '../types/coop.ts';
import {
  MOBILE_MEMBER_TILE_CATALOG,
  type MobileMemberTileMeta,
} from '../utils/mobileOverviewTiles.ts';

export const MOBILE_MEMBER_TILE_ICONS: Record<MobileMemberTileId, typeof CreditCard> = {
  'pay-monthly-contribution': CreditCard,
  'quard-hasan': HandCoins,
  'request-loan': PlusCircle,
  'my-amanah': Wallet,
  members: Users,
  community: MessageSquare,
  'balance-sheet': FileSpreadsheet,
  'transaction-history': History,
  statistics: BarChart3,
  'manager-cycle': CalendarClock,
  voting: Vote,
  'monthly-pulse': CalendarCheck,
  'active-borrowers': Landmark,
  'approval-queues': ListChecks,
  charter: ScrollText,
  'how-it-works': Compass,
  about: Info,
  faq: HelpCircle,
  'public-website': Globe,
  notification: Bell,
  'my-profile': User,
  'manager-desk': ClipboardCheck,
  'member-registry': UserCheck,
  'manager-contributions': FileCheck,
  'manager-loans': ClipboardList,
  'manager-installments': CalendarCheck,
};

type TilePlacement = 'services' | 'more' | 'hidden';

interface MobileOverviewIconEditorProps {
  value: MobileMemberOverviewIconsConfig;
  onChange: (next: MobileMemberOverviewIconsConfig) => void;
  allowManagerTiles?: boolean;
  onReset?: () => void;
  disableReset?: boolean;
  resetLabel?: string;
}

export function MobileOverviewIconEditor({
  value,
  onChange,
  allowManagerTiles = false,
  onReset,
  disableReset = false,
  resetLabel,
}: MobileOverviewIconEditorProps) {
  const t = useTranslations('MobileIconEditor');
  const tNav = useTranslations('Navigation');
  const [searchQuery, setSearchQuery] = useState('');

  const availableCatalog = useMemo(
    () =>
      MOBILE_MEMBER_TILE_CATALOG.filter((item) =>
        allowManagerTiles ? true : !item.managerOnly
      ),
    [allowManagerTiles]
  );

  const catalogById = useMemo(
    () => new Map(availableCatalog.map((item) => [item.id, item])),
    [availableCatalog]
  );

  const getTileLabel = (meta: MobileMemberTileMeta): string => {
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

  const visibleServicesIds = isFiltering ? servicesIds.filter(matchesSearch) : servicesIds;
  const visibleMoreIds = isFiltering ? moreIds.filter(matchesSearch) : moreIds;
  const visibleHiddenIds = isFiltering ? hiddenIds.filter(matchesSearch) : hiddenIds;
  const totalVisibleMatches =
    visibleServicesIds.length + visibleMoreIds.length + visibleHiddenIds.length;

  const setPlacement = (id: MobileMemberTileId, target: TilePlacement) => {
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
    const [moved] = list.splice(index, 1);
    list.splice(nextIndex, 0, moved);
    onChange({
      services: group === 'services' ? list : servicesIds,
      more: group === 'more' ? list : moreIds,
    });
  };

  const renderTileRow = (
    id: MobileMemberTileId,
    placement: TilePlacement,
    index: number,
    groupLength: number
  ) => {
    const meta = catalogById.get(id);
    if (!meta) return null;
    const Icon = MOBILE_MEMBER_TILE_ICONS[id];
    const label = getTileLabel(meta);

    return (
      <div
        key={id}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 py-2.5 bg-white/80 dark:bg-slate-950/60"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
          >
            <Icon className={`w-4 h-4 ${meta.iconColorClass}`} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
              <span className="truncate">{label}</span>
              {meta.managerOnly && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
                  · {t('managerOnlyTag')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {placement !== 'hidden' && !isFiltering && groupLength > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveTile(placement, id, -1)}
                aria-label={t('moveUp', { label })}
                className="min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={index === groupLength - 1}
                onClick={() => moveTile(placement, id, 1)}
                aria-label={t('moveDown', { label })}
                className="min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <div
            role="group"
            aria-label={label}
            className="inline-flex rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-slate-100/90 dark:bg-slate-800/85 p-0.5"
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
                  className={`min-h-[32px] px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
          {t('summaryCounts', {
            services: servicesIds.length,
            more: moreIds.length,
            hidden: hiddenIds.length,
          })}
        </span>
        {onReset && (
          <button
            type="button"
            disabled={disableReset}
            onClick={onReset}
            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{resetLabel || t('resetBtn')}</span>
          </button>
        )}
      </div>

      {/* Quick search filter across all available icons */}
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

      {isFiltering && totalVisibleMatches === 0 && (
        <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
          {t('noSearchMatches', { query: searchQuery.trim() })}
        </div>
      )}

      {/* Group 1: Services */}
      {(!isFiltering || visibleServicesIds.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('sectionServices')}
            </h4>
            <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {visibleServicesIds.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('sectionServicesHint')}
          </p>
          {visibleServicesIds.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 text-center">
              {t('emptyServices')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
              {visibleServicesIds.map((id, idx) =>
                renderTileRow(id, 'services', idx, visibleServicesIds.length)
              )}
            </div>
          )}
        </div>
      )}

      {/* Group 2: More */}
      {(!isFiltering || visibleMoreIds.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('sectionMore')}
            </h4>
            <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {visibleMoreIds.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('sectionMoreHint')}
          </p>
          {visibleMoreIds.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 text-center">
              {t('emptyMore')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
              {visibleMoreIds.map((id, idx) =>
                renderTileRow(id, 'more', idx, visibleMoreIds.length)
              )}
            </div>
          )}
        </div>
      )}

      {/* Group 3: Hidden */}
      {(!isFiltering || visibleHiddenIds.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('sectionHidden')}
            </h4>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {visibleHiddenIds.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('sectionHiddenHint')}
          </p>
          {visibleHiddenIds.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 text-center">
              {t('emptyHidden')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/85 dark:border-slate-800 overflow-hidden">
              {visibleHiddenIds.map((id, idx) =>
                renderTileRow(id, 'hidden', idx, visibleHiddenIds.length)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
