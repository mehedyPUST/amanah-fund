'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart2,
  Check,
  Edit3,
  Eye,
  EyeOff,
  HeartHandshake,
  Lightbulb,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Sparkles,
  ThumbsUp,
  Trash2,
  Unlock,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '../i18n/config.ts';
import { translateRoleLabel } from '../i18n/messages.ts';
import type {
  AiRewriteTone,
  AiSpamCheckResult,
  CommunityCategory,
  CommunityPost,
  CommunityPostLink,
  CommunityPostLinkKind,
  CommunityReactionType,
  PublicUser,
  UserRole,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  extractPostUrlList,
  getCommunityLinkHost,
  inferCommunityLinkKind,
  isSpamCheckBlockingPost,
  MAX_COMMUNITY_POST_LINKS,
  normalizeCommunityLinkUrl,
} from '../utils/communityLinks.ts';
import { formatDateTime } from '../utils/format.ts';
import { subscribeRealtimeEvents } from '../utils/realtimeClient.ts';
import { scrollFilterButtonWithNeighbors } from '../utils/scrollFilterBar.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import {
  CommunityEmojiPicker,
  CommunityPostLinksList,
  FormattedCommunityText,
} from './CommunityTextWithLinks.tsx';

interface CommunityViewProps {
  user: PublicUser;
  onRefreshWorkspace?: () => Promise<unknown>;
  onViewMemberProfile?: (memberId: string) => void;
}

interface DirectoryMember {
  id: string;
  name: string;
  role: UserRole;
  memberCode: string;
  photoUrl?: string;
}

const CATEGORIES: CommunityCategory[] = [
  'General',
  'Qard Hasan',
  'Halal Ventures',
  'Announcements',
  'Help & Support',
];

