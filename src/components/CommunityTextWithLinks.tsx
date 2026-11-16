'use client';

import { ExternalLink, FileText, Image as ImageIcon, Link2, Video } from 'lucide-react';
import type { CommunityPostLink, CommunityPostLinkKind } from '../types/coop.ts';
import {
  COMMUNITY_EMOJIS,
  getCommunityLinkHost,
  getCommunityLinkKindLabel,
  normalizeCommunityLinkUrl,
  parseTextWithLinks,
} from '../utils/communityLinks.ts';

function getLinkIcon(kind?: CommunityPostLinkKind) {
  switch (kind) {
    case 'photo':
      return ImageIcon;
    case 'video':
      return Video;
    case 'document':
      return FileText;
    default:
      return Link2;
  }
}

export function FormattedCommunityText({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const segments = parseTextWithLinks(text);
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, idx) =>
        seg.type === 'link' ? (
          <a
            key={`${idx}-${seg.value}`}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300 break-all"
          >
            {seg.value}
          </a>
        ) : (
          <span key={idx}>{seg.value}</span>
        )
      )}
    </p>
  );
}

export function CommunityPostLinksList({
  links,
  legacyImageUrl,
}: {
  links?: CommunityPostLink[];
  legacyImageUrl?: string;
}) {
  const combined: CommunityPostLink[] = [...(Array.isArray(links) ? links : [])];
  if (legacyImageUrl) {
    const parsedLegacy = normalizeCommunityLinkUrl(legacyImageUrl);
    if (
      parsedLegacy &&
      !combined.some((item) => item.url === parsedLegacy.toString())
    ) {
      combined.push({
        url: parsedLegacy.toString(),
        label: 'Shared Photo Link',
        kind: 'photo',
      });
    }
  }

  if (combined.length === 0) return null;

  return (
    <div className="space-y-2">
      {combined.map((item) => {
        const Icon = getLinkIcon(item.kind);
        const host = getCommunityLinkHost(item.url);
        const kindLabel = getCommunityLinkKindLabel(item.kind);
        return (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-emerald-300 dark:hover:border-emerald-700/70 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 px-3.5 py-2.5 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                  {item.label || host}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <span className="shrink-0">{kindLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate font-mono">{item.url}</span>
                </div>
              </div>
            </div>
            <ExternalLink
              className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          </a>
        );
      })}
    </div>
  );
}

export function CommunityEmojiPicker({
  onSelect,
  compact = false,
}: {
  onSelect: (emoji: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Insert emoji"
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-2.5 ${
        compact ? 'max-w-sm' : ''
      }`}
    >
      <div className="flex flex-wrap gap-1">
        {COMMUNITY_EMOJIS.map((item) => (
          <button
            key={item.emoji}
            type="button"
            title={item.label}
            aria-label={`Insert ${item.label} emoji`}
            onClick={() => onSelect(item.emoji)}
            className="w-8 h-8 rounded-lg text-base hover:bg-emerald-50 dark:hover:bg-emerald-950/50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {item.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
