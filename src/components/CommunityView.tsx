'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowLeft,
  Award,
  BarChart2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  HeartHandshake,
  Info,
  Lightbulb,
  Link2,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  ShieldAlert,
  ShieldCheck,
  Smile,
  SmilePlus,
  Sparkles,
  ThumbsUp,
  Trash2,
  Unlock,
  User,
  UserCheck,
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
  ConversationThreadSummary,
  PrivateMessage,
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
  parseTextWithLinks,
} from '../utils/communityLinks.ts';
import { formatDateTime } from '../utils/format.ts';
import { isTopModal, registerTopModal, useBodyScrollLock } from '../utils/modalLock.ts';
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
  onUnreadDmChange?: (count: number) => void;
  onRefreshWorkspace?: () => Promise<unknown>;
  onViewMemberProfile?: (memberId: string) => void;
  initialDmPeer?: DirectoryMember | null;
  onConsumeInitialDmPeer?: () => void;
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

const DM_REACTION_EMOJIS = ['❤️', '😆', '😮', '😢', '😠', '👍'] as const;

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
  onUnreadDmChange,
  onRefreshWorkspace,
  onViewMemberProfile,
  initialDmPeer,
  onConsumeInitialDmPeer,
}: CommunityViewProps) {
  const t = useTranslations('Community');
  const tCommon = useTranslations('Common');
  const locale = useLocale() as AppLocale;
  const isAdmin = user.role === 'admin';
  const [activeTab, setActiveTab] = useState<'feed' | 'messages'>('feed');

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

  // Private Messaging State
  const [threads, setThreads] = useState<ConversationThreadSummary[]>([]);
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState('');

  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<DirectoryMember | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmEmojiOpen, setDmEmojiOpen] = useState(false);
  const [dmInfoOpen, setDmInfoOpen] = useState(false);
  const [activeMsgActionsId, setActiveMsgActionsId] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<'all' | 'unread'>('all');
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    senderId: string;
    senderName: string;
    body: string;
  } | null>(null);
  const [editingDmId, setEditingDmId] = useState<string | null>(null);
  const [reactionBarMsgId, setReactionBarMsgId] = useState<string | null>(null);
  const [dmSearchOpen, setDmSearchOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchIdx, setDmSearchIdx] = useState(0);
  const [peerTyping, setPeerTyping] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mobileChatEndRef = useRef<HTMLDivElement | null>(null);
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const desktopComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const typingClearTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<{ peerId: string; at: number } | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);
  const selectedPeerIdRef = useRef<string | null>(null);
  selectedPeerIdRef.current = selectedPeerId;

  const [mounted, setMounted] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileDmTokenRef = useRef<symbol | null>(null);
  if (!mobileDmTokenRef.current) {
    mobileDmTokenRef.current = Symbol('MobilePrivateMessageModal');
  }

  const tRef = useRef(t);
  tRef.current = t;
  const onUnreadDmChangeRef = useRef(onUnreadDmChange);
  onUnreadDmChangeRef.current = onUnreadDmChange;

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const syncViewport = () => setIsMobileViewport(mq.matches);
    syncViewport();
    mq.addEventListener('change', syncViewport);
    return () => mq.removeEventListener('change', syncViewport);
  }, []);

  const handleCloseDirectMessage = useCallback(() => {
    setSelectedPeerId(null);
    setSelectedPeer(null);
    setDmError(null);
    setDmEmojiOpen(false);
    setDmInfoOpen(false);
    setActiveMsgActionsId(null);
    setReplyingTo(null);
    setEditingDmId(null);
    setReactionBarMsgId(null);
    setDmSearchOpen(false);
    setDmSearchQuery('');
    setDmSearchIdx(0);
    setPeerTyping(false);
    setShowScrollToBottom(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('dm')) {
        url.searchParams.delete('dm');
        window.history.replaceState({ page: url.searchParams.get('page') || 'community' }, '', url);
      }
    }
  }, []);

  const mobileDmModalOpen = isMobileViewport && Boolean(selectedPeerId && selectedPeer);
  useBodyScrollLock(mobileDmModalOpen);

  useEffect(() => {
    if (!mobileDmModalOpen || !mobileDmTokenRef.current) return;
    const token = mobileDmTokenRef.current;
    const unregister = registerTopModal(token);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) {
        e.preventDefault();
        e.stopPropagation();
        handleCloseDirectMessage();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [mobileDmModalOpen, handleCloseDirectMessage]);

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

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setThreadsLoading(true);
    try {
      const res = await api.getPrivateThreads();
      setThreads(res.threads);
      setDirectory(res.directory);
      setTotalUnread(res.totalUnread);
      onUnreadDmChangeRef.current?.(res.totalUnread);
    } catch (err) {
      setDmError(err instanceof Error ? err.message : tRef.current('threadsUnavailableDesc'));
    } finally {
      if (!silent) setThreadsLoading(false);
    }
  }, []);

  const loadConversation = useCallback(
    async (peerId: string, silent = false) => {
      if (!silent) setMessagesLoading(true);
      setDmError(null);
      try {
        const res = await api.getPrivateConversation(peerId);
        setSelectedPeer(res.peer);
        setMessages(res.messages);
        await loadThreads(true);
      } catch (err) {
        setDmError(err instanceof Error ? err.message : tRef.current('conversationUnavailableDesc'));
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [loadThreads]
  );

  useEffect(() => {
    void loadPosts(false);
    void loadThreads(false);
    const handleGlobalRefresh = () => {
      void loadPosts(true);
      void loadThreads(true);
      if (selectedPeerIdRef.current) {
        void loadConversation(selectedPeerIdRef.current, true);
      }
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [loadPosts, loadThreads, loadConversation]);

  useEffect(() => {
    const handleCommunity = () => {
      void loadPosts(true);
    };
    const handleDm = (evt: MessageEvent) => {
      void loadThreads(true);
      const currentPeer = selectedPeerIdRef.current;
      if (!currentPeer) return;
      try {
        const data = JSON.parse(evt.data) as { senderId?: string; recipientId?: string };
        if (evt.type === 'dm:received' && data.senderId === currentPeer) {
          setPeerTyping(false);
        }
        if (data.senderId === currentPeer || data.recipientId === currentPeer) {
          void loadConversation(currentPeer, true);
        } else {
          void loadConversation(currentPeer, true);
        }
      } catch {
        void loadConversation(currentPeer, true);
      }
    };

    const handleTyping = (evt: MessageEvent) => {
      const currentPeer = selectedPeerIdRef.current;
      if (!currentPeer) return;
      try {
        const data = JSON.parse(evt.data) as { senderId?: string; isTyping?: boolean };
        if (data.senderId !== currentPeer) return;
        const active = Boolean(data.isTyping);
        setPeerTyping(active);
        if (typingClearTimerRef.current) {
          window.clearTimeout(typingClearTimerRef.current);
          typingClearTimerRef.current = null;
        }
        if (active) {
          typingClearTimerRef.current = window.setTimeout(() => {
            setPeerTyping(false);
            typingClearTimerRef.current = null;
          }, 4500);
        }
      } catch {
        // Ignore malformed typing payload
      }
    };

    const unsubscribe = subscribeRealtimeEvents({
      'community:updated': handleCommunity,
      'members:updated': handleCommunity,
      'dm:received': handleDm,
      'dm:read': handleDm,
      'dm:deleted': handleDm,
      'dm:edited': handleDm,
      'dm:reacted': handleDm,
      'dm:typing': handleTyping,
    });

    return () => {
      if (typingClearTimerRef.current) {
        window.clearTimeout(typingClearTimerRef.current);
      }
      unsubscribe();
    };
  }, [loadPosts, loadThreads, loadConversation]);

  useEffect(() => {
    if (selectedPeerId && !messagesLoading) {
      if (mobileDmModalOpen && mobileChatEndRef.current) {
        mobileChatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (activeTab === 'messages' && chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [activeTab, selectedPeerId, messages.length, messagesLoading, mobileDmModalOpen, peerTyping]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const dmPeerId = params.get('dm');
      if (!dmPeerId) {
        setSelectedPeerId(null);
        setSelectedPeer(null);
        return;
      }
      setActiveTab('messages');
      setSelectedPeerId(dmPeerId);
      const matchedThread = threads.find((t) => t.peerId === dmPeerId);
      const matchedDir = directory.find((d) => d.id === dmPeerId);
      if (matchedDir) {
        setSelectedPeer(matchedDir);
      } else if (matchedThread) {
        setSelectedPeer({
          id: matchedThread.peerId,
          name: matchedThread.peerName,
          role: matchedThread.peerRole,
          memberCode: matchedThread.peerCode,
          photoUrl: matchedThread.peerPhotoUrl,
        });
      }
      void loadConversation(dmPeerId, false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [threads, directory, loadConversation]);

  useEffect(() => {
    if (!initialDmPeer) return;
    setActiveTab('messages');
    setSelectedPeerId(initialDmPeer.id);
    setSelectedPeer(initialDmPeer);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('dm') !== initialDmPeer.id) {
        url.searchParams.set('page', 'community');
        url.searchParams.set('dm', initialDmPeer.id);
        window.history.pushState({ page: 'community', dm: initialDmPeer.id }, '', url);
      }
    }
    void loadConversation(initialDmPeer.id, false);
    onConsumeInitialDmPeer?.();
  }, [initialDmPeer, loadConversation, onConsumeInitialDmPeer]);

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

  const filteredThreads = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return threads.filter((t) => {
      if (threadFilter === 'unread' && t.unreadCount === 0) return false;
      if (!q) return true;
      return (
        t.peerName.toLowerCase().includes(q) ||
        t.peerCode.toLowerCase().includes(q) ||
        t.lastMessageBody.toLowerCase().includes(q)
      );
    });
  }, [threads, memberSearch, threadFilter]);

  const otherDirectoryMembers = useMemo(() => {
    if (threadFilter === 'unread') return [];
    const threadPeerIds = new Set(threads.map((t) => t.peerId));
    const q = memberSearch.trim().toLowerCase();
    return directory.filter((m) => {
      if (threadPeerIds.has(m.id)) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q);
    });
  }, [directory, threads, memberSearch, threadFilter]);

  const activeDirectoryStrip = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return directory
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q))
      .slice(0, 12);
  }, [directory, memberSearch]);

  const dmSearchMatches = useMemo(() => {
    const q = dmSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => m.body.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, dmSearchQuery]);

  const sharedConversationLinks = useMemo(() => {
    const urls = new Set<string>();
    for (const msg of messages) {
      for (const seg of parseTextWithLinks(msg.body)) {
        if (seg.type === 'link') {
          urls.add(seg.value);
        }
      }
    }
    return Array.from(urls);
  }, [messages]);

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

  function focusDmComposer() {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const target = mobileDmModalOpen ? mobileComposerRef.current : desktopComposerRef.current;
      target?.focus();
    });
  }

  function notifyTyping(isTyping: boolean) {
    if (!selectedPeerId) return;
    const now = Date.now();
    if (isTyping) {
      const last = lastTypingSentRef.current;
      if (last && last.peerId === selectedPeerId && now - last.at < 2200) {
        return;
      }
      lastTypingSentRef.current = { peerId: selectedPeerId, at: now };
    } else {
      lastTypingSentRef.current = null;
    }
    void api.sendPrivateTyping(selectedPeerId, isTyping).catch(() => {});
  }

  function jumpToPrivateMessage(messageId: string, highlight = true) {
    const el = messageRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlight) {
      setHighlightedMsgId(messageId);
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMsgId(null);
        highlightTimerRef.current = null;
      }, 1800);
    }
  }

  function handleDmSearchStep(direction: -1 | 1) {
    if (dmSearchMatches.length === 0) return;
    const nextIdx =
      (dmSearchIdx + direction + dmSearchMatches.length) % dmSearchMatches.length;
    setDmSearchIdx(nextIdx);
    jumpToPrivateMessage(dmSearchMatches[nextIdx]);
  }

  function handleStartReply(msg: PrivateMessage) {
    setEditingDmId(null);
    setReplyingTo({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderId === user.id ? user.name : selectedPeer?.name || '',
      body: msg.body,
    });
    setReactionBarMsgId(null);
    setActiveMsgActionsId(null);
    focusDmComposer();
  }

  function handleStartEditDm(msg: PrivateMessage) {
    setReplyingTo(null);
    setEditingDmId(msg.id);
    setMessageInput(msg.body);
    setReactionBarMsgId(null);
    setActiveMsgActionsId(null);
    focusDmComposer();
  }

  function handleCancelReplyOrEdit() {
    if (editingDmId) {
      setEditingDmId(null);
      setMessageInput('');
    }
    setReplyingTo(null);
  }

  async function handleReactPrivateMessage(messageId: string, emoji: string) {
    setReactionBarMsgId(null);
    setActiveMsgActionsId(null);
    const snapshot = messages;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const nextReactions = { ...(m.reactions || {}) };
        if (nextReactions[user.id] === emoji) {
          delete nextReactions[user.id];
        } else {
          nextReactions[user.id] = emoji;
        }
        return { ...m, reactions: nextReactions };
      })
    );
    try {
      const res = await api.reactPrivateMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
    } catch (err) {
      setMessages(snapshot);
      setDmError(err instanceof Error ? err.message : t('sendMessageError'));
    }
  }

  async function handleCopyPrivateMessage(messageId: string, body: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
        setCopiedMsgId(messageId);
        window.setTimeout(() => {
          setCopiedMsgId((curr) => (curr === messageId ? null : curr));
        }, 1800);
      }
    } catch {
      // Clipboard write unavailable
    } finally {
      setActiveMsgActionsId(null);
    }
  }

  function handleOpenDirectMessage(peer: {
    id: string;
    name: string;
    memberCode: string;
    role: UserRole;
    photoUrl?: string;
  }) {
    setActiveTab('messages');
    setSelectedPeerId(peer.id);
    setSelectedPeer(peer);
    setDmEmojiOpen(false);
    setDmInfoOpen(false);
    setActiveMsgActionsId(null);
    setReplyingTo(null);
    setEditingDmId(null);
    setReactionBarMsgId(null);
    setDmSearchOpen(false);
    setDmSearchQuery('');
    setDmSearchIdx(0);
    setPeerTyping(false);
    setShowScrollToBottom(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('dm') !== peer.id) {
        url.searchParams.set('page', 'community');
        url.searchParams.set('dm', peer.id);
        window.history.pushState({ page: 'community', dm: peer.id }, '', url);
      }
    }
    void loadConversation(peer.id, false);
  }

  async function handleSendPrivateMessage(e?: React.FormEvent, overrideBody?: string) {
    e?.preventDefault();
    if (!selectedPeerId) return;
    const isOverride = typeof overrideBody === 'string';
    const body = (isOverride ? overrideBody : messageInput).trim();
    if (!body || sendingMessage) return;

    setSendingMessage(true);
    setDmError(null);
    setDmEmojiOpen(false);
    try {
      if (editingDmId && !isOverride) {
        const res = await api.editPrivateMessage(editingDmId, body);
        setMessages((prev) => prev.map((m) => (m.id === editingDmId ? res.message : m)));
        setEditingDmId(null);
        setMessageInput('');
      } else {
        const replyId = !isOverride ? replyingTo?.id : undefined;
        const res = await api.sendPrivateMessage(selectedPeerId, body, replyId);
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
        if (!isOverride) {
          setMessageInput('');
          setReplyingTo(null);
        }
      }
      notifyTyping(false);
      await loadThreads(true);
    } catch (err) {
      setDmError(err instanceof Error ? err.message : t('sendMessageError'));
    } finally {
      setSendingMessage(false);
    }
  }

  function requestDeletePrivateMessage(messageId: string) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: t('confirmDeleteDmTitle'),
      description: t('confirmDeleteDmDesc'),
      confirmLabel: t('deleteDmBtn'),
      run: async () => {
        setDmError(null);
        try {
          await api.deletePrivateMessage(messageId);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          if (editingDmId === messageId) {
            setEditingDmId(null);
            setMessageInput('');
          }
          if (replyingTo?.id === messageId) {
            setReplyingTo(null);
          }
          await loadThreads(true);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: t('dmDeletedTitle'),
            description: t('dmDeletedDesc'),
          });
        } catch (err) {
          setDmError(err instanceof Error ? err.message : t('dmDeleteFailedDesc'));
          setModal({
            mode: 'notice',
            tone: 'red',
            title: t('deleteFailedTitle'),
            description: err instanceof Error ? err.message : t('dmDeleteFailedDesc'),
          });
        }
      },
    });
  }

  function renderDmMessageBody(body: string, mine: boolean) {
    const query = dmSearchOpen ? dmSearchQuery.trim() : '';
    const renderHighlightedText = (text: string, keyPrefix: string) => {
      if (!query) return text;
      const lowerText = text.toLowerCase();
      const lowerQ = query.toLowerCase();
      const parts: React.ReactNode[] = [];
      let cursor = 0;
      let hit = lowerText.indexOf(lowerQ, cursor);
      let partIdx = 0;
      while (hit !== -1) {
        if (hit > cursor) {
          parts.push(text.slice(cursor, hit));
        }
        parts.push(
          <mark
            key={`${keyPrefix}-m-${partIdx++}`}
            className={
              mine
                ? 'bg-amber-300 text-slate-950 rounded px-0.5'
                : 'bg-amber-200 dark:bg-amber-500/40 text-slate-950 dark:text-white rounded px-0.5'
            }
          >
            {text.slice(hit, hit + query.length)}
          </mark>
        );
        cursor = hit + query.length;
        hit = lowerText.indexOf(lowerQ, cursor);
      }
      if (cursor < text.length) {
        parts.push(text.slice(cursor));
      }
      return parts.length > 0 ? parts : text;
    };

    const segments = parseTextWithLinks(body);
    return segments.map((seg, idx) =>
      seg.type === 'link' ? (
        <a
          key={`seg-${idx}`}
          href={seg.value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline underline-offset-2 break-all ${
            mine
              ? 'text-emerald-50 decoration-emerald-200/80 hover:text-white'
              : 'text-emerald-700 dark:text-emerald-400 decoration-emerald-600/40 hover:text-emerald-800 dark:hover:text-emerald-300'
          }`}
        >
          {renderHighlightedText(seg.value, `l-${idx}`)}
        </a>
      ) : (
        <span key={`seg-${idx}`}>{renderHighlightedText(seg.value, `t-${idx}`)}</span>
      )
    );
  }

  function renderMessengerChatPane(isMobileModal: boolean) {
    if (!selectedPeerId || !selectedPeer) return null;

    let lastOutgoingMsgId: string | null = null;
    let lastOutgoingReadMsgId: string | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.senderId === user.id) {
        if (!lastOutgoingMsgId) lastOutgoingMsgId = m.id;
        if (!lastOutgoingReadMsgId && m.readAt) lastOutgoingReadMsgId = m.id;
      }
      if (lastOutgoingMsgId && lastOutgoingReadMsgId) break;
    }

    const hasDraft = messageInput.trim().length > 0;
    const scrollRef = isMobileModal ? mobileScrollRef : desktopScrollRef;
    const endRef = isMobileModal ? mobileChatEndRef : chatEndRef;
    const composerRef = isMobileModal ? mobileComposerRef : desktopComposerRef;
    const activeSearchMsgId = dmSearchMatches[dmSearchIdx] || null;

    const formatDivider = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const now = new Date();
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`;
      const timeStr = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(d);
      if (dayKey === todayKey) return `${t('todayLabel')} · ${timeStr}`;
      if (dayKey === yestKey) return `${t('yesterdayLabel')} · ${timeStr}`;
      const dateStr = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(d);
      return `${dateStr}, ${timeStr}`;
    };

    const handleCanvasScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 180);
    };

    return (
      <>
        {/* Messenger Header */}
        <header
          className={`shrink-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-[0_1px_6px_-4px_rgba(15,23,42,0.12)] ${
            isMobileModal ? 'pt-[env(safe-area-inset-top)]' : ''
          }`}
        >
          <div className={`${isMobileModal ? 'px-2.5 py-2 gap-2' : 'px-4 py-2.5 gap-3'} flex items-center justify-between`}>
            <div className={`flex items-center min-w-0 flex-1 ${isMobileModal ? 'gap-2' : 'gap-3'}`}>
              {isMobileModal && (
                <button
                  type="button"
                  onClick={handleCloseDirectMessage}
                  aria-label={tCommon('back')}
                  className="w-10 h-10 rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800 active:scale-95 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.25]" aria-hidden="true" />
                </button>
              )}

              <div className="relative shrink-0">
                <AvatarBadge
                  name={selectedPeer.name}
                  photoUrl={selectedPeer.photoUrl}
                  size="md"
                  shape="circle"
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950"
                />
              </div>

              <div className="min-w-0 flex-1">
                <h3
                  id={isMobileModal ? 'mobile-dm-modal-title' : undefined}
                  className="text-[14.5px] font-semibold text-slate-950 dark:text-white truncate leading-tight"
                >
                  {selectedPeer.name}
                </h3>
                {peerTyping ? (
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                    {t('typingLabel', { name: selectedPeer.name.split(' ')[0] || selectedPeer.name })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate mt-0.5">
                    <Lock className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="font-mono shrink-0">{selectedPeer.memberCode}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize truncate">{translateRoleLabel(selectedPeer.role, locale)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDmSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) {
                      setDmSearchQuery('');
                      setDmSearchIdx(0);
                    }
                    return next;
                  });
                }}
                title={t('searchChatAria')}
                aria-label={t('searchChatAria')}
                aria-expanded={dmSearchOpen}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  dmSearchOpen
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#F0F2F5] dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <Search className="w-4 h-4" aria-hidden="true" />
              </button>

              {onViewMemberProfile && (
                <button
                  type="button"
                  onClick={() => {
                    const peerId = selectedPeer.id;
                    if (isMobileModal) {
                      handleCloseDirectMessage();
                    }
                    onViewMemberProfile(peerId);
                  }}
                  title={t('profileBtn')}
                  aria-label={t('profileBtn')}
                  className={
                    isMobileModal
                      ? 'w-9 h-9 rounded-full bg-[#F0F2F5] dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center cursor-pointer transition-colors'
                      : 'h-9 px-3 rounded-full bg-[#F0F2F5] dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer transition-colors'
                  }
                >
                  <User className="w-4 h-4" aria-hidden="true" />
                  {!isMobileModal && <span>{t('profileBtn')}</span>}
                </button>
              )}

              <button
                type="button"
                onClick={() => setDmInfoOpen((prev) => !prev)}
                title={t('chatInfoAria')}
                aria-label={t('chatInfoAria')}
                aria-expanded={dmInfoOpen}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  dmInfoOpen
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#F0F2F5] dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <Info className="w-4 h-4" aria-hidden="true" />
              </button>

              {isMobileModal && (
                <button
                  type="button"
                  onClick={handleCloseDirectMessage}
                  aria-label={tCommon('close')}
                  className="w-9 h-9 rounded-full text-slate-500 dark:text-slate-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible In-Conversation Search Bar */}
          {dmSearchOpen && (
            <div className="px-3.5 py-2 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="search"
                  autoFocus
                  value={dmSearchQuery}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDmSearchQuery(nextVal);
                    setDmSearchIdx(0);
                    const q = nextVal.trim().toLowerCase();
                    if (q) {
                      const firstHit = messages.find((m) => m.body.toLowerCase().includes(q));
                      if (firstHit) {
                        window.requestAnimationFrame(() => jumpToPrivateMessage(firstHit.id, false));
                      }
                    }
                  }}
                  placeholder={t('searchChatPlaceholder')}
                  className="w-full h-8 pl-8 pr-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              {dmSearchQuery.trim() && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  {dmSearchMatches.length > 0
                    ? t('searchMatches', { current: dmSearchIdx + 1, total: dmSearchMatches.length })
                    : t('noSearchMatches')}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={dmSearchMatches.length === 0}
                  onClick={() => handleDmSearchStep(-1)}
                  aria-label="Previous match"
                  className="w-7 h-7 rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={dmSearchMatches.length === 0}
                  onClick={() => handleDmSearchStep(1)}
                  aria-label="Next match"
                  className="w-7 h-7 rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDmSearchOpen(false);
                    setDmSearchQuery('');
                    setDmSearchIdx(0);
                  }}
                  aria-label={tCommon('close')}
                  className="w-7 h-7 rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Messenger Conversation Info Drawer */}
          {dmInfoOpen && (
            <div className="px-4 py-2.5 bg-emerald-50/50 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-medium">{t('verifiedMemberBadge')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500 dark:text-slate-400">{t('encryptedDirectChat')}</span>
                </div>
                <span className="font-mono text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                  {t('aesBadge')}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('sharedLinksLabel', { count: sharedConversationLinks.length })}</span>
                </div>
                {sharedConversationLinks.length === 0 ? (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{t('noSharedLinks')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {sharedConversationLinks.slice(0, 6).map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 truncate max-w-[220px]"
                      >
                        <Link2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{getCommunityLinkHost(url)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {dmError && (
          <div className="shrink-0 px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{dmError}</span>
          </div>
        )}

        {/* Scrollable Message Canvas + Floating Scroll-to-Bottom */}
        <div className="relative flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-950">
          <div
            ref={scrollRef}
            onScroll={handleCanvasScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-subtle px-3.5 py-4 flex flex-col"
          >
            {messagesLoading ? (
              <div className="space-y-3.5 my-auto px-1">
                <div className="flex items-end gap-2">
                  <Skeleton width={28} height={28} circle />
                  <Skeleton height={40} width="64%" borderRadius={20} />
                </div>
                <div className="flex justify-end">
                  <Skeleton height={44} width="58%" borderRadius={20} />
                </div>
                <div className="flex items-end gap-2">
                  <Skeleton width={28} height={28} circle />
                  <Skeleton height={36} width="50%" borderRadius={20} />
                </div>
              </div>
            ) : (
              <>
                {/* Messenger Centered Peer Intro */}
                <div className="pt-3 pb-6 px-4 flex flex-col items-center text-center space-y-2 shrink-0">
                  <AvatarBadge
                    name={selectedPeer.name}
                    photoUrl={selectedPeer.photoUrl}
                    size="xl"
                    shape="circle"
                  />
                  <div>
                    <h4 className="text-[15.5px] font-bold text-slate-950 dark:text-white">
                      {selectedPeer.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {selectedPeer.memberCode} · {translateRoleLabel(selectedPeer.role, locale)} · {t('verifiedMemberBadge')}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-emerald-50/70 dark:bg-slate-900 border border-emerald-200/70 dark:border-slate-800 px-3 py-1 rounded-full">
                    <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>{t('encryptedDirectChat')} · {t('aesBadge')}</span>
                  </span>
                  {messages.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 max-w-[260px]">
                      {t('noMessagesYet', { name: selectedPeer.name })}
                    </p>
                  )}
                </div>

                {/* Grouped Messenger Bubbles */}
                <div className="space-y-0.5 mt-auto">
                  {messages.map((msg, idx) => {
                    const mine = msg.senderId === user.id;
                    const prev = idx > 0 ? messages[idx - 1] : null;
                    const next = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const msgMs = new Date(msg.createdAt).getTime();
                    const prevMs = prev ? new Date(prev.createdAt).getTime() : 0;
                    const nextMs = next ? new Date(next.createdAt).getTime() : 0;

                    const showDivider =
                      idx === 0 ||
                      (Number.isFinite(msgMs) && Number.isFinite(prevMs) && msgMs - prevMs > 15 * 60 * 1000);
                    const nextHasDivider =
                      next !== null &&
                      Number.isFinite(nextMs) &&
                      Number.isFinite(msgMs) &&
                      nextMs - msgMs > 15 * 60 * 1000;

                    const groupedPrev =
                      !showDivider &&
                      prev !== null &&
                      prev.senderId === msg.senderId &&
                      msgMs - prevMs <= 5 * 60 * 1000 &&
                      !msg.replyTo;
                    const groupedNext =
                      !nextHasDivider &&
                      next !== null &&
                      next.senderId === msg.senderId &&
                      nextMs - msgMs <= 5 * 60 * 1000 &&
                      !next.replyTo;

                    const isStandaloneThumb = msg.body.trim() === '👍' && !msg.replyTo;
                    const bubbleRadii = mine
                      ? groupedPrev && groupedNext
                        ? 'rounded-[20px] rounded-tr-[5px] rounded-br-[5px]'
                        : groupedPrev
                          ? 'rounded-[20px] rounded-tr-[5px]'
                          : groupedNext
                            ? 'rounded-[20px] rounded-br-[5px]'
                            : 'rounded-[20px]'
                      : groupedPrev && groupedNext
                        ? 'rounded-[20px] rounded-tl-[5px] rounded-bl-[5px]'
                        : groupedPrev
                          ? 'rounded-[20px] rounded-tl-[5px]'
                          : groupedNext
                            ? 'rounded-[20px] rounded-bl-[5px]'
                            : 'rounded-[20px]';

                    const isSelected = activeMsgActionsId === msg.id;
                    const showReactionPicker = reactionBarMsgId === msg.id;
                    const showSeenAvatar = msg.id === lastOutgoingReadMsgId;
                    const showSentBadge = msg.id === lastOutgoingMsgId && !msg.readAt;
                    const isHighlighted =
                      highlightedMsgId === msg.id || activeSearchMsgId === msg.id;

                    const reactionEntries = msg.reactions
                      ? Object.entries(msg.reactions).reduce<
                          Array<{ emoji: string; count: number; byMe: boolean }>
                        >((acc, [uid, emoji]) => {
                          const existing = acc.find((item) => item.emoji === emoji);
                          if (existing) {
                            existing.count += 1;
                            if (uid === user.id) existing.byMe = true;
                          } else {
                            acc.push({ emoji, count: 1, byMe: uid === user.id });
                          }
                          return acc;
                        }, [])
                      : [];
                    const hasReactions = reactionEntries.length > 0;
                    const totalReactionCount = reactionEntries.reduce((s, r) => s + r.count, 0);

                    return (
                      <div
                        key={msg.id}
                        ref={(el) => {
                          messageRefs.current[msg.id] = el;
                        }}
                      >
                        {showDivider && (
                          <div className="py-3 text-center">
                            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                              {formatDivider(msg.createdAt)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`group/dm relative flex items-end gap-2 ${
                            mine ? 'justify-end' : 'justify-start'
                          } ${hasReactions ? 'mb-3.5' : groupedNext ? 'mb-[2px]' : 'mb-2.5'}`}
                        >
                          {!mine && (
                            <div className="w-7 shrink-0 flex items-end justify-center">
                              {!groupedNext && (
                                <AvatarBadge
                                  name={selectedPeer.name}
                                  photoUrl={selectedPeer.photoUrl}
                                  size="sm"
                                  shape="circle"
                                />
                              )}
                            </div>
                          )}

                          {/* Desktop Hover Action Strip (Left side for outgoing) */}
                          {mine && (
                            <div
                              className={`hidden sm:flex items-center gap-0.5 transition-opacity shrink-0 mb-1 ${
                                showReactionPicker || isSelected
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover/dm:opacity-100 focus-within:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => requestDeletePrivateMessage(msg.id)}
                                title={t('unsendAction')}
                                aria-label={t('unsendAction')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditDm(msg)}
                                title={tCommon('edit')}
                                aria-label={tCommon('edit')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartReply(msg)}
                                title={t('replyAction')}
                                aria-label={t('replyAction')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <Reply className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setReactionBarMsgId((curr) => (curr === msg.id ? null : msg.id))
                                }
                                title={t('reactAria')}
                                aria-label={t('reactAria')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <SmilePlus className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          )}

                          {/* Bubble + Quoted Reply + Overlapping Reaction Badge Column */}
                          <div
                            className={`relative flex flex-col max-w-[78%] sm:max-w-[72%] ${
                              mine ? 'items-end' : 'items-start'
                            }`}
                          >
                            {/* Floating Messenger Reaction Picker Pill */}
                            {showReactionPicker && (
                              <div
                                role="group"
                                aria-label={t('reactAria')}
                                className={`absolute -top-11 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg ${
                                  mine ? 'right-0' : 'left-0'
                                }`}
                              >
                                {DM_REACTION_EMOJIS.map((emoji) => {
                                  const picked = msg.reactions?.[user.id] === emoji;
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => void handleReactPrivateMessage(msg.id, emoji)}
                                      className={`w-8 h-8 rounded-full text-lg flex items-center justify-center transition-transform hover:scale-125 cursor-pointer ${
                                        picked ? 'bg-emerald-100 dark:bg-emerald-950/80 ring-1 ring-emerald-500/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Quoted Reply Preview Above Bubble */}
                            {msg.replyTo && (
                              <button
                                type="button"
                                onClick={() => jumpToPrivateMessage(msg.replyTo!.messageId)}
                                className={`mb-1 px-3 py-1.5 rounded-2xl text-left text-[11.5px] max-w-full border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                                  mine ? 'self-end' : 'self-start'
                                }`}
                              >
                                <span className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  <Reply className="w-3 h-3 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{msg.replyTo.senderName}</span>
                                </span>
                                <span className="block truncate opacity-80 mt-0.5">
                                  {msg.replyTo.bodyPreview}
                                </span>
                              </button>
                            )}

                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setReactionBarMsgId(null);
                                setActiveMsgActionsId((curr) => (curr === msg.id ? null : msg.id));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setActiveMsgActionsId((curr) => (curr === msg.id ? null : msg.id));
                                }
                              }}
                              title={formatDateTime(msg.createdAt)}
                              className={`text-left w-fit max-w-full cursor-pointer transition-all active:scale-[0.99] focus:outline-none ${
                                isHighlighted
                                  ? 'ring-2 ring-amber-400 ring-offset-2 dark:ring-offset-slate-950'
                                  : ''
                              } ${
                                isStandaloneThumb
                                  ? 'text-4xl leading-none px-1 py-0.5 bg-transparent rounded-xl'
                                  : `px-3.5 py-2.5 sm:py-2 text-[15px] sm:text-[14px] leading-snug whitespace-pre-wrap break-words ${bubbleRadii} ${
                                      mine
                                        ? 'bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-xs'
                                        : 'bg-[#F0F2F5] dark:bg-[#242526] text-[#050505] dark:text-[#E4E6EB]'
                                    }`
                              }`}
                            >
                              {renderDmMessageBody(msg.body, mine)}
                              {msg.editedAt && !isStandaloneThumb && (
                                <span
                                  className={`ml-1.5 text-[10px] italic ${
                                    mine ? 'text-emerald-100/85' : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  ({t('editedLabel')})
                                </span>
                              )}
                            </div>

                            {/* Overlapping Messenger Reaction Badges */}
                            {hasReactions && (
                              <div
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 -mt-2 z-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs text-[11px] ${
                                  mine ? 'self-end mr-1.5' : 'self-start ml-1.5'
                                }`}
                              >
                                {reactionEntries.map((r) => (
                                  <button
                                    key={r.emoji}
                                    type="button"
                                    onClick={() => void handleReactPrivateMessage(msg.id, r.emoji)}
                                    className={`inline-flex items-center leading-none cursor-pointer rounded-full px-0.5 ${
                                      r.byMe ? 'ring-1 ring-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/50' : ''
                                    }`}
                                  >
                                    <span>{r.emoji}</span>
                                  </button>
                                ))}
                                {totalReactionCount > 1 && (
                                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 pl-0.5 pr-0.5 tabular-nums">
                                    {totalReactionCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Desktop Hover Action Strip (Right side for incoming) */}
                          {!mine && (
                            <div
                              className={`hidden sm:flex items-center gap-0.5 transition-opacity shrink-0 mb-1 ${
                                showReactionPicker || isSelected
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover/dm:opacity-100 focus-within:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setReactionBarMsgId((curr) => (curr === msg.id ? null : msg.id))
                                }
                                title={t('reactAria')}
                                aria-label={t('reactAria')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <SmilePlus className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartReply(msg)}
                                title={t('replyAction')}
                                aria-label={t('replyAction')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                <Reply className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyPrivateMessage(msg.id, msg.body)}
                                title={copiedMsgId === msg.id ? t('copiedLabel') : t('copyAction')}
                                aria-label={t('copyAction')}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                {copiedMsgId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Tap-Revealed Metadata & Touch Quick Action Chips */}
                        {isSelected && (
                          <div
                            className={`flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mb-2 ${
                              mine ? 'justify-end pr-1' : 'justify-start pl-9'
                            }`}
                          >
                            <span>{formatDateTime(msg.createdAt)}</span>
                            {mine && msg.readAt && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                · {t('seenLabel')}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setReactionBarMsgId((curr) => (curr === msg.id ? null : msg.id))
                              }
                              className="min-h-[24px] px-2 inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                            >
                              <SmilePlus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{t('reactAria')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartReply(msg)}
                              className="min-h-[24px] px-2 inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                            >
                              <Reply className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{t('replyAction')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyPrivateMessage(msg.id, msg.body)}
                              className="min-h-[24px] px-2 inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedMsgId === msg.id ? t('copiedLabel') : t('copyAction')}</span>
                            </button>
                            {mine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDm(msg)}
                                  className="min-h-[24px] px-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{tCommon('edit')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeletePrivateMessage(msg.id)}
                                  className="min-h-[24px] px-2 inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-medium cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>{t('unsendAction')}</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {showSeenAvatar && (
                          <div
                            className="flex justify-end items-center gap-1 pr-0.5 -mt-1.5 mb-2"
                            title={t('readAt', { date: formatDateTime(msg.readAt!) })}
                          >
                            <AvatarBadge
                              name={selectedPeer.name}
                              photoUrl={selectedPeer.photoUrl}
                              size="xs"
                              shape="circle"
                            />
                          </div>
                        )}

                        {showSentBadge && (
                          <div
                            className="flex justify-end items-center pr-0.5 -mt-1.5 mb-2"
                            title={t('sentAria')}
                          >
                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[2.6]" aria-label={t('sentAria')} />
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Live Incoming Typing Bubble */}
                  {peerTyping && (
                    <div
                      aria-label={t('typingLabel', { name: selectedPeer.name })}
                      className="flex items-end gap-2 justify-start mt-1 mb-2"
                    >
                      <div className="w-7 shrink-0 flex items-end justify-center">
                        <AvatarBadge
                          name={selectedPeer.name}
                          photoUrl={selectedPeer.photoUrl}
                          size="sm"
                          shape="circle"
                        />
                      </div>
                      <div className="px-3.5 py-2.5 rounded-[20px] bg-[#F0F2F5] dark:bg-[#242526] inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <div ref={endRef} className="h-1 shrink-0" />
          </div>

          {/* Floating Scroll-to-Latest Button */}
          {showScrollToBottom && !messagesLoading && (
            <button
              type="button"
              onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
              aria-label={t('scrollToBottomAria')}
              title={t('scrollToBottomAria')}
              className="absolute bottom-3 right-4 z-20 w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-700 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            >
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Reply / Edit Banner Above Composer */}
        {(replyingTo || editingDmId) && (
          <div className="shrink-0 px-3.5 py-2 border-t border-slate-200/80 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex items-start gap-2">
              {editingDmId ? (
                <Edit3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Reply className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                  {editingDmId
                    ? t('editingMessage')
                    : t('replyingTo', { name: replyingTo?.senderName || '' })}
                </div>
                {replyingTo && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px] sm:max-w-[380px]">
                    {replyingTo.body}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelReplyOrEdit}
              aria-label={tCommon('cancel')}
              className="w-7 h-7 rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Messenger Emoji Tray */}
        {dmEmojiOpen && (
          <div className="shrink-0 px-3.5 py-2 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950">
            <CommunityEmojiPicker
              compact
              onSelect={(emoji) =>
                insertEmojiAtCursor(emoji, composerRef.current, messageInput, setMessageInput)
              }
            />
          </div>
        )}

        {/* Messenger Pill Composer */}
        <form
          onSubmit={handleSendPrivateMessage}
          className={`shrink-0 border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md flex items-end ${
            isMobileModal
              ? 'px-2.5 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] gap-1.5'
              : 'px-3.5 py-2.5 gap-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setDmEmojiOpen((prev) => !prev)}
            title={t('emojiBtn')}
            aria-label={t('emojiBtn')}
            className={`${
              isMobileModal ? 'w-10 h-10' : 'w-9 h-9'
            } rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              dmEmojiOpen
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800'
            }`}
          >
            <Smile className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex-1 rounded-[22px] bg-[#F0F2F5] dark:bg-[#242526] px-4 py-1 flex items-center">
            <textarea
              ref={composerRef}
              rows={1}
              maxLength={3000}
              value={messageInput}
              onChange={(e) => {
                const val = e.target.value;
                setMessageInput(val);
                notifyTyping(val.trim().length > 0 && !editingDmId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && (replyingTo || editingDmId)) {
                  e.preventDefault();
                  handleCancelReplyOrEdit();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !isMobileModal) {
                  e.preventDefault();
                  void handleSendPrivateMessage();
                }
              }}
              placeholder={
                isMobileModal
                  ? t('dmMobilePlaceholder', { name: selectedPeer.name })
                  : t('dmPlaceholder', { name: selectedPeer.name })
              }
              className={`w-full bg-transparent leading-snug text-slate-950 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none resize-none ${
                isMobileModal
                  ? 'min-h-[36px] max-h-28 py-1.5 text-[16px]'
                  : 'max-h-24 py-1 text-[14px]'
              }`}
            />
          </div>

          {hasDraft || editingDmId ? (
            <button
              type="submit"
              disabled={sendingMessage || !hasDraft}
              aria-label={sendingMessage ? t('sending') : t('send')}
              className={`${
                isMobileModal ? 'w-10 h-10' : 'w-9 h-9'
              } rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white flex items-center justify-center shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer`}
            >
              {sendingMessage ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : editingDmId ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <SendHorizontal className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={sendingMessage}
              onClick={() => void handleSendPrivateMessage(undefined, '👍')}
              title={t('sendThumbsUpAria')}
              aria-label={t('sendThumbsUpAria')}
              className={`${
                isMobileModal ? 'w-10 h-10' : 'w-9 h-9'
              } rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800 disabled:opacity-45 flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer`}
            >
              {sendingMessage ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <ThumbsUp className="w-5 h-5 fill-emerald-600/15 dark:fill-emerald-400/20" aria-hidden="true" />
              )}
            </button>
          )}
        </form>
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      {/* Top Toolbar: Mode Switch + Primary Action */}
      <div className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('toolbarEyebrow')}</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t('toolbarHeading')}
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <div
            role="tablist"
            aria-label={t('tabsAria')}
            className="flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth max-w-full w-full sm:w-fit items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            {(
              [
                {
                  id: 'feed',
                  label: t('tabFeed'),
                  Icon: MessageSquare,
                  badge: posts.filter((p) => p.status === 'active').length,
                  badgeClass: 'text-slate-500 dark:text-slate-400',
                },
                {
                  id: 'messages',
                  label: t('tabMessages'),
                  Icon: Mail,
                  badge: totalUnread > 0 ? totalUnread : null,
                  badgeClass: 'font-semibold text-emerald-700 dark:text-emerald-400',
                },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(e) => {
                    setActiveTab(tab.id);
                    scrollFilterButtonWithNeighbors(e.currentTarget);
                  }}
                  className={`relative px-3.5 py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="community-main-tab-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-xs"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
                  <span className="relative z-10">{tab.label}</span>
                  {tab.badge !== null && (
                    <span className={`relative z-10 font-mono tabular-nums text-[11px] ${tab.badgeClass}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === 'feed' && !user.communityMuted && (
            <button
              type="button"
              onClick={() => {
                setComposerOpen((prev) => !prev);
              }}
              className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              {composerOpen ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{composerOpen ? t('closeComposer') : t('newPost')}</span>
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* FEED TAB */}
        {activeTab === 'feed' && (
          <motion.div
            key="tab-feed"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="space-y-5"
          >
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
                className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-xs"
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-y"
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
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
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
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
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
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 cursor-pointer transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{t('attachPollBtn')}</span>
                      </button>
                    )}

                    <div className="inline-flex items-center rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 overflow-hidden">
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value as AiRewriteTone)}
                        aria-label={t('aiToneAria')}
                        className="px-2 py-2 bg-transparent text-[11px] font-medium text-indigo-800 dark:text-indigo-200 border-r border-indigo-200 dark:border-indigo-800/70 focus:outline-none cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-700 dark:text-emerald-300 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{checkingNewSpam ? t('scanning') : t('spamLinkCheck')}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComposerOpen(false)}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-xs cursor-pointer transition-all"
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
                  className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    feedCategory === item.id
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                      : 'bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm border border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
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
                className="w-full min-h-[44px] sm:min-h-0 pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Posts Feed */}
          {postsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3"
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
            <div className="amanah-card-violet border rounded-2xl p-10 text-center space-y-3">
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
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
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
                    className={`border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 transition-all duration-200 ${
                      post.status === 'hidden'
                        ? 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/25'
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

                      {/* Author / Message / Admin Controls */}
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
                        {!isAuthor && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenDirectMessage({
                                id: post.authorId,
                                name: post.authorName,
                                memberCode: post.authorCode,
                                role: post.authorRole,
                                photoUrl: post.authorPhotoUrl,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Mail className="w-3 h-3" />
                            <span>{t('messageBtn')}</span>
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
                                    {comment.authorId !== user.id && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenDirectMessage({
                                            id: comment.authorId,
                                            name: comment.authorName,
                                            memberCode: comment.authorCode,
                                            role: comment.authorRole,
                                            photoUrl: comment.authorPhotoUrl,
                                          })
                                        }
                                        className="text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                                      >
                                        {t('messageBtn')}
                                      </button>
                                    )}
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
                              className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                              className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center justify-center ${
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
                              className="min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
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
          </motion.div>
        )}

        {/* PRIVATE MESSAGES TAB (Amanah Emerald/Teal Messenger Style) */}
        {activeTab === 'messages' && (() => {
          const formatThreadTime = (iso?: string) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
            if (diffMin < 1) return 'now';
            if (diffMin < 60) return `${diffMin}m`;
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return `${diffHr}h`;
            const diffDay = Math.floor(diffHr / 24);
            if (diffDay < 7) return `${diffDay}d`;
            return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
              month: 'short',
              day: 'numeric',
            }).format(d);
          };

          return (
            <motion.div
              key="tab-messages"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs grid grid-cols-1 lg:grid-cols-[336px_minmax(0,1fr)] h-[74dvh] min-h-[500px] lg:h-[640px] lg:max-h-[75vh]"
            >
              {/* Left Pane: Messenger Chats List */}
              <aside className="flex border-b lg:border-b-0 lg:border-r border-slate-200/90 dark:border-slate-800 flex-col min-h-0 bg-white dark:bg-slate-950">
                <div className="px-4 pt-3.5 pb-2.5 space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                      {t('chatsTitle')}
                    </h3>
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 px-2 py-0.5 rounded-full">
                      {t('activeCount', { count: directory.length })}
                    </span>
                  </div>

                  {/* Pill Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder={t('findMemberPlaceholder')}
                      className="w-full min-h-[38px] pl-9 pr-3.5 py-1.5 rounded-full border-0 bg-[#F0F2F5] dark:bg-slate-800/90 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/35"
                    />
                  </div>

                  {/* All / Unread Messenger Filter Tabs */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setThreadFilter('all')}
                      className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                        threadFilter === 'all'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800 font-medium'
                      }`}
                    >
                      {t('allTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreadFilter('unread')}
                      className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                        threadFilter === 'unread'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-[#F0F2F5] dark:hover:bg-slate-800 font-medium'
                      }`}
                    >
                      <span>{t('unreadTab')}</span>
                      {totalUnread > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold tabular-nums">
                          {totalUnread}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Horizontal Active People Strip */}
                  {activeDirectoryStrip.length > 0 && threadFilter === 'all' && (
                    <div className="flex items-start gap-2.5 overflow-x-auto no-scrollbar pt-1 pb-0.5">
                      {activeDirectoryStrip.map((member) => {
                        const firstName = member.name.split(' ')[0] || member.name;
                        const active = selectedPeerId === member.id;
                        return (
                          <button
                            key={`strip-${member.id}`}
                            type="button"
                            onClick={() => handleOpenDirectMessage(member)}
                            className="flex flex-col items-center gap-1 w-12 shrink-0 group cursor-pointer"
                          >
                            <div
                              className={`relative rounded-full p-0.5 transition-all ${
                                active
                                  ? 'ring-2 ring-emerald-600 dark:ring-emerald-400'
                                  : 'group-hover:scale-105'
                              }`}
                            >
                              <AvatarBadge
                                name={member.name}
                                photoUrl={member.photoUrl}
                                size="md"
                                shape="circle"
                              />
                              <span
                                aria-hidden="true"
                                className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950"
                              />
                            </div>
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-full leading-tight">
                              {firstName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-subtle px-2 pb-2 space-y-1">
                  {threadsLoading ? (
                    <div className="p-3 space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-1">
                          <Skeleton width={44} height={44} circle />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton width="60%" height={12} />
                            <Skeleton width="82%" height={10} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {filteredThreads.length > 0 && (
                        <div className="space-y-0.5">
                          <div className="px-2.5 pt-1 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {t('recentThreads')}
                          </div>
                          {filteredThreads.map((thread) => {
                            const active = selectedPeerId === thread.peerId;
                            const unread = thread.unreadCount > 0;
                            const relTime = formatThreadTime(thread.lastMessageAt);
                            return (
                              <button
                                key={thread.peerId}
                                type="button"
                                onClick={() =>
                                  handleOpenDirectMessage({
                                    id: thread.peerId,
                                    name: thread.peerName,
                                    memberCode: thread.peerCode,
                                    role: thread.peerRole,
                                    photoUrl: thread.peerPhotoUrl,
                                  })
                                }
                                className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40'
                                    : 'hover:bg-[#F2F3F5] dark:hover:bg-slate-900'
                                }`}
                              >
                                <AvatarBadge
                                  name={thread.peerName}
                                  photoUrl={thread.peerPhotoUrl}
                                  size="lg"
                                  shape="circle"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`text-[13.5px] truncate ${
                                        unread
                                          ? 'font-bold text-slate-950 dark:text-white'
                                          : 'font-semibold text-slate-900 dark:text-slate-100'
                                      }`}
                                    >
                                      {thread.peerName}
                                    </span>
                                    {unread && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                        {thread.unreadCount}
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 text-[12px]">
                                    <p
                                      className={`truncate min-w-0 ${
                                        unread
                                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                          : 'text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      {thread.lastMessageSenderId === user.id ? t('youPrefix') : ''}
                                      {thread.lastMessageBody}
                                    </p>
                                    {relTime && (
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                                        · {relTime}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {otherDirectoryMembers.length > 0 && (
                        <div className="space-y-0.5 pt-2">
                          <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {t('registeredMembers')}
                          </div>
                          {otherDirectoryMembers.map((member) => {
                            const active = selectedPeerId === member.id;
                            return (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => handleOpenDirectMessage(member)}
                                className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40'
                                    : 'hover:bg-[#F2F3F5] dark:hover:bg-slate-900'
                                }`}
                              >
                                <AvatarBadge
                                  name={member.name}
                                  photoUrl={member.photoUrl}
                                  size="md"
                                  shape="circle"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                                    {member.name}
                                  </div>
                                  <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                                    <span className="font-mono">{member.memberCode}</span> ·{' '}
                                    <span className="capitalize">{translateRoleLabel(member.role, locale)}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {filteredThreads.length === 0 && otherDirectoryMembers.length === 0 && (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          {t('noDirMatch')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>

              {/* Right Pane: Desktop Messenger Active Chat */}
              <div className="hidden lg:flex flex-col min-h-0 bg-white dark:bg-slate-950">
                {!selectedPeerId || !selectedPeer ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {t('emptyDmTitle')}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('emptyDmDesc')}
                      </p>
                    </div>
                  </div>
                ) : (
                  renderMessengerChatPane(false)
                )}
              </div>
            </motion.div>
          );
        })()}

      </AnimatePresence>

      {/* Mobile Full-Screen Amanah Messenger Modal (< lg) */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileDmModalOpen && selectedPeer && (
              <motion.div
                key="mobile-dm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-dm-modal-title"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="fixed inset-0 z-[60] lg:hidden flex flex-col h-[100dvh] max-h-[100dvh] w-full bg-white dark:bg-slate-950 overflow-hidden"
              >
                {renderMessengerChatPane(true)}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

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