const REACTION_OPTIONS: Array<{
  type: CommunityReactionType;
  Icon: typeof ThumbsUp;
  activeClass: string;
}> = [
  {
    type: 'like',
    Icon: ThumbsUp,
    activeClass:
      'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  },
  {
    type: 'support',
    Icon: HeartHandshake,
    activeClass:
      'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300',
  },
  {
    type: 'celebrate',
    Icon: Award,
    activeClass:
      'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300',
  },
  {
    type: 'helpful',
    Icon: Lightbulb,
    activeClass:
      'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300',
  },
];

function getTopicToneClass(category: CommunityCategory): string {
  switch (category) {
    case 'Qard Hasan':
      return 'text-teal-700 dark:text-teal-400';
    case 'Halal Ventures':
      return 'text-amber-700 dark:text-amber-400';
    case 'Help & Support':
      return 'text-indigo-700 dark:text-indigo-400';
    case 'Announcements':
    case 'General':
    default:
      return 'text-emerald-700 dark:text-emerald-400';
  }
}

function AvatarBadge({
  name,
  photoUrl,
  size = 'md',
  shape = 'rounded',
}: {
  name: string;
  photoUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'rounded' | 'circle';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const dims =
    size === 'xs'
      ? 'w-4 h-4 text-[8px]'
      : size === 'sm'
        ? 'w-7 h-7 text-[11px]'
        : size === 'lg'
          ? 'w-11 h-11 text-sm'
          : size === 'xl'
            ? 'w-16 h-16 text-lg'
            : 'w-9 h-9 text-xs';
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} ${radius} object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dims} ${radius} bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-center shrink-0`}
    >
      {initials || 'AM'}
    </div>
  );
}

export function CommunityView({
  user,
  onRefreshWorkspace,
  onViewMemberProfile,
}: CommunityViewProps) {
  const t = useTranslations('Community');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const isAdmin = user.role === 'admin';

  // Community Feed State
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedCategory, setFeedCategory] = useState<'all' | 'pinned' | 'hidden' | CommunityCategory>('all');
  const [feedSearch, setFeedSearch] = useState('');

  // Composer State
  const [composerOpen, setComposerOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<CommunityCategory>('General');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLinks, setNewLinks] = useState<CommunityPostLink[]>([]);
  const [linkBuilderOpen, setLinkBuilderOpen] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkKind, setNewLinkKind] = useState<'auto' | CommunityPostLinkKind>('auto');
  const [newEmojiOpen, setNewEmojiOpen] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const postContentRef = useRef<HTMLTextAreaElement | null>(null);
  const [aiTone, setAiTone] = useState<AiRewriteTone>('clear');
  const [rewritingNewPost, setRewritingNewPost] = useState(false);
  const [checkingNewSpam, setCheckingNewSpam] = useState(false);
  const [newSpamCheckResult, setNewSpamCheckResult] = useState<AiSpamCheckResult | null>(null);
  const [newRewriteFeedback, setNewRewriteFeedback] = useState<string | null>(null);
  const newSpamReqIdRef = useRef(0);
  const lastNewScanKeyRef = useRef('');

  // Poll Builder State
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiSelections, setPollMultiSelections] = useState<Record<string, string[]>>({});
  const [votingPollId, setVotingPollId] = useState<string | null>(null);

  // @Mention Autocomplete State
  const [postMentionQuery, setPostMentionQuery] = useState<string | null>(null);
  const [commentMentionTarget, setCommentMentionTarget] = useState<{
    postId: string;
    query: string;
  } | null>(null);

  // Post Edit / Delete / Moderation State
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<CommunityCategory>('General');
  const [editLinks, setEditLinks] = useState<CommunityPostLink[]>([]);
  const [editLinkBuilderOpen, setEditLinkBuilderOpen] = useState(false);
  const [editLinkUrl, setEditLinkUrl] = useState('');
  const [editLinkLabel, setEditLinkLabel] = useState('');
  const [editLinkKind, setEditLinkKind] = useState<'auto' | CommunityPostLinkKind>('auto');
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [savingPostEdit, setSavingPostEdit] = useState(false);
  const [rewritingEditPost, setRewritingEditPost] = useState(false);
  const [checkingEditSpam, setCheckingEditSpam] = useState(false);
  const [editSpamCheckResult, setEditSpamCheckResult] = useState<AiSpamCheckResult | null>(null);
  const editSpamReqIdRef = useRef(0);
  const lastEditScanKeyRef = useRef('');
  const editContentRef = useRef<HTMLTextAreaElement | null>(null);

  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);

  // Comments State
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentEmojiPostId, setCommentEmojiPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Active Members Directory (for @mention autocomplete in public posts & comments)
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);

  const [modal, setModal] = useState<
    | {
        mode: 'confirm';
        tone: 'emerald' | 'amber' | 'red';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
        confirmLabel: string;
        inputLabel?: string;
        inputPlaceholder?: string;
        inputRequired?: boolean;
        run: (inputValue: string) => Promise<void>;
      }
    | {
        mode: 'notice';
        tone: 'emerald' | 'amber' | 'red' | 'slate';
        title: string;
        description: string;
        details?: ActionModalDetailItem[];
      }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);

  const tRef = useRef(t);
  tRef.current = t;

  const loadPosts = useCallback(async (silent = false) => {
    if (!silent) setPostsLoading(true);
    try {
      const res = await api.getCommunityPosts();
      setPosts(res.posts);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: tRef.current('feedUnavailableTitle'),
        description: err instanceof Error ? err.message : tRef.current('feedUnavailableDesc'),
      });
    } finally {
      if (!silent) setPostsLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(async () => {
    try {
      const res = await api.getActiveMembers();
      setDirectory(
        (res.members || [])
          .filter((m) => m.id !== user.id)
          .map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role,
            memberCode: m.memberCode,
            photoUrl: m.photoUrl,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      // Directory lookup is optional for @mention suggestions
    }
  }, [user.id]);

  useEffect(() => {
    void loadPosts(false);
    void loadDirectory();
    const handleGlobalRefresh = () => {
      void loadPosts(true);
      void loadDirectory();
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [loadPosts, loadDirectory]);

  useEffect(() => {
    const handleCommunity = () => {
      void loadPosts(true);
    };
    const handleMembers = () => {
      void loadPosts(true);
      void loadDirectory();
    };

    const unsubscribe = subscribeRealtimeEvents({
      'community:updated': handleCommunity,
      'members:updated': handleMembers,
    });

    return () => {
      unsubscribe();
    };
  }, [loadPosts, loadDirectory]);

  const filteredPosts = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    return posts.filter((post) => {
      if (feedCategory === 'hidden') {
        if (post.status !== 'hidden') return false;
      } else if (post.status === 'hidden' && !isAdmin) {
        return false;
      } else if (feedCategory === 'pinned') {
        if (!post.isPinned) return false;
      } else if (feedCategory !== 'all') {
        if (post.category !== feedCategory) return false;
      }

      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.content.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q) ||
        post.authorCode.toLowerCase().includes(q) ||
        post.comments.some((c) => c.content.toLowerCase().includes(q))
      );
    });
  }, [posts, feedCategory, feedSearch, isAdmin]);

  const mentionableMembers = useMemo(() => {
    const all: DirectoryMember[] = [
      ...directory,
      {
        id: user.id,
        name: user.name,
        role: user.role,
        memberCode: user.memberCode,
        photoUrl: user.photoUrl,
      },
    ];
    return all;
  }, [directory, user.id, user.name, user.role, user.memberCode, user.photoUrl]);

  function extractTrailingMentionQuery(text: string): string | null {
    const match = /(?:^|\s)@([A-Za-z0-9_.\-\s]{0,24})$/.exec(text);
    if (!match) return null;
    if (match[1].includes('\n')) return null;
    return match[1];
  }

  function applyMentionSelection(sourceText: string, memberName: string): string {
    return sourceText.replace(/(^|\s)@([A-Za-z0-9_.\-\s]{0,24})$/, `$1@${memberName} `);
  }

  function filterMentionMatches(query: string | null): DirectoryMember[] {
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    return mentionableMembers
      .filter(
        (m) =>
          m.id !== user.id &&
          (!q || m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }

  function insertEmojiAtCursor(
    emoji: string,
    el: HTMLTextAreaElement | null,
    currentValue: string,
    updateFn: (next: string) => void
  ) {
    if (!el) {
      updateFn(`${currentValue}${emoji}`);
      return;
    }
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${emoji}${currentValue.slice(end)}`;
    updateFn(nextValue);
    window.requestAnimationFrame(() => {
      el.focus();
      const nextPos = start + emoji.length;
      el.setSelectionRange(nextPos, nextPos);
    });
  }

  function getLocalizedLinkKindLabel(kind?: CommunityPostLinkKind): string {
    switch (kind) {
      case 'photo':
        return t('links.kindPhoto');
      case 'video':
        return t('links.kindVideo');
      case 'document':
        return t('links.kindDocument');
      default:
        return t('links.kindLink');
    }
  }

  function resolveDraftLinkAddition(
    currentList: CommunityPostLink[],
    rawUrl: string,
    rawLabel: string,
    selectedKind: 'auto' | CommunityPostLinkKind
  ): { nextList: CommunityPostLink[]; error?: string } {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { nextList: currentList };
    }
    if (currentList.length >= MAX_COMMUNITY_POST_LINKS) {
      return {
        nextList: currentList,
        error: t('maxLinksError', { max: MAX_COMMUNITY_POST_LINKS }),
      };
    }
    const parsed = normalizeCommunityLinkUrl(trimmed);
    if (!parsed) {
      return {
        nextList: currentList,
        error: t('invalidUrlError'),
      };
    }
    const finalUrl = parsed.toString();
    if (currentList.some((item) => item.url === finalUrl)) {
      return {
        nextList: currentList,
        error: t('duplicateLinkError'),
      };
    }
    const cleanLabel = rawLabel.trim().slice(0, 80);
    const resolvedKind =
      selectedKind === 'auto' ? inferCommunityLinkKind(parsed) : selectedKind;
    return {
      nextList: [
        ...currentList,
        {
          url: finalUrl,
          label: cleanLabel || undefined,
          kind: resolvedKind,
        },
      ],
    };
  }

  function buildLinkScanKey(title: string, content: string, links: CommunityPostLink[]): string {
    return JSON.stringify({
      title: title.trim(),
      content: content.trim(),
      links: links.map((l) => l.url.trim()),
    });
  }

  const newPostUrls = useMemo(
    () => extractPostUrlList({ title: newTitle, content: newContent, links: newLinks }),
    [newTitle, newContent, newLinks]
  );
  const newHasLinks = newPostUrls.length > 0;
  const newPostBlocked = isSpamCheckBlockingPost(newSpamCheckResult, newHasLinks);

  const editPostUrls = useMemo(
    () => extractPostUrlList({ title: editTitle, content: editContent, links: editLinks }),
    [editTitle, editContent, editLinks]
  );
  const editHasLinks = editPostUrls.length > 0;
  const editPostBlocked = isSpamCheckBlockingPost(editSpamCheckResult, editHasLinks);

  const runNewPostSpamScan = useCallback(
    async (opts: {
      title: string;
      content: string;
      links: CommunityPostLink[];
      silentOnError?: boolean;
    }): Promise<AiSpamCheckResult | null> => {
      const scanKey = buildLinkScanKey(opts.title, opts.content, opts.links);
      lastNewScanKeyRef.current = scanKey;
      const reqId = ++newSpamReqIdRef.current;
      setCheckingNewSpam(true);
      try {
        const res = await api.checkCommunitySpam({
          title: opts.title,
          content: opts.content,
          links: opts.links,
        });
        if (reqId === newSpamReqIdRef.current) {
          setNewSpamCheckResult(res.spamCheck);
        }
        return res.spamCheck;
      } catch (err) {
        if (reqId === newSpamReqIdRef.current && !opts.silentOnError) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('linkSafetyFailedTitle'),
            description:
              err instanceof Error ? err.message : t('linkSafetyVerifyError'),
          });
        }
        return null;
      } finally {
        if (reqId === newSpamReqIdRef.current) {
          setCheckingNewSpam(false);
        }
      }
    },
    [t]
  );

  const runEditPostSpamScan = useCallback(
    async (opts: {
      title: string;
      content: string;
      links: CommunityPostLink[];
      silentOnError?: boolean;
    }): Promise<AiSpamCheckResult | null> => {
      const scanKey = buildLinkScanKey(opts.title, opts.content, opts.links);
      lastEditScanKeyRef.current = scanKey;
      const reqId = ++editSpamReqIdRef.current;
      setCheckingEditSpam(true);
      try {
        const res = await api.checkCommunitySpam({
          title: opts.title,
          content: opts.content,
          links: opts.links,
        });
        if (reqId === editSpamReqIdRef.current) {
          setEditSpamCheckResult(res.spamCheck);
        }
        return res.spamCheck;
      } catch (err) {
        if (reqId === editSpamReqIdRef.current && !opts.silentOnError) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('linkSafetyFailedTitle'),
            description:
              err instanceof Error ? err.message : t('linkSafetyVerifyEditError'),
          });
        }
        return null;
      } finally {
        if (reqId === editSpamReqIdRef.current) {
          setCheckingEditSpam(false);
        }
      }
    },
    [t]
  );

  // Automatically check links when inline URLs or attached links change in the New Post composer
  useEffect(() => {
    if (!composerOpen) return;
    if (newPostUrls.length === 0) {
      if (lastNewScanKeyRef.current) {
        lastNewScanKeyRef.current = '';
        setNewSpamCheckResult((prev) => (prev?.riskLevel === 'spam' ? prev : null));
      }
      return;
    }
    const scanKey = buildLinkScanKey(newTitle, newContent, newLinks);
    if (scanKey === lastNewScanKeyRef.current) return;
    const timer = window.setTimeout(() => {
      void runNewPostSpamScan({
        title: newTitle,
        content: newContent,
        links: newLinks,
        silentOnError: true,
      });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [composerOpen, newTitle, newContent, newLinks, newPostUrls.length, runNewPostSpamScan]);

  // Automatically check links when inline URLs or attached links change in the Edit Post composer
  useEffect(() => {
    if (!editingPostId) return;
    if (editPostUrls.length === 0) {
      if (lastEditScanKeyRef.current) {
        lastEditScanKeyRef.current = '';
        setEditSpamCheckResult((prev) => (prev?.riskLevel === 'spam' ? prev : null));
      }
      return;
    }
    const scanKey = buildLinkScanKey(editTitle, editContent, editLinks);
    if (scanKey === lastEditScanKeyRef.current) return;
    const timer = window.setTimeout(() => {
      void runEditPostSpamScan({
        title: editTitle,
        content: editContent,
        links: editLinks,
        silentOnError: true,
      });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [editingPostId, editTitle, editContent, editLinks, editPostUrls.length, runEditPostSpamScan]);

  function handleAddLink(target: 'new' | 'edit') {
    if (target === 'new') {
      if (!newLinkUrl.trim()) return;
      const result = resolveDraftLinkAddition(newLinks, newLinkUrl, newLinkLabel, newLinkKind);
      if (result.error) {
        setModal({
          mode: 'notice',
          tone: 'red',
          title: t('invalidLinkTitle'),
          description: result.error,
        });
        return;
      }
      setNewLinks(result.nextList);
      setNewLinkUrl('');
      setNewLinkLabel('');
      setNewLinkKind('auto');
      // Immediately run AI link & spam verification when a link is added
      void runNewPostSpamScan({
        title: newTitle,
        content: newContent,
        links: result.nextList,
      });
    } else {
      if (!editLinkUrl.trim()) return;
      const result = resolveDraftLinkAddition(editLinks, editLinkUrl, editLinkLabel, editLinkKind);
      if (result.error) {
        setModal({
          mode: 'notice',
          tone: 'red',
          title: t('invalidLinkTitle'),
          description: result.error,
        });
        return;
      }
      setEditLinks(result.nextList);
      setEditLinkUrl('');
      setEditLinkLabel('');
      setEditLinkKind('auto');
      // Immediately run AI link & spam verification when a link is added
      void runEditPostSpamScan({
        title: editTitle,
        content: editContent,
        links: result.nextList,
      });
    }
  }

  function removeFlaggedLinksFromDraft(target: 'new' | 'edit') {
    if (target === 'new') {
      const flaggedSet = new Set(newSpamCheckResult?.flaggedLinks || []);
      const cleanLinks =
        flaggedSet.size > 0 ? newLinks.filter((l) => !flaggedSet.has(l.url)) : [];
      let nextTitle = newTitle;
      let nextContent = newContent;
      for (const badUrl of flaggedSet) {
        nextTitle = nextTitle.split(badUrl).join('').replace(/\s{2,}/g, ' ').trim();
        nextContent = nextContent.split(badUrl).join('').replace(/[ \t]{2,}/g, ' ').trim();
      }
      setNewLinks(cleanLinks);
      setNewTitle(nextTitle);
      setNewContent(nextContent);
      lastNewScanKeyRef.current = '';
      setNewSpamCheckResult(null);
    } else {
      const flaggedSet = new Set(editSpamCheckResult?.flaggedLinks || []);
      const cleanLinks =
        flaggedSet.size > 0 ? editLinks.filter((l) => !flaggedSet.has(l.url)) : [];
      let nextTitle = editTitle;
      let nextContent = editContent;
      for (const badUrl of flaggedSet) {
        nextTitle = nextTitle.split(badUrl).join('').replace(/\s{2,}/g, ' ').trim();
        nextContent = nextContent.split(badUrl).join('').replace(/[ \t]{2,}/g, ' ').trim();
      }
      setEditLinks(cleanLinks);
      setEditTitle(nextTitle);
      setEditContent(nextContent);
      lastEditScanKeyRef.current = '';
      setEditSpamCheckResult(null);
    }
  }

  async function handleRewriteNewPost() {
    if (!newTitle.trim() && !newContent.trim()) {
      setModal({
        mode: 'notice',
        tone: 'amber',
        title: t('writeDraftTitle'),
        description: t('writeDraftDesc'),
      });
      return;
    }
    setRewritingNewPost(true);
    setNewRewriteFeedback(null);
    try {
      const res = await api.rewriteWithAi({
        context: 'community_post',
        title: newTitle.trim() ? newTitle : undefined,
        text: newContent,
        tone: aiTone,
      });
      if (res.result.rewrittenTitle && newTitle.trim()) {
        setNewTitle(res.result.rewrittenTitle.slice(0, 140));
      }
      if (res.result.rewrittenText) {
        setNewContent(res.result.rewrittenText.slice(0, 4000));
      }
      const localizedTone =
        aiTone === 'concise'
          ? t('toneConcise')
          : aiTone === 'formal'
            ? t('toneFormal')
            : t('toneClear');
      setNewRewriteFeedback(
        res.result.improvements.length > 0
          ? res.result.improvements.join(' · ')
          : t('rewrittenToneFeedback', { tone: localizedTone })
      );
      lastNewScanKeyRef.current = '';
      setNewSpamCheckResult(null);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('aiRewriteUnavailableTitle'),
        description:
          err instanceof Error ? err.message : t('aiRewriteUnavailableDesc'),
      });
    } finally {
      setRewritingNewPost(false);
    }
  }

  async function handleCheckNewSpam() {
    const pendingLinkResult = resolveDraftLinkAddition(
      newLinks,
      newLinkUrl,
      newLinkLabel,
      newLinkKind
    );
    if (pendingLinkResult.error) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidLinkTitle'),
        description: pendingLinkResult.error,
      });
      return;
    }
    if (newLinkUrl.trim()) {
      setNewLinks(pendingLinkResult.nextList);
      setNewLinkUrl('');
      setNewLinkLabel('');
      setNewLinkKind('auto');
    }
    await runNewPostSpamScan({
      title: newTitle,
      content: newContent,
      links: pendingLinkResult.nextList,
    });
  }

  async function handleRewriteEditPost() {
    if (!editTitle.trim() && !editContent.trim()) return;
    setRewritingEditPost(true);
    try {
      const res = await api.rewriteWithAi({
        context: 'community_post',
        title: editTitle.trim() ? editTitle : undefined,
        text: editContent,
        tone: aiTone,
      });
      if (res.result.rewrittenTitle && editTitle.trim()) {
        setEditTitle(res.result.rewrittenTitle.slice(0, 140));
      }
      if (res.result.rewrittenText) {
        setEditContent(res.result.rewrittenText.slice(0, 4000));
      }
      lastEditScanKeyRef.current = '';
      setEditSpamCheckResult(null);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('aiRewriteUnavailableTitle'),
        description:
          err instanceof Error ? err.message : t('aiRewriteUnavailableDesc'),
      });
    } finally {
      setRewritingEditPost(false);
    }
  }

  async function handleCheckEditSpam() {
    const pendingLinkResult = resolveDraftLinkAddition(
      editLinks,
      editLinkUrl,
      editLinkLabel,
      editLinkKind
    );
    if (pendingLinkResult.error) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidLinkTitle'),
        description: pendingLinkResult.error,
      });
      return;
    }
    if (editLinkUrl.trim()) {
      setEditLinks(pendingLinkResult.nextList);
      setEditLinkUrl('');
      setEditLinkLabel('');
      setEditLinkKind('auto');
    }
    await runEditPostSpamScan({
      title: editTitle,
      content: editContent,
      links: pendingLinkResult.nextList,
    });
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();

    const pendingLinkResult = resolveDraftLinkAddition(
      newLinks,
      newLinkUrl,
      newLinkLabel,
      newLinkKind
    );
    if (pendingLinkResult.error) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidLinkTitle'),
        description: pendingLinkResult.error,
      });
      return;
    }
    const finalLinks = pendingLinkResult.nextList;
    if (newLinkUrl.trim()) {
      setNewLinks(finalLinks);
      setNewLinkUrl('');
      setNewLinkLabel('');
      setNewLinkKind('auto');
    }

    const finalUrls = extractPostUrlList({
      title: newTitle,
      content: newContent,
      links: finalLinks,
    });
    const scanKey = buildLinkScanKey(newTitle, newContent, finalLinks);

    let effectiveSpamCheck = newSpamCheckResult;
    if (finalUrls.length > 0 && (!effectiveSpamCheck || lastNewScanKeyRef.current !== scanKey)) {
      effectiveSpamCheck = await runNewPostSpamScan({
        title: newTitle,
        content: newContent,
        links: finalLinks,
      });
      if (!effectiveSpamCheck) return;
    }

    if (isSpamCheckBlockingPost(effectiveSpamCheck, finalUrls.length > 0)) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('blockedFlaggedTitle'),
        description: t('blockedFlaggedDesc', { reason: effectiveSpamCheck!.reason }),
      });
      return;
    }

    let pollPayload: { question: string; allowMultiple: boolean; options: string[] } | undefined;
    if (pollEnabled) {
      const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (pollQuestion.trim().length < 3 || cleanedOptions.length < 2) {
        setModal({
          mode: 'notice',
          tone: 'red',
          title: t('invalidPollTitle'),
          description: t('invalidPollDesc'),
        });
        return;
      }
      pollPayload = {
        question: pollQuestion.trim(),
        allowMultiple: pollAllowMultiple,
        options: cleanedOptions,
      };
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmPublishTitle'),
      description: t('confirmPublishDesc'),
      details: [
        { label: t('detailTopic'), value: t(`categories.${newCategory}`) },
        { label: t('detailHeadline'), value: newTitle.trim() },
        ...(pollPayload ? [{ label: t('detailAttachedPoll'), value: pollPayload.question }] : []),
        ...(finalLinks.length > 0
          ? [
              {
                label: t('detailLinks'),
                value: t('linksVerifiedSafe', { count: finalLinks.length }),
              },
            ]
          : []),
      ],
      confirmLabel: t('publishPostBtn'),
      run: async () => {
        setCreatingPost(true);
        try {
          const res = await api.createCommunityPost({
            category: newCategory,
            title: newTitle,
            content: newContent,
            links: finalLinks.length > 0 ? finalLinks : undefined,
            poll: pollPayload,
          });
          setPosts((prev) => [res.post, ...prev]);
          setNewTitle('');
          setNewContent('');
          setNewLinks([]);
          setNewLinkUrl('');
          setNewLinkLabel('');
          setNewLinkKind('auto');
          setLinkBuilderOpen(false);
          setNewEmojiOpen(false);
          setNewCategory('General');
          setPollEnabled(false);
          setPollQuestion('');
          setPollAllowMultiple(false);
          setPollOptions(['', '']);
          setPostMentionQuery(null);
          lastNewScanKeyRef.current = '';
          setNewSpamCheckResult(null);
          setNewRewriteFeedback(null);
          setComposerOpen(false);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('postPublishedTitle'),
            description: t('postPublishedDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('publishFailedTitle'),
            description: err instanceof Error ? err.message : t('publishFailedDesc'),
          });
        } finally {
          setCreatingPost(false);
        }
      },
    });
  }

  async function handleVotePoll(postId: string, optionIds: string[]) {
    if (optionIds.length === 0) return;
    setVotingPollId(postId);
    try {
      const res = await api.voteCommunityPoll(postId, optionIds);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('pollVoteFailedTitle'),
        description: err instanceof Error ? err.message : t('pollVoteFailedDesc'),
      });
    } finally {
      setVotingPollId(null);
    }
  }

  function startEditPost(post: CommunityPost) {
    const initialLinks = Array.isArray(post.links) ? post.links : [];
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditCategory(post.category);
    setEditLinks(initialLinks);
    setEditLinkBuilderOpen(false);
    setEditLinkUrl('');
    setEditLinkLabel('');
    setEditLinkKind('auto');
    setEditEmojiOpen(false);
    lastEditScanKeyRef.current = buildLinkScanKey(post.title, post.content, initialLinks);
    setEditSpamCheckResult(null);
  }

  async function handleSavePostEdit(postId: string) {
    const pendingLinkResult = resolveDraftLinkAddition(
      editLinks,
      editLinkUrl,
      editLinkLabel,
      editLinkKind
    );
    if (pendingLinkResult.error) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidLinkTitle'),
        description: pendingLinkResult.error,
      });
      return;
    }
    const finalEditLinks = pendingLinkResult.nextList;
    if (editLinkUrl.trim()) {
      setEditLinks(finalEditLinks);
      setEditLinkUrl('');
      setEditLinkLabel('');
      setEditLinkKind('auto');
    }

    const finalEditUrls = extractPostUrlList({
      title: editTitle,
      content: editContent,
      links: finalEditLinks,
    });
    const scanKey = buildLinkScanKey(editTitle, editContent, finalEditLinks);

    let effectiveSpamCheck = editSpamCheckResult;
    if (finalEditUrls.length > 0 && (!effectiveSpamCheck || lastEditScanKeyRef.current !== scanKey)) {
      effectiveSpamCheck = await runEditPostSpamScan({
        title: editTitle,
        content: editContent,
        links: finalEditLinks,
      });
      if (!effectiveSpamCheck) return;
    }

    if (isSpamCheckBlockingPost(effectiveSpamCheck, finalEditUrls.length > 0)) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('blockedSaveTitle'),
        description: t('blockedSaveDesc', { reason: effectiveSpamCheck!.reason }),
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmSaveEditTitle'),
      description: t('confirmSaveEditDesc'),
      details: [
        { label: t('detailTopic'), value: t(`categories.${editCategory}`) },
        { label: t('detailHeadline'), value: editTitle.trim() },
      ],
      confirmLabel: tCommon('saveChanges'),
      run: async () => {
        setSavingPostEdit(true);
        try {
          const res = await api.updateCommunityPost(postId, {
            title: editTitle,
            content: editContent,
            category: editCategory,
            links: finalEditLinks,
          });
          setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
          setEditingPostId(null);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('postUpdatedTitle'),
            description: t('postUpdatedDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('updateFailedTitle'),
            description: err instanceof Error ? err.message : t('updateFailedDesc'),
          });
        } finally {
          setSavingPostEdit(false);
        }
      },
    });
  }

  function requestDeletePost(post: CommunityPost) {
    const isAuthor = post.authorId === user.id;
    const isAdminModeration = isAdmin && !isAuthor;
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: isAdminModeration ? t('confirmAdminRemovePostTitle') : t('confirmDeletePostTitle'),
      description: isAdminModeration
        ? t('confirmAdminRemovePostDesc', { title: post.title, author: post.authorName })
        : t('confirmDeletePostDesc', { title: post.title }),
      details: [
        { label: t('detailAuthor'), value: `${post.authorName} (${post.authorCode})` },
        { label: t('detailTopic'), value: t(`categories.${post.category}`) },
      ],
      confirmLabel: isAdminModeration ? t('removePostBtn') : t('deletePostBtn'),
      ...(isAdminModeration
        ? {
            inputLabel: t('moderationNoteInputLabel'),
            inputPlaceholder: t('moderationNotePlaceholder'),
            inputRequired: false,
          }
        : {}),
      run: async (reasonInput) => {
        setModerationBusyId(post.id);
        try {
          await api.deleteCommunityPost(post.id, reasonInput.trim() || undefined);
          setPosts((prev) => prev.filter((p) => p.id !== post.id));
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('postDeletedTitle'),
            description: t('postDeletedDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deleteFailedTitle'),
            description: err instanceof Error ? err.message : t('deleteFailedDesc'),
          });
        } finally {
          setModerationBusyId(null);
        }
      },
    });
  }

  async function handleToggleReaction(postId: string, type: CommunityReactionType) {
    try {
      const res = await api.reactCommunityPost(postId, type);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('reactionFailedTitle'),
        description: err instanceof Error ? err.message : t('reactionFailedDesc'),
      });
    }
  }

  async function handleAddComment(postId: string) {
    const content = (commentDrafts[postId] || '').trim();
    if (!content) return;
    setSubmittingCommentPostId(postId);
    try {
      const res = await api.addCommunityComment(postId, content);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('commentFailedTitle'),
        description: err instanceof Error ? err.message : t('commentFailedDesc'),
      });
    } finally {
      setSubmittingCommentPostId(null);
    }
  }

  async function handleSaveCommentEdit(postId: string, commentId: string) {
    const trimmed = editCommentText.trim();
    if (!trimmed) return;
    try {
      const res = await api.updateCommunityComment(postId, commentId, trimmed);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      setEditingCommentId(null);
      setEditCommentText('');
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('commentUpdateFailedTitle'),
        description: err instanceof Error ? err.message : t('commentUpdateFailedDesc'),
      });
    }
  }

  function requestDeleteComment(postId: string, commentId: string, authorName: string) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('confirmDeleteCommentTitle'),
      description: t('confirmDeleteCommentDesc'),
      details: [{ label: t('detailAuthor'), value: authorName }],
      confirmLabel: t('deleteCommentBtn'),
      run: async () => {
        try {
          const res = await api.deleteCommunityComment(postId, commentId);
          setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('commentRemovedTitle'),
            description: t('commentRemovedDesc'),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deleteFailedTitle'),
            description: err instanceof Error ? err.message : t('commentDeleteFailedDesc'),
          });
        }
      },
    });
  }

  function requestModeratePost(
    post: CommunityPost,
    action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide' | 'restore'
  ) {
    const actionTitle = t(`moderationActions.${action}.title`);
    const actionConfirm = t(`moderationActions.${action}.confirm`);
    const actionVerb = t(`moderationActions.${action}.verb`);
    setModal({
      mode: 'confirm',
      tone: action === 'hide' || action === 'lock' ? 'amber' : 'emerald',
      title: actionTitle,
      description: t('confirmModerateDesc', { action: actionVerb }),
      details: [
        { label: t('detailPost'), value: post.title },
        { label: t('detailAuthor'), value: `${post.authorName} (${post.authorCode})` },
      ],
      confirmLabel: actionConfirm,
      run: async () => {
        setModerationBusyId(post.id);
        try {
          const res = await api.moderateCommunityPost(post.id, action);
          setPosts((prev) => {
            const next = prev.map((p) => (p.id === post.id ? res.post : p));
            return next.sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
          });
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('moderationAppliedTitle'),
            description: t('moderationAppliedDesc', { action: actionVerb }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('moderationFailedTitle'),
            description: err instanceof Error ? err.message : t('moderationFailedDesc'),
          });
        } finally {
          setModerationBusyId(null);
        }
      },
    });
  }

  function requestToggleMuteAuthor(
    authorId: string,
    authorName: string,
    currentlyMuted: boolean
  ) {
    setModal({
      mode: 'confirm',
      tone: currentlyMuted ? 'emerald' : 'red',
      title: currentlyMuted
        ? t('confirmUnmuteTitle', { name: authorName })
        : t('confirmMuteTitle', { name: authorName }),
      description: currentlyMuted ? t('confirmUnmuteDesc') : t('confirmMuteDesc'),
      details: [{ label: t('detailMember'), value: authorName }],
      confirmLabel: currentlyMuted ? t('unmuteMemberBtn') : t('muteMemberBtn'),
      run: async () => {
        setModerationBusyId(authorId);
        try {
          await api.toggleCommunityMuteMember(authorId, !currentlyMuted);
          await loadPosts(true);
          await onRefreshWorkspace?.();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: currentlyMuted ? t('memberUnmutedTitle') : t('memberMutedTitle'),
            description: !currentlyMuted
              ? t('memberMutedDesc', { name: authorName })
              : t('memberUnmutedDesc', { name: authorName }),
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('muteFailedTitle'),
            description: err instanceof Error ? err.message : t('muteFailedDesc'),
          });
        } finally {
          setModerationBusyId(null);
        }
      },
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Top Toolbar: Public Posts Header + New Post Action */}
      <div className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('toolbarEyebrow')}</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t('toolbarHeading')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 shrink-0 w-full sm:w-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 text-xs font-medium text-slate-700 dark:text-slate-200">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>{t('tabFeed')}</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {posts.filter((p) => p.status === 'active').length}
            </span>
          </span>

          {!user.communityMuted && (
            <button
              type="button"
              onClick={() => {
                setComposerOpen((prev) => !prev);
              }}
              className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md active:scale-[0.98] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              {composerOpen ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{composerOpen ? t('closeComposer') : t('newPost')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-5">
          {user.communityMuted && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200"
            >
              <VolumeX className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
              <div>
                <p className="font-semibold">{t('mutedBannerTitle')}</p>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  {t('mutedBannerDesc')}
                </p>
              </div>
            </div>
          )}

          {/* New Post Composer */}
          <AnimatePresence>
            {composerOpen && !user.communityMuted && (
              <motion.form
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                onSubmit={handleCreatePost}
                className="amanah-card-violet backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('createPostHeading')}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('postingAs', { name: user.name })} <span className="font-mono">{user.memberCode}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
                  <div>
                    <label
                      htmlFor="post-category"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      {t('labelTopic')}
                    </label>
                    <select
                      id="post-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as CommunityCategory)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {t(`categories.${cat}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="post-title"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      {t('labelHeadline')}
                    </label>
                    <input
                      id="post-title"
                      type="text"
                      required
                      minLength={3}
                      maxLength={140}
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder={t('placeholderHeadline')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label
                    htmlFor="post-content"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    {t('labelMessagePre')} <span className="font-mono">@Name</span> {t('labelMessagePost')}
                  </label>
                  <textarea
                    ref={postContentRef}
                    id="post-content"
                    rows={4}
                    required
                    minLength={3}
                    maxLength={4000}
                    value={newContent}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewContent(val);
                      setPostMentionQuery(extractTrailingMentionQuery(val));
                    }}
                    placeholder={t('placeholderPostBody')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 resize-y"
                  />
                  {postMentionQuery !== null && filterMentionMatches(postMentionQuery).length > 0 && (
                    <div
                      role="listbox"
                      aria-label={t('mentionSuggestionsAria')}
                      className="mt-1 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/88 dark:bg-slate-900/88 backdrop-blur-md shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto z-20"
                    >
                      {filterMentionMatches(postMentionQuery).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setNewContent((prev) => applyMentionSelection(prev, m.name));
                            setPostMentionQuery(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="font-medium text-slate-900 dark:text-white">
                            @{m.name}
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {m.memberCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Optional Poll Builder */}
                {pollEnabled && (
                  <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('communityPollTitle')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPollEnabled(false)}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        {t('removePoll')}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder={t('placeholderPollQuestion')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm"
                    />
                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              setPollOptions((prev) =>
                                prev.map((v, i) => (i === idx ? e.target.value : v))
                              )
                            }
                            placeholder={t('placeholderPollOption', { num: idx + 1 })}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label={t('removeOptionAria')}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {pollOptions.length < 6 ? (
                        <button
                          type="button"
                          onClick={() => setPollOptions((prev) => [...prev, ''])}
                          className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('addOption')}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('maxPollOptions')}</span>
                      )}
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pollAllowMultiple}
                          onChange={(e) => setPollAllowMultiple(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-indigo-600"
                        />
                        <span>{t('allowMultipleChoices')}</span>
                      </label>
                    </div>
                  </div>
                )}

                {newEmojiOpen && (
                  <CommunityEmojiPicker
                    onSelect={(emoji) =>
                      insertEmojiAtCursor(emoji, postContentRef.current, newContent, setNewContent)
                    }
                  />
                )}

                {(linkBuilderOpen || newLinks.length > 0) && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                        <span>
                          {t('shareLinksCount', { count: newLinks.length, max: MAX_COMMUNITY_POST_LINKS })}
                        </span>
                      </span>
                      {linkBuilderOpen && (
                        <button
                          type="button"
                          onClick={() => setLinkBuilderOpen(false)}
                          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {tCommon('hide')}
                        </button>
                      )}
                    </div>

                    {newLinks.length > 0 && (
                      <div className="space-y-1.5">
                        {newLinks.map((item) => {
                          const isFlagged = Boolean(
                            newPostBlocked && newSpamCheckResult?.flaggedLinks.includes(item.url)
                          );
                          return (
                            <div
                              key={item.url}
                              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                                isFlagged
                                  ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/35'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {item.label || getCommunityLinkHost(item.url)}
                                </span>
                                <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                                <span
                                  className={
                                    isFlagged
                                      ? 'text-rose-700 dark:text-rose-300 font-medium'
                                      : 'text-teal-700 dark:text-teal-400'
                                  }
                                >
                                  {isFlagged
                                    ? t('flaggedLink')
                                    : getLocalizedLinkKindLabel(item.kind)}
                                </span>
                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {item.url}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setNewLinks((prev) => prev.filter((l) => l.url !== item.url))
                                }
                                aria-label={t('removeLinkAria')}
                                className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {linkBuilderOpen && newLinks.length < MAX_COMMUNITY_POST_LINKS && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_120px_auto] gap-2">
                        <input
                          type="url"
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddLink('new');
                            }
                          }}
                          placeholder={t('placeholderLinkUrl')}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          maxLength={80}
                          value={newLinkLabel}
                          onChange={(e) => setNewLinkLabel(e.target.value)}
                          placeholder={t('placeholderLinkLabel')}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <select
                          value={newLinkKind}
                          onChange={(e) =>
                            setNewLinkKind(e.target.value as 'auto' | CommunityPostLinkKind)
                          }
                          aria-label={t('linkKindAria')}
                          className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        >
                          <option value="auto">{t('linkTypeAuto')}</option>
                          <option value="photo">{t('linkTypePhoto')}</option>
                          <option value="video">{t('linkTypeVideo')}</option>
                          <option value="document">{t('linkTypeDoc')}</option>
                          <option value="link">{t('linkTypeWeb')}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddLink('new')}
                          disabled={!newLinkUrl.trim()}
                          className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 disabled:opacity-45 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          {t('addLinkBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(newRewriteFeedback || checkingNewSpam || newSpamCheckResult) && (
                  <div className="space-y-2">
                    {newRewriteFeedback && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs text-indigo-800 dark:text-indigo-200">
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                        <span>{t('aiRewriteApplied', { feedback: newRewriteFeedback })}</span>
                      </div>
                    )}
                    {checkingNewSpam && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/70 text-xs text-slate-700 dark:text-slate-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>{t('checkingSpamNotice')}</span>
                      </div>
                    )}
                    {!checkingNewSpam && newSpamCheckResult && (
                      <div
                        className={`flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border text-xs ${
                          newPostBlocked
                            ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                            : newSpamCheckResult.riskLevel === 'caution'
                              ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                              : 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {newSpamCheckResult.riskLevel === 'safe' ? (
                            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          )}
                          <div className="space-y-1 min-w-0">
                            <div className="font-semibold">
                              {newPostBlocked
                                ? t('spamBlockedTitle')
                                : newSpamCheckResult.riskLevel === 'caution'
                                  ? t('spamCautionTitle')
                                  : t('spamSafeTitle')}
                              <span className="ml-1.5 font-mono text-[10px] opacity-75">
                                ({newSpamCheckResult.checkedWith === 'groq' ? t('checkedWithGroq') : t('checkedWithGuard')})
                              </span>
                            </div>
                            <div>{newSpamCheckResult.reason}</div>
                            {newSpamCheckResult.flaggedLinks.length > 0 && (
                              <div className="font-mono text-[11px] break-all">
                                {t('flaggedListPrefix', { list: newSpamCheckResult.flaggedLinks.join(', ') })}
                              </div>
                            )}
                            {newPostBlocked && (
                              <div className="text-[11px] font-medium">
                                {t('removeFlaggedHint')}
                              </div>
                            )}
                          </div>
                        </div>
                        {newPostBlocked &&
                          (newSpamCheckResult.flaggedLinks.length > 0 || newLinks.length > 0) && (
                            <button
                              type="button"
                              onClick={() => removeFlaggedLinksFromDraft('new')}
                              className="px-2.5 py-1.5 rounded-md border border-rose-300 dark:border-rose-800 bg-white/80 dark:bg-slate-900/80 hover:bg-rose-100/70 dark:hover:bg-rose-900/50 text-[11px] font-medium text-rose-700 dark:text-rose-200 whitespace-nowrap cursor-pointer shrink-0"
                            >
                              {t('removeFlaggedBtn')}
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNewEmojiOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                        newEmojiOpen
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Smile className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <span>{t('emojiBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkBuilderOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                        linkBuilderOpen
                          ? 'border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                      <span>{t('addLinkToggle')}</span>
                    </button>
                    {!pollEnabled && (
                      <button
                        type="button"
                        onClick={() => setPollEnabled(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 cursor-pointer transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{t('attachPollBtn')}</span>
                      </button>
                    )}

                    <div className="inline-flex items-center rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 overflow-hidden">
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value as AiRewriteTone)}
                        aria-label={t('aiToneAria')}
                        className="px-2.5 py-2 bg-transparent text-[11px] font-medium text-indigo-800 dark:text-indigo-200 border-r border-indigo-200 dark:border-indigo-800/70 focus:outline-none cursor-pointer"
                      >
                        <option value="clear">{t('toneClear')}</option>
                        <option value="concise">{t('toneConcise')}</option>
                        <option value="formal">{t('toneFormal')}</option>
                      </select>
                      <button
                        type="button"
                        disabled={rewritingNewPost}
                        onClick={() => void handleRewriteNewPost()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{rewritingNewPost ? t('rewriting') : t('aiRewrite')}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={checkingNewSpam}
                      onClick={() => void handleCheckNewSpam()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-700 dark:text-emerald-300 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{checkingNewSpam ? t('scanning') : t('spamLinkCheck')}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComposerOpen(false)}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {tCommon('cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingPost || checkingNewSpam || newPostBlocked}
                      title={
                        newPostBlocked
                          ? t('blockedTitleTooltip')
                          : checkingNewSpam
                            ? t('checkingLinksTooltip')
                            : undefined
                      }
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-sm shadow-emerald-600/20 active:scale-[0.98] cursor-pointer transition-all"
                    >
                      {creatingPost
                        ? t('publishing')
                        : checkingNewSpam
                          ? t('checkingLinksBtn')
                          : newPostBlocked
                            ? t('linkBlockedBtn')
                            : t('publishPostBtn')}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth max-w-full pb-1">
              {(
                [
                  { id: 'all', label: t('filterAllTopics') },
                  { id: 'pinned', label: t('filterPinned') },
                  ...CATEGORIES.map((c) => ({ id: c, label: t(`categories.${c}`) })),
                  ...(isAdmin ? [{ id: 'hidden' as const, label: t('filterHiddenAdmin') }] : []),
                ] as Array<{ id: typeof feedCategory; label: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    setFeedCategory(item.id);
                    scrollFilterButtonWithNeighbors(e.currentTarget);
                  }}
                  className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    feedCategory === item.id
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-72 shrink-0">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder={t('searchFeedPlaceholder')}
                className="w-full min-h-[44px] sm:min-h-0 pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          </div>

          {/* Posts Feed */}
          {postsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton width={36} height={36} borderRadius={8} />
                    <div className="space-y-1 flex-1">
                      <Skeleton width={160} height={14} />
                      <Skeleton width={210} height={12} />
                    </div>
                  </div>
                  <Skeleton width="65%" height={18} />
                  <Skeleton count={2} height={14} />
                  <div className="flex gap-2 pt-2">
                    <Skeleton width={68} height={28} borderRadius={8} />
                    <Skeleton width={76} height={28} borderRadius={8} />
                    <Skeleton width={82} height={28} borderRadius={8} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="amanah-card-violet backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-10 text-center space-y-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)]">
              <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('emptyFeedTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {feedSearch || feedCategory !== 'all'
                    ? t('emptyFeedFiltered')
                    : t('emptyFeedDefault')}
                </p>
              </div>
              {!user.communityMuted && !composerOpen && (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 cursor-pointer"
                >
                  {t('createFirstPost')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPosts.map((post, idx) => {
                const isAuthor = post.authorId === user.id;
                const canDeletePost = isAuthor || isAdmin;
                const myReaction = post.reactions.find((r) => r.userId === user.id)?.type;
                const isEditingThis = editingPostId === post.id;

                return (
                  <article
                    key={post.id}
                    className={`backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] transition-all duration-200 ${
                      post.status === 'hidden'
                        ? 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/75 dark:bg-amber-950/25'
                        : post.isPinned
                          ? 'amanah-card-emerald'
                          : idx % 2 === 0
                            ? 'amanah-card-violet'
                            : 'amanah-card-emerald'
                    }`}
                  >
                    {/* Author Header & Clean Unboxed Metadata */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {onViewMemberProfile ? (
                          <button
                            type="button"
                            onClick={() => onViewMemberProfile(post.authorId)}
                            title={t('viewAuthorProfileTitle', { name: post.authorName })}
                            className="shrink-0 cursor-pointer rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          >
                            <AvatarBadge name={post.authorName} photoUrl={post.authorPhotoUrl} />
                          </button>
                        ) : (
                          <AvatarBadge name={post.authorName} photoUrl={post.authorPhotoUrl} />
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            {onViewMemberProfile ? (
                              <button
                                type="button"
                                onClick={() => onViewMemberProfile(post.authorId)}
                                className="font-semibold text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                              >
                                {post.authorName}
                              </button>
                            ) : (
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {post.authorName}
                              </span>
                            )}
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              {post.authorCode}
                            </span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                              ·
                            </span>
                            <span className="capitalize text-slate-600 dark:text-slate-400">
                              {translateRoleLabel(post.authorRole, locale)}
                            </span>
                            {post.authorMuted && isAdmin && (
                              <>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                  ·
                                </span>
                                <span className="text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                                  <VolumeX className="w-3 h-3" />
                                  {t('mutedBadge')}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className={`font-medium ${getTopicToneClass(post.category)}`}>
                              {t(`categories.${post.category}`)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatDateTime(post.createdAt)}
                            </span>
                            {post.updatedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{t('edited')}</span>
                              </>
                            )}
                            {post.isPinned && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                  <Pin className="w-3 h-3" />
                                  {t('pinned')}
                                </span>
                              </>
                            )}
                            {post.commentsLocked && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  {t('repliesLocked')}
                                </span>
                              </>
                            )}
                            {post.status === 'hidden' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-red-700 dark:text-red-400 font-medium inline-flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" />
                                  {t('hiddenFromMembers')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Author / Admin Controls */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {onViewMemberProfile && (
                          <button
                            type="button"
                            onClick={() => onViewMemberProfile(post.authorId)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <User className="w-3 h-3" />
                            <span>{t('profileBtn')}</span>
                          </button>
                        )}

                        {isAuthor && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => startEditPost(post)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{tCommon('edit')}</span>
                          </button>
                        )}

                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              disabled={moderationBusyId === post.id}
                              onClick={() =>
                                requestModeratePost(post, post.isPinned ? 'unpin' : 'pin')
                              }
                              title={post.isPinned ? t('unpinTitle') : t('pinTitle')}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.isPinned ? (
                                <>
                                  <PinOff className="w-3 h-3" />
                                  <span>{t('unpinBtn')}</span>
                                </>
                              ) : (
                                <>
                                  <Pin className="w-3 h-3" />
                                  <span>{t('pinBtn')}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={moderationBusyId === post.id}
                              onClick={() =>
                                requestModeratePost(
                                  post,
                                  post.commentsLocked ? 'unlock' : 'lock'
                                )
                              }
                              title={
                                post.commentsLocked ? t('unlockTitle') : t('lockTitle')
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.commentsLocked ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>{t('unlockBtn')}</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>{t('lockBtn')}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={moderationBusyId === post.id}
                              onClick={() =>
                                requestModeratePost(
                                  post,
                                  post.status === 'hidden' ? 'restore' : 'hide'
                                )
                              }
                              title={
                                post.status === 'hidden'
                                  ? t('restoreTitle')
                                  : t('hideTitle')
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.status === 'hidden' ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>{t('restoreBtn')}</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>{t('hideBtn')}</span>
                                </>
                              )}
                            </button>

                            {post.authorRole !== 'admin' && post.authorId !== user.id && (
                              <button
                                type="button"
                                disabled={moderationBusyId === post.authorId}
                                onClick={() =>
                                  requestToggleMuteAuthor(
                                    post.authorId,
                                    post.authorName,
                                    Boolean(post.authorMuted)
                                  )
                                }
                                title={
                                  post.authorMuted
                                    ? t('unmuteTitle')
                                    : t('muteTitle')
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                              >
                                {post.authorMuted ? (
                                  <>
                                    <Volume2 className="w-3 h-3" />
                                    <span>{t('unmuteBtn')}</span>
                                  </>
                                ) : (
                                  <>
                                    <VolumeX className="w-3 h-3" />
                                    <span>{t('muteAuthorBtn')}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        )}

                        {canDeletePost && (
                          <button
                            type="button"
                            disabled={moderationBusyId === post.id}
                            onClick={() => requestDeletePost(post)}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{tCommon('delete')}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Post Body or Inline Edit Form */}
                    {isEditingThis ? (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as CommunityCategory)}
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {t(`categories.${cat}`)}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <textarea
                          ref={editContentRef}
                          rows={4}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                        />

                        {editEmojiOpen && (
                          <CommunityEmojiPicker
                            onSelect={(emoji) =>
                              insertEmojiAtCursor(
                                emoji,
                                editContentRef.current,
                                editContent,
                                setEditContent
                              )
                            }
                          />
                        )}

                        {(editLinkBuilderOpen || editLinks.length > 0) && (
                          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5">
                            {editLinks.length > 0 && (
                              <div className="space-y-1.5">
                                {editLinks.map((item) => {
                                  const isFlagged = Boolean(
                                    editPostBlocked &&
                                      editSpamCheckResult?.flaggedLinks.includes(item.url)
                                  );
                                  return (
                                    <div
                                      key={item.url}
                                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                                        isFlagged
                                          ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/35'
                                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                      }`}
                                    >
                                      <div className="min-w-0 truncate">
                                        <span className="font-medium text-slate-900 dark:text-white">
                                          {item.label || getCommunityLinkHost(item.url)}
                                        </span>
                                        <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                                        {isFlagged && (
                                          <span className="text-rose-700 dark:text-rose-300 font-medium mr-1.5">
                                            {t('flaggedInline')}
                                          </span>
                                        )}
                                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                          {item.url}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditLinks((prev) =>
                                            prev.filter((l) => l.url !== item.url)
                                          )
                                        }
                                        aria-label={t('removeLinkAria')}
                                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {editLinkBuilderOpen && editLinks.length < MAX_COMMUNITY_POST_LINKS && (
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_110px_auto] gap-2">
                                <input
                                  type="url"
                                  value={editLinkUrl}
                                  onChange={(e) => setEditLinkUrl(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddLink('edit');
                                    }
                                  }}
                                  placeholder={t('placeholderEditLinkUrl')}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={editLinkLabel}
                                  onChange={(e) => setEditLinkLabel(e.target.value)}
                                  placeholder={t('placeholderLinkLabel')}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                                <select
                                  value={editLinkKind}
                                  onChange={(e) =>
                                    setEditLinkKind(e.target.value as 'auto' | CommunityPostLinkKind)
                                  }
                                  aria-label={t('linkKindAria')}
                                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                >
                                  <option value="auto">{t('linkShortAuto')}</option>
                                  <option value="photo">{t('linkShortPhoto')}</option>
                                  <option value="video">{t('linkShortVideo')}</option>
                                  <option value="document">{t('linkShortDoc')}</option>
                                  <option value="link">{t('linkShortWeb')}</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleAddLink('edit')}
                                  disabled={!editLinkUrl.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-teal-600 text-white text-xs font-medium cursor-pointer disabled:opacity-45"
                                >
                                  {t('addLinkBtn')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {checkingEditSpam && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/70 text-xs text-slate-700 dark:text-slate-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                            <span>{t('checkingEditSpamNotice')}</span>
                          </div>
                        )}

                        {!checkingEditSpam && editSpamCheckResult && (
                          <div
                            className={`flex items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                              editPostBlocked
                                ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                                : editSpamCheckResult.riskLevel === 'caution'
                                  ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                                  : 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                            }`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              {editSpamCheckResult.riskLevel === 'safe' ? (
                                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                              )}
                              <div className="min-w-0 space-y-0.5">
                                <div>
                                  <span className="font-semibold mr-1.5">
                                    {editPostBlocked
                                      ? t('saveBlockedInline')
                                      : editSpamCheckResult.riskLevel === 'caution'
                                        ? t('linkCautionInline')
                                        : t('verifiedSafeInline')}
                                  </span>
                                  <span>{editSpamCheckResult.reason}</span>
                                </div>
                                {editPostBlocked && (
                                  <div className="text-[11px] font-medium">
                                    {t('removeFlaggedBeforeSave')}
                                  </div>
                                )}
                              </div>
                            </div>
                            {editPostBlocked &&
                              (editSpamCheckResult.flaggedLinks.length > 0 || editLinks.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() => removeFlaggedLinksFromDraft('edit')}
                                  className="px-2 py-1 rounded-md border border-rose-300 dark:border-rose-800 bg-white/80 dark:bg-slate-900/80 text-[11px] font-medium text-rose-700 dark:text-rose-200 whitespace-nowrap cursor-pointer shrink-0"
                                >
                                  {t('removeFlaggedBtn')}
                                </button>
                              )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditEmojiOpen((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Smile className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>{t('emojiBtn')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditLinkBuilderOpen((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Link2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              <span>{t('addLinkToggle')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={rewritingEditPost}
                              onClick={() => void handleRewriteEditPost()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{rewritingEditPost ? t('rewriting') : t('aiRewrite')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={checkingEditSpam}
                              onClick={() => void handleCheckEditSpam()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{checkingEditSpam ? t('scanning') : t('spamCheckShort')}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingPostId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              {tCommon('cancel')}
                            </button>
                            <button
                              type="button"
                              disabled={savingPostEdit || checkingEditSpam || editPostBlocked}
                              onClick={() => void handleSavePostEdit(post.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer"
                            >
                              {savingPostEdit
                                ? tCommon('saving')
                                : checkingEditSpam
                                  ? t('checkingLinksBtn')
                                  : editPostBlocked
                                    ? t('linkBlockedBtn')
                                    : tCommon('saveChanges')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
                          {post.title}
                        </h3>
                        <FormattedCommunityText
                          text={post.content}
                          className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                        />
                        <CommunityPostLinksList
                          links={post.links}
                          legacyImageUrl={post.imageUrl}
                        />
                        {post.poll && (
                          <div className="p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3">
                            {(() => {
                              const poll = post.poll!;
                              const totalVotes = poll.options.reduce(
                                (sum, o) => sum + o.voterIds.length,
                                0
                              );
                              const currentMyOptionIds = poll.options
                                .filter((o) => o.voterIds.includes(user.id))
                                .map((o) => o.id);
                              const draftMultiIds =
                                pollMultiSelections[post.id] ?? currentMyOptionIds;

                              return (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <BarChart2
                                        className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"
                                        aria-hidden="true"
                                      />
                                      <span>{poll.question}</span>
                                    </div>
                                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                      {t('pollVotes', { count: totalVotes })}
                                      {poll.allowMultiple ? t('pollMultiSelect') : ''}
                                    </span>
                                  </div>

                                  <div className="space-y-2">
                                    {poll.options.map((opt) => {
                                      const optVotes = opt.voterIds.length;
                                      const pct =
                                        totalVotes > 0
                                          ? Math.round((optVotes / totalVotes) * 100)
                                          : 0;
                                      const isSelected = poll.allowMultiple
                                        ? draftMultiIds.includes(opt.id)
                                        : currentMyOptionIds.includes(opt.id);

                                      return (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          disabled={votingPollId === post.id}
                                          onClick={() => {
                                            if (poll.allowMultiple) {
                                              const next = draftMultiIds.includes(opt.id)
                                                ? draftMultiIds.filter((id) => id !== opt.id)
                                                : [...draftMultiIds, opt.id];
                                              setPollMultiSelections((prev) => ({
                                                ...prev,
                                                [post.id]: next,
                                              }));
                                            } else {
                                              void handleVotePoll(post.id, [opt.id]);
                                            }
                                          }}
                                          className={`relative w-full text-left rounded-lg border px-3 py-2 text-xs overflow-hidden transition-colors cursor-pointer ${
                                            isSelected
                                              ? 'border-emerald-400 dark:border-emerald-700 bg-white dark:bg-slate-900'
                                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300 dark:hover:border-emerald-700'
                                          }`}
                                        >
                                          <motion.div
                                            initial={false}
                                            animate={{ scaleX: pct / 100 }}
                                            transition={{ duration: 0.35, ease: 'easeOut' }}
                                            style={{ transformOrigin: '0% 50%' }}
                                            className={`absolute inset-0 ${
                                              isSelected
                                                ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
                                                : 'bg-slate-200/45 dark:bg-slate-800/45'
                                            }`}
                                          />
                                          <div className="relative flex items-center justify-between gap-2">
                                            <span className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                                              {isSelected && (
                                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                              )}
                                              <span>{opt.text}</span>
                                            </span>
                                            <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                                              {optVotes} ({pct}%)
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {poll.allowMultiple && (
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        disabled={
                                          votingPollId === post.id || draftMultiIds.length === 0
                                        }
                                        onClick={() => void handleVotePoll(post.id, draftMultiIds)}
                                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer transition-colors"
                                      >
                                        {votingPollId === post.id
                                          ? t('savingVote')
                                          : t('submitSelectedChoices')}
                                      </button>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {post.status === 'hidden' && post.moderationReason && (
                          <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
                            {t('moderationNoteBanner', {
                              by: post.moderatedByName || t('adminFallback'),
                              reason: post.moderationReason,
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reactions Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto [&>button]:min-h-[40px] sm:[&>button]:min-h-0 [&>button]:justify-center">
                        {REACTION_OPTIONS.map(({ type, Icon, activeClass }) => {
                          const count = post.reactions.filter((r) => r.type === type).length;
                          const active = myReaction === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => void handleToggleReaction(post.id, type)}
                              aria-pressed={active}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                active
                                  ? activeClass
                                  : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{t(`reactions.${type}`)}</span>
                              {count > 0 && (
                                <span className="font-mono tabular-nums text-[11px]">{count}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {t('commentsCount', { count: post.comments.length })}
                      </div>
                    </div>

                    {/* Comments Thread */}
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {post.comments.length > 0 && (
                        <div className="space-y-2.5">
                          {post.comments.map((comment) => {
                            const isCommentAuthor = comment.authorId === user.id;
                            const canDeleteComment = isCommentAuthor || isAdmin;
                            const isEditingComment = editingCommentId === comment.id;

                            return (
                              <div
                                key={comment.id}
                                className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 px-3.5 py-2.5 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                    {onViewMemberProfile ? (
                                      <button
                                        type="button"
                                        onClick={() => onViewMemberProfile(comment.authorId)}
                                        className="font-semibold text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                                      >
                                        {comment.authorName}
                                      </button>
                                    ) : (
                                      <span className="font-semibold text-slate-900 dark:text-white">
                                        {comment.authorName}
                                      </span>
                                    )}
                                    <span className="font-mono text-slate-500 dark:text-slate-400">
                                      {comment.authorCode}
                                    </span>
                                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                      ·
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                      {formatDateTime(comment.createdAt)}
                                    </span>
                                    {comment.updatedAt && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                          ·
                                        </span>
                                        <span className="text-slate-500 dark:text-slate-400">{t('edited')}</span>
                                      </>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs">
                                    {isCommentAuthor && !isEditingComment && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCommentId(comment.id);
                                          setEditCommentText(comment.content);
                                        }}
                                        className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                                      >
                                        {tCommon('edit')}
                                      </button>
                                    )}
                                    {canDeleteComment && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          requestDeleteComment(
                                            post.id,
                                            comment.id,
                                            comment.authorName
                                          )
                                        }
                                        className="text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                                      >
                                        {isAdmin && !isCommentAuthor ? tCommon('remove') : tCommon('delete')}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isEditingComment ? (
                                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                    <input
                                      type="text"
                                      value={editCommentText}
                                      onChange={(e) => setEditCommentText(e.target.value)}
                                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleSaveCommentEdit(post.id, comment.id)
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                                      >
                                        {tCommon('save')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCommentId(null)}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                      >
                                        {tCommon('cancel')}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <FormattedCommunityText
                                    text={comment.content}
                                    className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {post.commentsLocked && !isAdmin ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
                          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>{t('repliesLockedNotice')}</span>
                        </div>
                      ) : user.communityMuted ? null : (
                        <div className="space-y-1.5 pt-1">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void handleAddComment(post.id);
                              setCommentMentionTarget(null);
                              if (commentEmojiPostId === post.id) setCommentEmojiPostId(null);
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              maxLength={2000}
                              value={commentDrafts[post.id] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCommentDrafts((prev) => ({
                                  ...prev,
                                  [post.id]: val,
                                }));
                                const q = extractTrailingMentionQuery(val);
                                setCommentMentionTarget(
                                  q !== null ? { postId: post.id, query: q } : null
                                );
                              }}
                              placeholder={
                                post.commentsLocked
                                  ? t('placeholderCommentLocked')
                                  : t('placeholderComment')
                              }
                              className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCommentEmojiPostId((prev) =>
                                  prev === post.id ? null : post.id
                                )
                              }
                              title={t('insertEmojiTitle')}
                              aria-label={t('insertEmojiAria')}
                              className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 rounded-xl border transition-colors cursor-pointer shrink-0 flex items-center justify-center ${
                                commentEmojiPostId === post.id
                                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Smile className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="submit"
                              disabled={
                                !(commentDrafts[post.id] || '').trim() ||
                                submittingCommentPostId === post.id
                              }
                              className="min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                            >
                              {submittingCommentPostId === post.id ? t('postingComment') : t('postComment')}
                            </button>
                          </form>
                          {commentEmojiPostId === post.id && (
                            <CommunityEmojiPicker
                              compact
                              onSelect={(emoji) =>
                                setCommentDrafts((prev) => ({
                                  ...prev,
                                  [post.id]: `${prev[post.id] || ''}${emoji}`,
                                }))
                              }
                            />
                          )}
                          {commentMentionTarget?.postId === post.id &&
                            filterMentionMatches(commentMentionTarget.query).length > 0 && (
                              <div
                                role="listbox"
                                aria-label={t('mentionCommentAria')}
                                className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/88 dark:bg-slate-900/88 backdrop-blur-md shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-y-auto"
                              >
                                {filterMentionMatches(commentMentionTarget.query).map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      setCommentDrafts((prev) => ({
                                        ...prev,
                                        [post.id]: applyMentionSelection(
                                          prev[post.id] || '',
                                          m.name
                                        ),
                                      }));
                                      setCommentMentionTarget(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-2 cursor-pointer"
                                  >
                                    <span className="font-medium text-slate-900 dark:text-white">
                                      @{m.name}
                                    </span>
                                    <span className="font-mono text-slate-500 dark:text-slate-400">
                                      {m.memberCode}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </div>

      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : undefined}
        busy={modalBusy}
        onConfirm={
          modal?.mode === 'confirm'
            ? async (val) => {
                setModalBusy(true);
                try {
                  await modal.run(val);
                } finally {
                  setModalBusy(false);
                }
              }
            : undefined
        }
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
