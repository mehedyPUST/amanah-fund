'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart2,
  Check,
  CheckCheck,
  Edit3,
  Eye,
  EyeOff,
  HeartHandshake,
  Lightbulb,
  Link2,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smile,
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
import type {
  ActiveMemberDirectoryItem,
  AiRewriteTone,
  AiSpamCheckResult,
  CommunityCategory,
  CommunityPost,
  CommunityPostLink,
  CommunityPostLinkKind,
  CommunityReactionType,
  ConversationThreadSummary,
  FundConfig,
  PrivateMessage,
  PublicUser,
  UserRole,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  extractPostUrlList,
  getCommunityLinkHost,
  getCommunityLinkKindLabel,
  inferCommunityLinkKind,
  isSpamCheckBlockingPost,
  MAX_COMMUNITY_POST_LINKS,
  normalizeCommunityLinkUrl,
} from '../utils/communityLinks.ts';
import { formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import {
  CommunityEmojiPicker,
  CommunityPostLinksList,
  FormattedCommunityText,
} from './CommunityTextWithLinks.tsx';

interface CommunityViewProps {
  user: PublicUser;
  currency?: FundConfig['currency'];
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

const REACTION_OPTIONS: Array<{
  type: CommunityReactionType;
  label: string;
  Icon: typeof ThumbsUp;
  activeClass: string;
}> = [
  {
    type: 'like',
    label: 'Like',
    Icon: ThumbsUp,
    activeClass:
      'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  },
  {
    type: 'support',
    label: 'Support',
    Icon: HeartHandshake,
    activeClass:
      'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300',
  },
  {
    type: 'celebrate',
    label: 'Celebrate',
    Icon: Award,
    activeClass:
      'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300',
  },
  {
    type: 'helpful',
    label: 'Helpful',
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
}: {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-xs';

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dims} rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-center shrink-0`}
    >
      {initials || 'AM'}
    </div>
  );
}

export function CommunityView({
  user,
  currency = 'BDT',
  onUnreadDmChange,
  onRefreshWorkspace,
  onViewMemberProfile,
  initialDmPeer,
  onConsumeInitialDmPeer,
}: CommunityViewProps) {
  const isAdmin = user.role === 'admin';
  const [activeTab, setActiveTab] = useState<'feed' | 'messages' | 'members'>('feed');
  const [activeMembersList, setActiveMembersList] = useState<ActiveMemberDirectoryItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [directorySearch, setDirectorySearch] = useState('');

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
  const selectedPeerIdRef = useRef<string | null>(null);
  selectedPeerIdRef.current = selectedPeerId;

  const loadPosts = useCallback(async (silent = false) => {
    if (!silent) setPostsLoading(true);
    try {
      const res = await api.getCommunityPosts();
      setPosts(res.posts);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Community Feed Unavailable',
        description: err instanceof Error ? err.message : 'Failed to load community posts.',
      });
    } finally {
      if (!silent) setPostsLoading(false);
    }
  }, []);

  const loadThreads = useCallback(
    async (silent = false) => {
      if (!silent) setThreadsLoading(true);
      try {
        const res = await api.getPrivateThreads();
        setThreads(res.threads);
        setDirectory(res.directory);
        setTotalUnread(res.totalUnread);
        onUnreadDmChange?.(res.totalUnread);
      } catch (err) {
        setDmError(err instanceof Error ? err.message : 'Failed to load private conversations.');
      } finally {
        if (!silent) setThreadsLoading(false);
      }
    },
    [onUnreadDmChange]
  );

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
        setDmError(err instanceof Error ? err.message : 'Failed to load conversation.');
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [loadThreads]
  );

  const loadActiveMembers = useCallback(async (silent = false) => {
    if (!silent) setMembersLoading(true);
    try {
      const res = await api.getActiveMembers();
      setActiveMembersList(res.members);
    } catch {
      // ignore transient error
    } finally {
      if (!silent) setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts(false);
    void loadThreads(false);
    void loadActiveMembers(false);
  }, [loadPosts, loadThreads, loadActiveMembers]);

  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true });
    const handleCommunity = () => {
      void loadPosts(true);
    };
    const handleDm = (evt: MessageEvent) => {
      void loadThreads(true);
      const currentPeer = selectedPeerIdRef.current;
      if (!currentPeer) return;
      try {
        const data = JSON.parse(evt.data) as { senderId?: string; recipientId?: string };
        if (data.senderId === currentPeer || data.recipientId === currentPeer) {
          void loadConversation(currentPeer, true);
        } else {
          void loadConversation(currentPeer, true);
        }
      } catch {
        void loadConversation(currentPeer, true);
      }
    };

    es.addEventListener('community:updated', handleCommunity);
    es.addEventListener('members:updated', handleCommunity);
    es.addEventListener('dm:received', handleDm);
    es.addEventListener('dm:read', handleDm);
    es.addEventListener('dm:deleted', handleDm);

    return () => {
      es.close();
    };
  }, [loadPosts, loadThreads, loadConversation]);

  useEffect(() => {
    if (activeTab === 'messages' && selectedPeerId && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [activeTab, selectedPeerId, messages.length]);

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
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.peerName.toLowerCase().includes(q) ||
        t.peerCode.toLowerCase().includes(q) ||
        t.lastMessageBody.toLowerCase().includes(q)
    );
  }, [threads, memberSearch]);

  const otherDirectoryMembers = useMemo(() => {
    const threadPeerIds = new Set(threads.map((t) => t.peerId));
    const q = memberSearch.trim().toLowerCase();
    return directory.filter((m) => {
      if (threadPeerIds.has(m.id)) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q);
    });
  }, [directory, threads, memberSearch]);

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
        error: `You can attach up to ${MAX_COMMUNITY_POST_LINKS} links per post.`,
      };
    }
    const parsed = normalizeCommunityLinkUrl(trimmed);
    if (!parsed) {
      return {
        nextList: currentList,
        error: 'Enter a valid http:// or https:// URL to share a photo, video, or web content.',
      };
    }
    const finalUrl = parsed.toString();
    if (currentList.some((item) => item.url === finalUrl)) {
      return {
        nextList: currentList,
        error: 'This link has already been added to the post.',
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
            title: 'Link Safety Check Failed',
            description:
              err instanceof Error ? err.message : 'Unable to verify post links with AI.',
          });
        }
        return null;
      } finally {
        if (reqId === newSpamReqIdRef.current) {
          setCheckingNewSpam(false);
        }
      }
    },
    []
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
            title: 'Link Safety Check Failed',
            description:
              err instanceof Error ? err.message : 'Unable to verify edited post links with AI.',
          });
        }
        return null;
      } finally {
        if (reqId === editSpamReqIdRef.current) {
          setCheckingEditSpam(false);
        }
      }
    },
    []
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
          title: 'Invalid Link URL',
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
          title: 'Invalid Link URL',
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
        title: 'Write a Draft First',
        description: 'Enter a headline or draft message before asking AI to rewrite it.',
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
      setNewRewriteFeedback(
        res.result.improvements.length > 0
          ? res.result.improvements.join(' · ')
          : `Rewritten in ${aiTone} tone.`
      );
      lastNewScanKeyRef.current = '';
      setNewSpamCheckResult(null);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'AI Rewrite Unavailable',
        description:
          err instanceof Error ? err.message : 'Unable to rewrite community post with Groq AI.',
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
        title: 'Invalid Link URL',
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
        title: 'AI Rewrite Unavailable',
        description:
          err instanceof Error ? err.message : 'Unable to rewrite community post with Groq AI.',
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
        title: 'Invalid Link URL',
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
        title: 'Invalid Link URL',
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
        title: 'Unable to Post with Flagged Link',
        description: `${effectiveSpamCheck!.reason} Remove or replace the spam/suspicious link before publishing.`,
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
          title: 'Invalid Community Poll',
          description: 'Attached poll requires a question and at least 2 non-empty options.',
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
      title: 'Publish Community Post?',
      description: 'Confirm publishing this text post to the verified Amanah Member Community.',
      details: [
        { label: 'Topic', value: newCategory },
        { label: 'Headline', value: newTitle.trim() },
        ...(pollPayload ? [{ label: 'Attached Poll', value: pollPayload.question }] : []),
        ...(finalLinks.length > 0
          ? [
              {
                label: 'Links',
                value: `${finalLinks.length} ${finalLinks.length === 1 ? 'link' : 'links'} verified safe`,
              },
            ]
          : []),
      ],
      confirmLabel: 'Publish Post',
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
            title: 'Post Published',
            description: 'Post published to the Amanah Community.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Publish Failed',
            description: err instanceof Error ? err.message : 'Failed to publish post.',
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
        title: 'Poll Vote Failed',
        description: err instanceof Error ? err.message : 'Failed to record poll vote.',
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
        title: 'Invalid Link URL',
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
        title: 'Unable to Save with Flagged Link',
        description: `${effectiveSpamCheck!.reason} Remove or replace the spam/suspicious link before saving.`,
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Save Post Changes?',
      description: 'Confirm saving your edited post content.',
      details: [
        { label: 'Topic', value: editCategory },
        { label: 'Headline', value: editTitle.trim() },
      ],
      confirmLabel: 'Save Changes',
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
            title: 'Post Updated',
            description: 'Your changes have been saved.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Update Failed',
            description: err instanceof Error ? err.message : 'Failed to save changes.',
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
      title: isAdminModeration ? 'Remove Post as Administrator?' : 'Delete Community Post?',
      description: isAdminModeration
        ? `Confirm removing "${post.title}" by ${post.authorName}.`
        : `Delete your post "${post.title}"? This action cannot be undone.`,
      details: [
        { label: 'Author', value: `${post.authorName} (${post.authorCode})` },
        { label: 'Topic', value: post.category },
      ],
      confirmLabel: isAdminModeration ? 'Remove Post' : 'Delete Post',
      ...(isAdminModeration
        ? {
            inputLabel: 'Moderation note sent to author (optional)',
            inputPlaceholder: 'Reason for removing post…',
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
            title: 'Post Deleted',
            description: 'The community post has been removed.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Delete Failed',
            description: err instanceof Error ? err.message : 'Failed to delete post.',
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
        title: 'Reaction Failed',
        description: err instanceof Error ? err.message : 'Failed to update reaction.',
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
        title: 'Comment Failed',
        description: err instanceof Error ? err.message : 'Failed to add comment.',
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
        title: 'Comment Update Failed',
        description: err instanceof Error ? err.message : 'Failed to update comment.',
      });
    }
  }

  function requestDeleteComment(postId: string, commentId: string, authorName: string) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Delete Comment?',
      description: 'Confirm removing this comment from the discussion thread.',
      details: [{ label: 'Author', value: authorName }],
      confirmLabel: 'Delete Comment',
      run: async () => {
        try {
          const res = await api.deleteCommunityComment(postId, commentId);
          setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Comment Removed',
            description: 'The comment has been deleted.',
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Delete Failed',
            description: err instanceof Error ? err.message : 'Failed to delete comment.',
          });
        }
      },
    });
  }

  function requestModeratePost(
    post: CommunityPost,
    action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide' | 'restore'
  ) {
    setModal({
      mode: 'confirm',
      tone: action === 'hide' || action === 'lock' ? 'amber' : 'emerald',
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} Community Post?`,
      description: `Confirm applying moderation action "${action}" to this post.`,
      details: [
        { label: 'Post', value: post.title },
        { label: 'Author', value: `${post.authorName} (${post.authorCode})` },
      ],
      confirmLabel: `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`,
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
            title: 'Moderation Applied',
            description: `Moderation action "${action}" applied.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Moderation Failed',
            description: err instanceof Error ? err.message : 'Moderation action failed.',
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
        ? `Restore Posting for ${authorName}?`
        : `Mute ${authorName} in Community?`,
      description: currentlyMuted
        ? 'Restoring privileges allows this member to create posts and comments again.'
        : 'Muting restricts this member from creating new posts or comments in Community.',
      details: [{ label: 'Member', value: authorName }],
      confirmLabel: currentlyMuted ? 'Unmute Member' : 'Mute Member',
      run: async () => {
        setModerationBusyId(authorId);
        try {
          await api.toggleCommunityMuteMember(authorId, !currentlyMuted);
          await loadPosts(true);
          await onRefreshWorkspace?.();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: currentlyMuted ? 'Member Unmuted' : 'Member Muted',
            description: !currentlyMuted
              ? `${authorName} has been muted from posting or commenting in Community.`
              : `${authorName}'s Community privileges have been restored.`,
          });
        } catch (err) {
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Mute Update Failed',
            description: err instanceof Error ? err.message : 'Failed to update mute status.',
          });
        } finally {
          setModerationBusyId(null);
        }
      },
    });
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

  async function handleSendPrivateMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selectedPeerId) return;
    const body = messageInput.trim();
    if (!body || sendingMessage) return;

    setSendingMessage(true);
    setDmError(null);
    try {
      const res = await api.sendPrivateMessage(selectedPeerId, body);
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setMessageInput('');
      await loadThreads(true);
    } catch (err) {
      setDmError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  }

  function requestDeletePrivateMessage(messageId: string) {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Delete Private Message?',
      description: 'Confirm permanently deleting this encrypted direct message for both participants.',
      confirmLabel: 'Delete Message',
      run: async () => {
        setDmError(null);
        try {
          await api.deletePrivateMessage(messageId);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          await loadThreads(true);
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Message Deleted',
            description: 'The private message has been deleted.',
          });
        } catch (err) {
          setDmError(err instanceof Error ? err.message : 'Failed to delete message.');
          setModal({
            mode: 'notice',
            tone: 'red',
            title: 'Delete Failed',
            description: err instanceof Error ? err.message : 'Failed to delete message.',
          });
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
      {/* Top Toolbar: Mode Switch + Primary Action */}
      <div className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Verified Member Network · AES-256-GCM Direct Chat</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Amanah Member Community
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <div
            role="tablist"
            aria-label="Community views"
            className="flex flex-nowrap overflow-x-auto no-scrollbar max-w-full w-full sm:w-fit items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            {(
              [
                {
                  id: 'feed',
                  label: 'Discussion Feed',
                  Icon: MessageSquare,
                  badge: posts.filter((p) => p.status === 'active').length,
                  badgeClass: 'text-slate-500 dark:text-slate-400',
                },
                {
                  id: 'messages',
                  label: 'Private Messages',
                  Icon: Mail,
                  badge: totalUnread > 0 ? totalUnread : null,
                  badgeClass: 'font-semibold text-indigo-700 dark:text-indigo-400',
                },
                {
                  id: 'members',
                  label: 'Members',
                  Icon: Users,
                  badge:
                    activeMembersList.length > 0
                      ? activeMembersList.length
                      : directory.length + 1,
                  badgeClass: 'text-slate-500 dark:text-slate-400',
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
                  onClick={() => setActiveTab(tab.id)}
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
              <span>{composerOpen ? 'Close Composer' : 'New Post'}</span>
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
                <p className="font-semibold">Community posting privileges are muted</p>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  An administrator has temporarily restricted creating new posts and comments on your
                  account. You may still read discussions and use Private Messages.
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
                    Create Community Post
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Posting as {user.name} · <span className="font-mono">{user.memberCode}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
                  <div>
                    <label
                      htmlFor="post-category"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      Topic
                    </label>
                    <select
                      id="post-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as CommunityCategory)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="post-title"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      Headline
                    </label>
                    <input
                      id="post-title"
                      type="text"
                      required
                      minLength={3}
                      maxLength={140}
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Share a proposal insight, cooperative update, or question..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label
                    htmlFor="post-content"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Message (type <span className="font-mono">@Name</span> to mention a member)
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
                    placeholder="Write clearly for verified Amanah members, use emojis, or paste photo/video links..."
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-y"
                  />
                  {postMentionQuery !== null && filterMentionMatches(postMentionQuery).length > 0 && (
                    <div
                      role="listbox"
                      aria-label="Mention member suggestions"
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
                        <span>Community Poll</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPollEnabled(false)}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        Remove Poll
                      </button>
                    </div>
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Poll question (e.g. Best date for monthly Amanah review call?)"
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
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Remove option"
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
                          <span>Add Option</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Max 6 options</span>
                      )}
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pollAllowMultiple}
                          onChange={(e) => setPollAllowMultiple(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-indigo-600"
                        />
                        <span>Allow multiple choices</span>
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
                          Share Links ({newLinks.length}/{MAX_COMMUNITY_POST_LINKS})
                        </span>
                      </span>
                      {linkBuilderOpen && (
                        <button
                          type="button"
                          onClick={() => setLinkBuilderOpen(false)}
                          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          Hide
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
                                    ? 'Flagged Link'
                                    : getCommunityLinkKindLabel(item.kind)}
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
                                aria-label="Remove link"
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
                          placeholder="https://... (photo, video, or article URL)"
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          maxLength={80}
                          value={newLinkLabel}
                          onChange={(e) => setNewLinkLabel(e.target.value)}
                          placeholder="Label (optional)"
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <select
                          value={newLinkKind}
                          onChange={(e) =>
                            setNewLinkKind(e.target.value as 'auto' | CommunityPostLinkKind)
                          }
                          aria-label="Link content type"
                          className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                        >
                          <option value="auto">Auto Type</option>
                          <option value="photo">Photo Link</option>
                          <option value="video">Video Link</option>
                          <option value="document">Document</option>
                          <option value="link">Web Link</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddLink('new')}
                          disabled={!newLinkUrl.trim()}
                          className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 disabled:opacity-45 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          Add
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
                        <span>AI Rewrite applied: {newRewriteFeedback}</span>
                      </div>
                    )}
                    {checkingNewSpam && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/70 text-xs text-slate-700 dark:text-slate-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>AI is automatically checking link safety &amp; spam risk…</span>
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
                                ? 'Posting Blocked — Spam or Suspicious Link Detected'
                                : newSpamCheckResult.riskLevel === 'caution'
                                  ? 'Caution Notice'
                                  : 'Post & Links Verified Safe'}
                              <span className="ml-1.5 font-mono text-[10px] opacity-75">
                                ({newSpamCheckResult.checkedWith === 'groq' ? 'Groq AI' : 'Link Guard'})
                              </span>
                            </div>
                            <div>{newSpamCheckResult.reason}</div>
                            {newSpamCheckResult.flaggedLinks.length > 0 && (
                              <div className="font-mono text-[11px] break-all">
                                Flagged: {newSpamCheckResult.flaggedLinks.join(', ')}
                              </div>
                            )}
                            {newPostBlocked && (
                              <div className="text-[11px] font-medium">
                                Remove or replace the flagged link to enable publishing.
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
                              Remove Flagged Link
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
                      <span>Emoji</span>
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
                      <span>Add Link</span>
                    </button>
                    {!pollEnabled && (
                      <button
                        type="button"
                        onClick={() => setPollEnabled(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 cursor-pointer transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Attach Poll</span>
                      </button>
                    )}

                    <div className="inline-flex items-center rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 overflow-hidden">
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value as AiRewriteTone)}
                        aria-label="AI rewrite tone"
                        className="px-2 py-2 bg-transparent text-[11px] font-medium text-indigo-800 dark:text-indigo-200 border-r border-indigo-200 dark:border-indigo-800/70 focus:outline-none cursor-pointer"
                      >
                        <option value="clear">Clear</option>
                        <option value="concise">Concise</option>
                        <option value="formal">Formal</option>
                      </select>
                      <button
                        type="button"
                        disabled={rewritingNewPost}
                        onClick={() => void handleRewriteNewPost()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{rewritingNewPost ? 'Rewriting...' : 'AI Rewrite'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={checkingNewSpam}
                      onClick={() => void handleCheckNewSpam()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-700 dark:text-emerald-300 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{checkingNewSpam ? 'Scanning...' : 'Spam & Link Check'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComposerOpen(false)}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingPost || checkingNewSpam || newPostBlocked}
                      title={
                        newPostBlocked
                          ? 'Remove the spam or suspicious link before publishing.'
                          : checkingNewSpam
                            ? 'Waiting for AI link verification...'
                            : undefined
                      }
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-xs cursor-pointer transition-all"
                    >
                      {creatingPost
                        ? 'Publishing...'
                        : checkingNewSpam
                          ? 'Checking Links...'
                          : newPostBlocked
                            ? 'Link Blocked'
                            : 'Publish Post'}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {(
                [
                  { id: 'all', label: 'All Topics' },
                  { id: 'pinned', label: 'Pinned' },
                  ...CATEGORIES.map((c) => ({ id: c, label: c })),
                  ...(isAdmin ? [{ id: 'hidden' as const, label: 'Hidden (Admin)' }] : []),
                ] as Array<{ id: typeof feedCategory; label: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFeedCategory(item.id)}
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
                placeholder="Search posts, members, replies..."
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
                  No community discussions found
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {feedSearch || feedCategory !== 'all'
                    ? 'Try clearing your topic filter or search query.'
                    : 'Start the first discussion on cooperative initiatives, Qard Hasan proposals, or upcoming Halal ventures.'}
                </p>
              </div>
              {!user.communityMuted && !composerOpen && (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                >
                  Create First Post
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
                            title={`View ${post.authorName}'s profile`}
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
                              {post.authorRole}
                            </span>
                            {post.authorMuted && isAdmin && (
                              <>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                  ·
                                </span>
                                <span className="text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                                  <VolumeX className="w-3 h-3" />
                                  Muted
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className={`font-medium ${getTopicToneClass(post.category)}`}>
                              {post.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatDateTime(post.createdAt)}
                            </span>
                            {post.updatedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Edited</span>
                              </>
                            )}
                            {post.isPinned && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                  <Pin className="w-3 h-3" />
                                  Pinned
                                </span>
                              </>
                            )}
                            {post.commentsLocked && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  Replies Locked
                                </span>
                              </>
                            )}
                            {post.status === 'hidden' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-red-700 dark:text-red-400 font-medium inline-flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" />
                                  Hidden from Members
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
                            <span>Profile</span>
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
                            <span>Message</span>
                          </button>
                        )}

                        {isAuthor && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => startEditPost(post)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
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
                              title={post.isPinned ? 'Unpin post' : 'Pin post to top'}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.isPinned ? (
                                <>
                                  <PinOff className="w-3 h-3" />
                                  <span>Unpin</span>
                                </>
                              ) : (
                                <>
                                  <Pin className="w-3 h-3" />
                                  <span>Pin</span>
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
                                post.commentsLocked ? 'Unlock comments' : 'Lock comments on post'
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.commentsLocked ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>Unlock</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Lock</span>
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
                                  ? 'Restore post visibility'
                                  : 'Hide post from members'
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              {post.status === 'hidden' ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Restore</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Hide</span>
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
                                    ? 'Restore author posting privileges'
                                    : 'Mute author in Community'
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                              >
                                {post.authorMuted ? (
                                  <>
                                    <Volume2 className="w-3 h-3" />
                                    <span>Unmute</span>
                                  </>
                                ) : (
                                  <>
                                    <VolumeX className="w-3 h-3" />
                                    <span>Mute Author</span>
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
                            <span>Delete</span>
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
                                {cat}
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
                                            Flagged ·
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
                                        aria-label="Remove link"
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
                                  placeholder="https://... (photo, video, or web URL)"
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={editLinkLabel}
                                  onChange={(e) => setEditLinkLabel(e.target.value)}
                                  placeholder="Label (optional)"
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                                <select
                                  value={editLinkKind}
                                  onChange={(e) =>
                                    setEditLinkKind(e.target.value as 'auto' | CommunityPostLinkKind)
                                  }
                                  aria-label="Link content type"
                                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                >
                                  <option value="auto">Auto</option>
                                  <option value="photo">Photo</option>
                                  <option value="video">Video</option>
                                  <option value="document">Document</option>
                                  <option value="link">Web</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleAddLink('edit')}
                                  disabled={!editLinkUrl.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-teal-600 text-white text-xs font-medium cursor-pointer disabled:opacity-45"
                                >
                                  Add
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {checkingEditSpam && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/70 text-xs text-slate-700 dark:text-slate-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                            <span>AI is automatically checking edited links…</span>
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
                                      ? 'Save Blocked — Spam or Suspicious Link:'
                                      : editSpamCheckResult.riskLevel === 'caution'
                                        ? 'Link Caution:'
                                        : 'Verified Safe:'}
                                  </span>
                                  <span>{editSpamCheckResult.reason}</span>
                                </div>
                                {editPostBlocked && (
                                  <div className="text-[11px] font-medium">
                                    Remove the flagged link before saving changes.
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
                                  Remove Flagged Link
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
                              <span>Emoji</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditLinkBuilderOpen((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Link2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              <span>Add Link</span>
                            </button>
                            <button
                              type="button"
                              disabled={rewritingEditPost}
                              onClick={() => void handleRewriteEditPost()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{rewritingEditPost ? 'Rewriting...' : 'AI Rewrite'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={checkingEditSpam}
                              onClick={() => void handleCheckEditSpam()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{checkingEditSpam ? 'Scanning...' : 'Spam Check'}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingPostId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingPostEdit || checkingEditSpam || editPostBlocked}
                              onClick={() => void handleSavePostEdit(post.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer"
                            >
                              {savingPostEdit
                                ? 'Saving...'
                                : checkingEditSpam
                                  ? 'Checking Links...'
                                  : editPostBlocked
                                    ? 'Link Blocked'
                                    : 'Save Changes'}
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
                                      {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                                      {poll.allowMultiple ? ' · Multi-select' : ''}
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
                                          ? 'Saving Vote…'
                                          : 'Submit Selected Choices'}
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
                            Moderation note ({post.moderatedByName || 'Admin'}):{' '}
                            {post.moderationReason}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reactions Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto [&>button]:min-h-[40px] sm:[&>button]:min-h-0 [&>button]:justify-center">
                        {REACTION_OPTIONS.map(({ type, label, Icon, activeClass }) => {
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
                              <span>{label}</span>
                              {count > 0 && (
                                <span className="font-mono tabular-nums text-[11px]">{count}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {post.comments.length}{' '}
                        {post.comments.length === 1 ? 'comment' : 'comments'}
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
                                        <span className="text-slate-500 dark:text-slate-400">Edited</span>
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
                                        Message
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
                                        Edit
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
                                        {isAdmin && !isCommentAuthor ? 'Remove' : 'Delete'}
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
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCommentId(null)}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                      >
                                        Cancel
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
                          <span>Replies to this discussion have been locked by an administrator.</span>
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
                                  ? 'Replies locked (Admin reply only)...'
                                  : 'Write a comment, emoji, or link (@Name to mention)...'
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
                              title="Insert emoji"
                              aria-label="Insert emoji into comment"
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
                              {submittingCommentPostId === post.id ? 'Posting...' : 'Comment'}
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
                                aria-label="Mention member in comment"
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

        {/* PRIVATE MESSAGES TAB */}
        {activeTab === 'messages' && (
          <motion.div
            key="tab-messages"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="amanah-card-teal border rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] h-[74dvh] min-h-[500px] lg:h-auto lg:min-h-[540px] lg:max-h-[72vh]"
          >
            {/* Left Pane: Threads + Active Member Directory */}
            <aside
              className={`${
                selectedPeerId ? 'hidden lg:flex' : 'flex'
              } border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex-col min-h-0`}
            >
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Direct Conversations
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {directory.length} active
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Find member by name or code..."
                    className="w-full min-h-[40px] sm:min-h-0 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-subtle divide-y divide-slate-100 dark:divide-slate-800/80">
                {threadsLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <Skeleton width={28} height={28} borderRadius={8} />
                        <div className="flex-1 space-y-1">
                          <Skeleton width="65%" height={12} />
                          <Skeleton width="85%" height={10} />
                        </div>
                      </div>
                    ))}
                  </div>
              ) : (
                <>
                  {filteredThreads.length > 0 && (
                    <div>
                      <div className="px-3.5 py-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-950/40">
                        Recent Threads
                      </div>
                      {filteredThreads.map((thread) => {
                        const active = selectedPeerId === thread.peerId;
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
                            className={`w-full px-3.5 py-3 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                              active
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/35'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <AvatarBadge
                              name={thread.peerName}
                              photoUrl={thread.peerPhotoUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {thread.peerName}
                                </span>
                                {thread.unreadCount > 0 && (
                                  <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                    {thread.unreadCount} new
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {thread.lastMessageSenderId === user.id ? 'You: ' : ''}
                                {thread.lastMessageBody}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {otherDirectoryMembers.length > 0 && (
                    <div>
                      <div className="px-3.5 py-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-950/40">
                        Registered Members
                      </div>
                      {otherDirectoryMembers.map((member) => {
                        const active = selectedPeerId === member.id;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleOpenDirectMessage(member)}
                            className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                              active
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/35'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <AvatarBadge
                              name={member.name}
                              photoUrl={member.photoUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                                {member.name}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                <span className="font-mono">{member.memberCode}</span> ·{' '}
                                <span className="capitalize">{member.role}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {filteredThreads.length === 0 && otherDirectoryMembers.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No other active registered members match your search.
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* Right Pane: Active Encrypted Chat */}
          <div className={`${selectedPeerId ? 'flex' : 'hidden lg:flex'} flex-col min-h-0`}>
            {!selectedPeerId || !selectedPeer ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Encrypted Direct Messaging
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select a member on the left to start a private conversation.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-3.5 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <AvatarBadge
                      name={selectedPeer.name}
                      photoUrl={selectedPeer.photoUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {selectedPeer.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-mono">{selectedPeer.memberCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{selectedPeer.role}</span>
                        <span aria-hidden="true" className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <UserCheck className="w-3 h-3" />
                          Verified Member
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onViewMemberProfile && (
                      <button
                        type="button"
                        onClick={() => onViewMemberProfile(selectedPeer.id)}
                        className="min-h-[40px] sm:min-h-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <User className="w-3 h-3 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                        <span>Profile</span>
                      </button>
                    )}
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Lock className="w-3 h-3" />
                      AES-256-GCM
                    </span>
                  </div>
                </div>

                {dmError && (
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                    {dmError}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto scrollbar-subtle p-4 sm:p-5 space-y-3">
                  {messagesLoading ? (
                    <div className="space-y-3">
                      <Skeleton height={44} width="60%" />
                      <Skeleton height={44} width="50%" className="ml-auto" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 py-12">
                      No messages yet. Say Assalamu Alaikum to {selectedPeer.name}.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.senderId === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] sm:max-w-[70%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                              mine
                                ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {msg.body}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                            <span>{formatDateTime(msg.createdAt)}</span>
                            {mine && (
                              <>
                                {msg.readAt ? (
                                  <span
                                    title={`Read ${formatDateTime(msg.readAt)}`}
                                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                                  >
                                    <CheckCheck className="w-3.5 h-3.5" aria-label="Read" />
                                    <span>Read {formatDateTime(msg.readAt)}</span>
                                  </span>
                                ) : (
                                  <Check className="w-3.5 h-3.5" aria-label="Sent" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => requestDeletePrivateMessage(msg.id)}
                                  className="font-sans hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={handleSendPrivateMessage}
                  className="p-3.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-end gap-2 bg-white/50 dark:bg-slate-950/40"
                >
                  <textarea
                    rows={1}
                    maxLength={3000}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendPrivateMessage();
                      }
                    }}
                    placeholder={`Message ${selectedPeer.name}... (Enter to send)`}
                    className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none max-h-28"
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim() || sendingMessage}
                    className="min-h-[44px] px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-45 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{sendingMessage ? 'Sending...' : 'Send'}</span>
                  </button>
                </form>
              </>
            )}
          </div>
          </motion.div>
        )}

        {/* MEMBERS DIRECTORY TAB */}
        {activeTab === 'members' && (
          <motion.div
            key="tab-members"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="space-y-5"
          >
          <div className="amanah-card-violet border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Verified Cooperative Members ({activeMembersList.length})
              </h3>
            </div>
            <div className="relative w-full sm:w-72 shrink-0">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Search name, code, occupation..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
              />
            </div>
          </div>

          {membersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="amanah-card-emerald border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <Skeleton width={36} height={36} borderRadius={8} />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton width="65%" height={15} />
                      <Skeleton width="80%" height={12} />
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <Skeleton width={90} height={24} />
                    <Skeleton width={110} height={30} borderRadius={8} />
                  </div>
                </div>
              ))}
            </div>
          ) : (() => {
            const q = directorySearch.trim().toLowerCase();
            const list = activeMembersList.filter(
              (m) =>
                !q ||
                m.name.toLowerCase().includes(q) ||
                m.memberCode.toLowerCase().includes(q) ||
                (m.occupation || '').toLowerCase().includes(q) ||
                (m.companyOrganization || '').toLowerCase().includes(q)
            );
              if (list.length === 0) {
              return (
                <div className="amanah-card-violet border rounded-2xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No verified members match your search.
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.map((member, idx) => {
                  const isSelf = member.id === user.id;
                  return (
                    <div
                      key={member.id}
                      className={`${
                        idx % 2 === 0 ? 'amanah-card-emerald' : 'amanah-card-violet'
                      } border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between gap-4 transition-all duration-200`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <AvatarBadge name={member.name} photoUrl={member.photoUrl} />
                        <div className="min-w-0 space-y-0.5 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {member.name}
                            </span>
                            {isSelf && (
                              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{member.memberCode}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{member.role}</span>
                            <span aria-hidden="true">·</span>
                            <span>Joined {formatShortDate(member.joinedAt)}</span>
                          </div>
                          {(member.occupation || member.companyOrganization) && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 truncate pt-0.5">
                              {[member.occupation, member.companyOrganization]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="text-xs">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Contributed
                          </div>
                          <div className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatMoney(member.totalContributed, currency)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDirectMessage({
                                  id: member.id,
                                  name: member.name,
                                  memberCode: member.memberCode,
                                  role: member.role,
                                  photoUrl: member.photoUrl,
                                })
                              }
                              className="min-h-[40px] sm:min-h-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Mail className="w-3 h-3" aria-hidden="true" />
                              <span>Message</span>
                            </button>
                          )}
                          {onViewMemberProfile && (
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(member.id)}
                              className="min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <User className="w-3 h-3" aria-hidden="true" />
                              <span>View Profile</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </motion.div>
        )}
      </AnimatePresence>
      <ActionModal
        open={modal !== null}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
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
