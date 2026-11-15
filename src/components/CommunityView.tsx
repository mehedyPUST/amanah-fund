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
  ImagePlus,
  Lightbulb,
  Lock,
  Mail,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Shield,
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
  CommunityCategory,
  CommunityPost,
  CommunityReactionType,
  ConversationThreadSummary,
  FundConfig,
  PrivateMessage,
  PublicUser,
  UserRole,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';

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
}> = [
  { type: 'like', label: 'Like', Icon: ThumbsUp },
  { type: 'support', label: 'Support', Icon: HeartHandshake },
  { type: 'celebrate', label: 'Celebrate', Icon: Award },
  { type: 'helpful', label: 'Helpful', Icon: Lightbulb },
];

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
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);

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
  const [editImageUrl, setEditImageUrl] = useState('');
  const [savingPostEdit, setSavingPostEdit] = useState(false);

  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);

  // Comments State
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
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
    if (!initialDmPeer) return;
    setActiveTab('messages');
    setSelectedPeerId(initialDmPeer.id);
    setSelectedPeer(initialDmPeer);
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

  async function handleImagePick(file: File, target: 'new' | 'edit') {
    setUploadingImage(true);
    try {
      const res = await api.uploadImage(file, `community-${Date.now()}`);
      if (target === 'new') {
        setNewImageUrl(res.url);
      } else {
        setEditImageUrl(res.url);
      }
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Image Upload Failed',
        description: err instanceof Error ? err.message : 'Image upload failed.',
      });
    } finally {
      setUploadingImage(false);
    }
  }

  function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();

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
      description: 'Confirm publishing this post to the verified Amanah Member Community.',
      details: [
        { label: 'Topic', value: newCategory },
        { label: 'Headline', value: newTitle.trim() },
        ...(pollPayload ? [{ label: 'Attached Poll', value: pollPayload.question }] : []),
        ...(newImageUrl ? [{ label: 'Attachment', value: 'Image attached' }] : []),
      ],
      confirmLabel: 'Publish Post',
      run: async () => {
        setCreatingPost(true);
        try {
          const res = await api.createCommunityPost({
            category: newCategory,
            title: newTitle,
            content: newContent,
            imageUrl: newImageUrl || undefined,
            poll: pollPayload,
          });
          setPosts((prev) => [res.post, ...prev]);
          setNewTitle('');
          setNewContent('');
          setNewImageUrl('');
          setNewCategory('General');
          setPollEnabled(false);
          setPollQuestion('');
          setPollAllowMultiple(false);
          setPollOptions(['', '']);
          setPostMentionQuery(null);
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
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditCategory(post.category);
    setEditImageUrl(post.imageUrl || '');
  }

  function handleSavePostEdit(postId: string) {
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
            imageUrl: editImageUrl,
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
    <div className="space-y-6">
      {/* Top Toolbar: Mode Switch + Primary Action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Amanah Member Community
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Verified cooperative forum for member discussions, reactions, and AES-256-GCM encrypted
            private messaging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            role="tablist"
            aria-label="Community views"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'feed'}
              onClick={() => setActiveTab('feed')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === 'feed'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Discussion Feed</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {posts.filter((p) => p.status === 'active').length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'messages'}
              onClick={() => setActiveTab('messages')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === 'messages'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Private Messages</span>
              {totalUnread > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {totalUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'members'}
              onClick={() => setActiveTab('members')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === 'members'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Members</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {activeMembersList.length > 0 ? activeMembersList.length : directory.length + 1}
              </span>
            </button>
          </div>

          {activeTab === 'feed' && !user.communityMuted && (
            <button
              type="button"
              onClick={() => {
                setComposerOpen((prev) => !prev);
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              {composerOpen ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{composerOpen ? 'Close Composer' : 'New Post'}</span>
            </button>
          )}
        </div>
      </div>

      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <div className="space-y-5">
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
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
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
                    placeholder="Write clearly for verified Amanah members..."
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-y"
                  />
                  {postMentionQuery !== null && filterMentionMatches(postMentionQuery).length > 0 && (
                    <div
                      role="listbox"
                      aria-label="Mention member suggestions"
                      className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto z-20"
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
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Community Poll</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPollEnabled(false)}
                        className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
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
                              className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
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
                          className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Max 6 options</span>
                      )}
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pollAllowMultiple}
                          onChange={(e) => setPollAllowMultiple(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span>Allow multiple choices</span>
                      </label>
                    </div>
                  </div>
                )}

                {newImageUrl && (
                  <div className="relative inline-block">
                    <img
                      src={newImageUrl}
                      alt="Post attachment preview"
                      referrerPolicy="no-referrer"
                      className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNewImageUrl('')}
                      aria-label="Remove attachment"
                      className="absolute top-2 right-2 p-1 rounded-md bg-slate-900/75 text-white hover:bg-slate-900 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{uploadingImage ? 'Uploading...' : 'Attach Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={uploadingImage}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleImagePick(file, 'new');
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {!pollEnabled && (
                      <button
                        type="button"
                        onClick={() => setPollEnabled(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Attach Poll</span>
                      </button>
                    )}
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
                      disabled={creatingPost || uploadingImage}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer transition-colors"
                    >
                      {creatingPost ? 'Publishing...' : 'Publish Post'}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-subtle">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    feedCategory === item.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
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
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Posts Feed */}
          {postsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
                >
                  <Skeleton height={24} width={220} />
                  <Skeleton height={64} className="mt-3" />
                </div>
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
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
              {filteredPosts.map((post) => {
                const isAuthor = post.authorId === user.id;
                const canDeletePost = isAuthor || isAdmin;
                const myReaction = post.reactions.find((r) => r.userId === user.id)?.type;
                const isEditingThis = editingPostId === post.id;

                return (
                  <article
                    key={post.id}
                    className={`bg-white dark:bg-slate-900 border rounded-xl p-5 space-y-4 transition-colors ${
                      post.status === 'hidden'
                        ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                        : post.isPinned
                          ? 'border-emerald-300 dark:border-emerald-800/80'
                          : 'border-slate-200 dark:border-slate-800'
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
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
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
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
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
                          rows={4}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                              <ImagePlus className="w-3.5 h-3.5" />
                              <span>{editImageUrl ? 'Replace Image' : 'Add Image'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleImagePick(f, 'edit');
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                            {editImageUrl && (
                              <button
                                type="button"
                                onClick={() => setEditImageUrl('')}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                              >
                                Remove Image
                              </button>
                            )}
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
                              disabled={savingPostEdit}
                              onClick={() => handleSavePostEdit(post.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                            >
                              {savingPostEdit ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
                          {post.title}
                        </h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {post.content}
                        </p>
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt={post.title}
                            referrerPolicy="no-referrer"
                            className="max-h-80 rounded-lg border border-slate-200 dark:border-slate-800 object-cover"
                          />
                        )}
                        {post.poll && (
                          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
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
                                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
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
                                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
                                          }`}
                                        >
                                          <div
                                            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                                              isSelected
                                                ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
                                                : 'bg-slate-200/45 dark:bg-slate-800/45'
                                            }`}
                                            style={{ width: `${pct}%` }}
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
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {REACTION_OPTIONS.map(({ type, label, Icon }) => {
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
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
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
                                        <span className="text-slate-400">Edited</span>
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
                                        className="text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
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
                                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
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
                                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                    {comment.content}
                                  </p>
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
                                  : 'Write a comment (type @Name to mention)...'
                              }
                              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            />
                            <button
                              type="submit"
                              disabled={
                                !(commentDrafts[post.id] || '').trim() ||
                                submittingCommentPostId === post.id
                              }
                              className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                            >
                              {submittingCommentPostId === post.id ? 'Posting...' : 'Comment'}
                            </button>
                          </form>
                          {commentMentionTarget?.postId === post.id &&
                            filterMentionMatches(commentMentionTarget.query).length > 0 && (
                              <div
                                role="listbox"
                                aria-label="Mention member in comment"
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-y-auto"
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
      )}

      {/* PRIVATE MESSAGES TAB */}
      {activeTab === 'messages' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] min-h-[540px] max-h-[72vh]">
          {/* Left Pane: Threads + Active Member Directory */}
          <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 max-h-72 lg:max-h-none">
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
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-subtle divide-y divide-slate-100 dark:divide-slate-800/80">
              {threadsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} height={48} />
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
          <div className="flex flex-col min-h-0">
            {!selectedPeerId || !selectedPeer ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Encrypted Direct Messaging
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Select any registered member on the left to start a confidential conversation.
                    Messages are encrypted at rest with AES-256-GCM and delivered in real time only
                    to the two participants.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarBadge
                      name={selectedPeer.name}
                      photoUrl={selectedPeer.photoUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {selectedPeer.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span className="font-mono">{selectedPeer.memberCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{selectedPeer.role}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
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
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <User className="w-3 h-3" aria-hidden="true" />
                        <span>View Profile</span>
                      </button>
                    )}
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
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
                                ? 'bg-emerald-600 text-white'
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
                  className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2 bg-white dark:bg-slate-900"
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
                    className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none max-h-28"
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim() || sendingMessage}
                    className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{sendingMessage ? 'Sending...' : 'Send'}</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* MEMBERS DIRECTORY TAB */}
      {activeTab === 'members' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Verified Cooperative Members ({activeMembersList.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select any member to view their profile, community posts, about details, and fund
                summary.
              </p>
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
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {membersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
                >
                  <Skeleton height={86} />
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
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No verified members match your search.
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.map((member) => {
                  const isSelf = member.id === user.id;
                  return (
                    <div
                      key={member.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70 rounded-xl p-5 flex flex-col justify-between gap-4 shadow-xs transition-all duration-200"
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
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Mail className="w-3 h-3" aria-hidden="true" />
                              <span>Message</span>
                            </button>
                          )}
                          {onViewMemberProfile && (
                            <button
                              type="button"
                              onClick={() => onViewMemberProfile(member.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
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
        </div>
      )}
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
    </div>
  );
}
