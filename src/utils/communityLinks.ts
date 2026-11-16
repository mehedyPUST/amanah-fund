import type { CommunityPostLink, CommunityPostLinkKind } from '../types/coop.ts';

export const MAX_COMMUNITY_POST_LINKS = 5;

export const COMMUNITY_EMOJIS: Array<{ emoji: string; label: string }> = [
  { emoji: '🤝', label: 'Handshake' },
  { emoji: '🤲', label: 'Dua' },
  { emoji: '🕌', label: 'Mosque' },
  { emoji: '🌙', label: 'Crescent' },
  { emoji: '💚', label: 'Green heart' },
  { emoji: '🙏', label: 'Thankful' },
  { emoji: '✨', label: 'Sparkles' },
  { emoji: '🎉', label: 'Celebration' },
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😊', label: 'Smile' },
  { emoji: '🙌', label: 'Raising hands' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '✅', label: 'Approved' },
  { emoji: '💯', label: '100 percent' },
  { emoji: '📢', label: 'Announcement' },
  { emoji: '📌', label: 'Pin' },
  { emoji: '📅', label: 'Calendar' },
  { emoji: '💼', label: 'Business' },
  { emoji: '📊', label: 'Chart' },
  { emoji: '🌱', label: 'Growth' },
  { emoji: '📝', label: 'Note' },
  { emoji: '🔗', label: 'Link' },
  { emoji: '📷', label: 'Photo link' },
  { emoji: '🎬', label: 'Video link' },
  { emoji: '📄', label: 'Document link' },
  { emoji: '🏠', label: 'Home' },
];

const VALID_LINK_KINDS = new Set<CommunityPostLinkKind>([
  'link',
  'photo',
  'video',
  'document',
]);

export function inferCommunityLinkKind(parsedUrl: URL): CommunityPostLinkKind {
  const host = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  if (
    host === 'youtu.be' ||
    host.endsWith('youtube.com') ||
    host.endsWith('vimeo.com') ||
    host.endsWith('loom.com') ||
    host.endsWith('streamable.com') ||
    host.endsWith('dailymotion.com') ||
    /\.(mp4|webm|mov|m4v|avi)$/i.test(pathname)
  ) {
    return 'video';
  }

  if (
    host.includes('ik.imagekit.io') ||
    host.includes('ibb.co') ||
    host.includes('imgur.com') ||
    host.includes('flickr.com') ||
    host.includes('photos.google.com') ||
    host.includes('photos.app.goo.gl') ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(pathname)
  ) {
    return 'photo';
  }

  if (
    host.endsWith('docs.google.com') ||
    host.endsWith('drive.google.com') ||
    host.endsWith('dropbox.com') ||
    host.endsWith('onedrive.live.com') ||
    /\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i.test(pathname)
  ) {
    return 'document';
  }

  return 'link';
}

export function normalizeCommunityLinkUrl(rawInput: string): URL | null {
  const trimmed = rawInput.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/:?#].*)?$/.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeAndValidatePostLinks(rawLinks: unknown): {
  links: CommunityPostLink[];
  error?: string;
} {
  if (rawLinks === undefined || rawLinks === null) {
    return { links: [] };
  }
  if (!Array.isArray(rawLinks)) {
    return { links: [], error: 'Post links must be provided as a list.' };
  }
  if (rawLinks.length > MAX_COMMUNITY_POST_LINKS) {
    return {
      links: [],
      error: `You can attach up to ${MAX_COMMUNITY_POST_LINKS} links per post.`,
    };
  }

  const normalized: CommunityPostLink[] = [];
  const seenUrls = new Set<string>();

  for (const item of rawLinks) {
    const rawUrl =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? String((item as { url?: unknown }).url || '')
          : '';
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) continue;

    const parsed = normalizeCommunityLinkUrl(trimmedUrl);
    if (!parsed) {
      return {
        links: [],
        error: `Invalid link URL "${trimmedUrl}". Use a valid http:// or https:// web address.`,
      };
    }

    const finalUrl = parsed.toString();
    if (seenUrls.has(finalUrl)) continue;
    seenUrls.add(finalUrl);

    const rawLabel =
      item && typeof item === 'object' ? String((item as { label?: unknown }).label || '').trim() : '';
    const rawKind =
      item && typeof item === 'object'
        ? (String((item as { kind?: unknown }).kind || '').trim() as CommunityPostLinkKind)
        : undefined;

    const kind: CommunityPostLinkKind =
      rawKind && VALID_LINK_KINDS.has(rawKind) ? rawKind : inferCommunityLinkKind(parsed);

    normalized.push({
      url: finalUrl,
      label: rawLabel ? rawLabel.slice(0, 80) : undefined,
      kind,
    });
  }

  return { links: normalized };
}

export interface TextSegment {
  type: 'text' | 'link';
  value: string;
}

export function parseTextWithLinks(text: string): TextSegment[] {
  if (!text) return [];
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  const pushText = (chunk: string) => {
    if (!chunk) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') {
      prev.value += chunk;
    } else {
      segments.push({ type: 'text', value: chunk });
    }
  };

  for (const match of text.matchAll(urlPattern)) {
    const start = match.index ?? 0;
    let rawUrl = match[0];
    let trailing = '';

    while (/[.,;:!?)]$/.test(rawUrl)) {
      if (rawUrl.endsWith(')') && (rawUrl.match(/\(/g)?.length || 0) >= (rawUrl.match(/\)/g)?.length || 0)) {
        break;
      }
      trailing = rawUrl.slice(-1) + trailing;
      rawUrl = rawUrl.slice(0, -1);
    }

    if (start > lastIndex) {
      pushText(text.slice(lastIndex, start));
    }

    const validated = normalizeCommunityLinkUrl(rawUrl);
    if (validated) {
      segments.push({ type: 'link', value: validated.toString() });
      if (trailing) {
        pushText(trailing);
      }
    } else {
      pushText(match[0]);
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return segments;
}

export function getCommunityLinkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getCommunityLinkKindLabel(kind?: CommunityPostLinkKind): string {
  switch (kind) {
    case 'photo':
      return 'Photo Link';
    case 'video':
      return 'Video Link';
    case 'document':
      return 'Document Link';
    default:
      return 'Web Link';
  }
}
