'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart2,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  HandCoins,
  HeartHandshake,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Pin,
  RefreshCw,
  ShieldCheck,
  ThumbsUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  CommunityPost,
  CommunityReactionType,
  MemberPublicProfile,
  PublicUser,
  UserRole,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatMoney, formatShortDate } from '../utils/format.ts';
import { ActionModal } from './ActionModal.tsx';
import {
  CommunityPostLinksList,
  FormattedCommunityText,
} from './CommunityTextWithLinks.tsx';

interface MemberPublicProfileViewProps {
  memberId: string;
  currentUser: PublicUser;
  onBack: () => void;
  onOpenDirectMessage: (peer: {
    id: string;
    name: string;
    memberCode: string;
    role: UserRole;
    photoUrl?: string;
  }) => void;
  onOpenOwnProfile: () => void;
  onViewMemberProfile: (memberId: string) => void;
}

type ProfileSectionTab = 'all' | 'posts' | 'about' | 'fund';

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

function formatTenure(joinedAtIso: string): string {
  const joined = new Date(joinedAtIso);
  if (Number.isNaN(joined.getTime())) return 'Active member';
  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24)));
  let totalMonths =
    (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (now.getDate() < joined.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);

  if (diffDays < 1) return 'Joined today';
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  if (years > 0 && remMonths > 0) {
    return `${years} yr${years === 1 ? '' : 's'} ${remMonths} mo${remMonths === 1 ? '' : 's'}`;
  }
  if (years > 0) return `${years} yr${years === 1 ? '' : 's'}`;
  return `${Math.max(1, totalMonths)} mo${totalMonths === 1 ? '' : 's'}`;
}

export function MemberPublicProfileView({
  memberId,
  currentUser,
  onBack,
  onOpenDirectMessage,
  onOpenOwnProfile,
  onViewMemberProfile,
}: MemberPublicProfileViewProps) {
  const [profile, setProfile] = useState<MemberPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileSectionTab>('all');
  const [photoBroken, setPhotoBroken] = useState(false);

  // Interactive post reactions, polls & comments
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({});
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);

  const loadMemberProfile = useCallback(
    async (silent = false) => {
      if (!memberId) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await api.getMemberProfile(memberId);
        setProfile(res.profile);
        setPhotoBroken(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load member profile.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [memberId]
  );

  useEffect(() => {
    setActiveTab('all');
    setActionError(null);
    void loadMemberProfile(false);
  }, [loadMemberProfile]);

  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true });
    const handleSync = () => {
      void loadMemberProfile(true);
    };
    es.addEventListener('community:updated', handleSync);
    es.addEventListener('members:updated', handleSync);
    es.addEventListener('contribution:reviewed', handleSync);
    es.addEventListener('loan:reviewed', handleSync);
    es.addEventListener('repayment:verified', handleSync);
    es.addEventListener('investment:distributed', handleSync);
    return () => {
      es.close();
    };
  }, [loadMemberProfile]);

  const updateSinglePost = useCallback((updated: CommunityPost) => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            communityPosts: prev.communityPosts.map((p) => (p.id === updated.id ? updated : p)),
          }
        : prev
    );
  }, []);

  async function handleToggleReaction(postId: string, type: CommunityReactionType) {
    setActionError(null);
    try {
      const res = await api.reactCommunityPost(postId, type);
      updateSinglePost(res.post);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update reaction.');
    }
  }

  async function handleVotePoll(postId: string, optionIds: string[]) {
    if (optionIds.length === 0) return;
    setVotingPollId(postId);
    setActionError(null);
    try {
      const res = await api.voteCommunityPoll(postId, optionIds);
      updateSinglePost(res.post);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit poll vote.');
    } finally {
      setVotingPollId(null);
    }
  }

  async function handleAddComment(postId: string) {
    const content = (commentDrafts[postId] || '').trim();
    if (!content) return;
    setSubmittingCommentPostId(postId);
    setActionError(null);
    try {
      const res = await api.addCommunityComment(postId, content);
      updateSinglePost(res.post);
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmittingCommentPostId(null);
    }
  }

  const tenureLabel = useMemo(
    () => (profile ? formatTenure(profile.joinedAt) : ''),
    [profile]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton width={130} height={36} />
          <Skeleton width={150} height={36} />
        </div>
        <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton width={72} height={72} borderRadius={12} />
            <div className="space-y-2">
              <Skeleton width={220} height={22} />
              <Skeleton width={280} height={14} />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3">
            {[1, 2, 3, 4].map((k) => (
              <Skeleton key={k} height={68} />
            ))}
          </div>
        </section>
        <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6">
          <Skeleton height={220} />
        </section>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-6 sm:p-8 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="hidden lg:inline-flex px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back</span>
        </button>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">
              Unable to Open Member Profile
            </h2>
            <p className="text-xs text-red-800 dark:text-red-300">
              {error || 'This verified cooperative member profile could not be found.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { about, fundSummary, communityPosts } = profile;
  const ccy = fundSummary.currency;
  const isAdmin = currentUser.role === 'admin';
  const showFund = activeTab === 'all' || activeTab === 'fund';
  const showAbout = activeTab === 'all' || activeTab === 'about';
  const showPosts = activeTab === 'all' || activeTab === 'posts';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-6 pb-8"
    >
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-end lg:justify-between gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="hidden lg:inline-flex min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 items-center gap-1.5 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadMemberProfile(true)}
            disabled={refreshing}
            className="min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>

          {profile.isSelf ? (
            <button
              type="button"
              onClick={onOpenOwnProfile}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit My Profile</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onOpenDirectMessage({
                  id: profile.id,
                  name: profile.name,
                  memberCode: profile.memberCode,
                  role: profile.role,
                  photoUrl: profile.photoUrl,
                })
              }
              className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Send Private Message</span>
            </button>
          )}
        </div>
      </div>

      {/* Member Identity & Quick Metrics Banner */}
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {profile.photoUrl && !photoBroken ? (
              <img
                src={profile.photoUrl}
                alt={`${profile.name} portrait`}
                referrerPolicy="no-referrer"
                onError={() => setPhotoBroken(true)}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-lg font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {profile.status === 'active'
                      ? 'Verified Active Member'
                      : profile.status.replace(/_/g, ' ')}
                  </span>
                </span>
                {profile.isSelf && (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    · (Your Public View)
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {profile.name}
              </h2>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {profile.memberCode}
                </span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{profile.role}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Member for <strong className="font-semibold text-slate-800 dark:text-slate-200">{tenureLabel}</strong>
                </span>
                {(about.occupation || about.companyOrganization) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {[about.occupation, about.companyOrganization].filter(Boolean).join(' at ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section Switcher Tabs */}
          <div
            role="tablist"
            aria-label="Member profile sections"
            className="flex flex-nowrap overflow-x-auto no-scrollbar max-w-full w-full md:w-auto items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start md:self-center shrink-0"
          >
            {(
              [
                { id: 'all', label: 'All Overview' },
                { id: 'posts', label: `Community Posts (${communityPosts.length})` },
                { id: 'about', label: 'About' },
                { id: 'fund', label: 'Fund Summary' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-3 py-1.5 min-h-[38px] sm:min-h-0 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="member-public-profile-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Highlight Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Approved Contributions</div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(fundSummary.totalContributed, ccy)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {fundSummary.fundSharePct}% share of cooperative pool
            </div>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Cooperative Net Equity</div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
              {formatMoney(fundSummary.cooperativeEquity, ccy)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {fundSummary.totalProfitDistributed > 0
                ? `Includes +${formatMoney(fundSummary.totalProfitDistributed, ccy)} Halal profit`
                : 'Net member equity position'}
            </div>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Consistency &amp; Streak</div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <span>{fundSummary.consistencyScore}%</span>
              {fundSummary.currentStreakMonths > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                  {fundSummary.currentStreakMonths}m
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {fundSummary.approvedMonthsCount}{' '}
              {fundSummary.approvedMonthsCount === 1 ? 'month' : 'months'} contributed
            </div>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Community Activity</div>
            <div className="mt-1 text-base sm:text-lg font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
              {about.postsCount} {about.postsCount === 1 ? 'Post' : 'Posts'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {about.commentsCount} comments · {about.reactionsReceivedCount} reactions
            </div>
          </div>
        </div>
      </section>

      {/* FUND SUMMARY & ABOUT GRID */}
      {(showFund || showAbout) && (
        <div
          className={`grid grid-cols-1 ${
            showFund && showAbout ? 'xl:grid-cols-12' : ''
          } gap-6 items-start`}
        >
          {/* FUND SUMMARY */}
          {showFund && (
            <section
              aria-label="Member Fund Summary"
              className={`${
                showAbout ? 'xl:col-span-7' : ''
              } bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-6 space-y-5 shadow-xs`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Cooperative Financial Standing</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                    Fund Summary
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    fundSummary.currentMonthPaid
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {fundSummary.currentMonthPaid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Current month paid</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Current month pending</span>
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="p-3 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Approved Deposits ({fundSummary.approvedContributionsCount})
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatMoney(fundSummary.totalContributed, ccy)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Monthly target: {formatMoney(fundSummary.monthlyTarget, ccy)}
                    {fundSummary.pendingContributionsCount > 0
                      ? ` · ${fundSummary.pendingContributionsCount} pending review`
                      : ''}
                  </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <HandCoins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="truncate">Qard Hasan Balance</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(fundSummary.activeLoanBalance, ccy)}{' '}
                    <span className="text-[11px] sm:text-xs font-normal text-slate-500 dark:text-slate-400 block sm:inline">
                      active balance
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {fundSummary.totalLoansTakenCount} loan
                    {fundSummary.totalLoansTakenCount === 1 ? '' : 's'} taken ·{' '}
                    {fundSummary.loansRepaidCount} repaid ·{' '}
                    {formatMoney(fundSummary.totalRepaid, ccy)} returned
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Pool Share: <strong className="font-mono text-slate-900 dark:text-white">{fundSummary.fundSharePct}%</strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Guarantor Co-Signs:{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {fundSummary.guarantorCount}
                    </strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    Halal Profit Dividends:{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {formatMoney(fundSummary.totalProfitDistributed, ccy)}
                    </strong>
                  </span>
                </span>
              </div>

              {/* Approved Contribution Months History */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Recent Approved Monthly Deposits
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Payment TrxIDs remain encrypted
                  </span>
                </div>

                {fundSummary.recentContributions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No approved monthly contributions recorded yet.
                  </div>
                ) : (
                  <>
                    {/* Mobile Compact Rows (< lg) */}
                    <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-lg">
                      {fundSummary.recentContributions.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-mono font-semibold text-slate-900 dark:text-white">
                              {item.billingMonth}{' '}
                              <span className="uppercase text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                · {item.channel}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {formatShortDate(item.submittedAt)}
                            </div>
                          </div>
                          <div className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                            {formatMoney(item.amount, ccy)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden lg:block overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <th className="py-2 px-3 font-medium">Billing Month</th>
                            <th className="py-2 px-3 font-medium">Channel</th>
                            <th className="py-2 px-3 font-medium">Submitted</th>
                            <th className="py-2 px-3 font-medium text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {fundSummary.recentContributions.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                                {item.billingMonth}
                              </td>
                              <td className="py-2 px-3 uppercase font-mono text-slate-600 dark:text-slate-300">
                                {item.channel}
                              </td>
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {formatShortDate(item.submittedAt)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {formatMoney(item.amount, ccy)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* ABOUT */}
          {showAbout && (
            <section
              aria-label="About Member"
              className={`${
                showFund ? 'xl:col-span-5' : ''
              } bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-6 space-y-5 shadow-xs`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Verified Member Profile</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                  About {profile.name}
                </h3>
              </div>

              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Member Code</span>
                  </dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                    {profile.memberCode}
                  </dd>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Member Since</span>
                  </dt>
                  <dd className="font-mono text-slate-900 dark:text-white text-right">
                    {formatShortDate(about.joinedAt)} ({tenureLabel})
                  </dd>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>Email</span>
                  </dt>
                  <dd className="font-mono text-slate-900 dark:text-white truncate max-w-[210px]">
                    <a href={`mailto:${about.email}`} className="hover:underline">
                      {about.email}
                    </a>
                  </dd>
                </div>

                {about.mobile && (
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>Mobile</span>
                    </dt>
                    <dd className="font-mono tabular-nums text-slate-900 dark:text-white">
                      {about.mobile}
                    </dd>
                  </div>
                )}

                {about.occupation && (
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      <span>Occupation</span>
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">
                      {about.occupation}
                    </dd>
                  </div>
                )}

                {about.companyOrganization && (
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Organization</span>
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">
                      {about.companyOrganization}
                    </dd>
                  </div>
                )}

                {about.presentAddress && (
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>Present Location</span>
                    </dt>
                    <dd className="text-slate-900 dark:text-white text-right leading-relaxed">
                      {about.presentAddress}
                    </dd>
                  </div>
                )}

                {about.referenceMemberName && (
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>Referred By</span>
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">
                      {about.referenceMemberName}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  Sensitive KYC documents (NID, date of birth, permanent address, signed agreement)
                  and private payment references remain AES-256-GCM encrypted and restricted to the
                  account owner and administrators.
                </span>
              </div>
            </section>
          )}
        </div>
      )}

      {/* COMMUNITY POSTS */}
      {showPosts && (
        <section
          aria-label="Member Community Posts"
          className="space-y-4"
        >
          <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Member Discussions</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                Community Posts by {profile.name}{' '}
                <span className="font-mono text-sm font-normal text-slate-500 dark:text-slate-400">
                  ({communityPosts.length})
                </span>
              </h3>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {about.commentsCount} comments · {about.reactionsReceivedCount} reactions received
            </div>
          </div>

          {communityPosts.length === 0 ? (
            <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-2">
              <MessageSquare className="w-7 h-7 text-slate-400 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                No Community Posts Yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {profile.name} has not published any community discussions yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {communityPosts.map((post) => {
                const myReaction = post.reactions.find((r) => r.userId === currentUser.id)?.type;
                const poll = post.poll;
                const totalPollVotes = poll
                  ? poll.options.reduce((sum, opt) => sum + opt.voterIds.length, 0)
                  : 0;
                const mySelectedOptionIds = poll
                  ? poll.options
                      .filter((opt) => opt.voterIds.includes(currentUser.id))
                      .map((opt) => opt.id)
                  : [];
                const activeMultiDraft = pollSelections[post.id] || mySelectedOptionIds;

                return (
                  <article
                    key={post.id}
                    className={`bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border rounded-xl p-3.5 sm:p-5 space-y-4 ${
                      post.isPinned
                        ? 'border-emerald-300/80 dark:border-emerald-800/80'
                        : 'border-slate-200/80 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
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
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                        {post.title}
                      </h4>
                      <FormattedCommunityText
                        text={post.content}
                        className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                      />

                      <CommunityPostLinksList
                        links={post.links}
                        legacyImageUrl={post.imageUrl}
                      />

                      {poll && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                              <BarChart2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>{poll.question}</span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {totalPollVotes} {totalPollVotes === 1 ? 'vote' : 'votes'}
                              {poll.allowMultiple ? ' · Multi-select' : ''}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {poll.options.map((opt) => {
                              const pct =
                                totalPollVotes > 0
                                  ? Math.round((opt.voterIds.length / totalPollVotes) * 100)
                                  : 0;
                              const isPicked = poll.allowMultiple
                                ? activeMultiDraft.includes(opt.id)
                                : opt.voterIds.includes(currentUser.id);

                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  disabled={votingPollId === post.id}
                                  onClick={() => {
                                    if (poll.allowMultiple) {
                                      const next = activeMultiDraft.includes(opt.id)
                                        ? activeMultiDraft.filter((id) => id !== opt.id)
                                        : [...activeMultiDraft, opt.id];
                                      setPollSelections((prev) => ({ ...prev, [post.id]: next }));
                                    } else {
                                      void handleVotePoll(post.id, [opt.id]);
                                    }
                                  }}
                                  className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                                    isPicked
                                      ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-medium text-slate-900 dark:text-white">
                                      {opt.text}
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                      {pct}% ({opt.voterIds.length})
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <motion.div
                                      initial={{ scaleX: 0 }}
                                      animate={{ scaleX: 1 }}
                                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                      className="h-full rounded-full bg-emerald-600"
                                      style={{ width: `${pct}%`, originX: 0 }}
                                    />
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
                                  votingPollId === post.id || activeMultiDraft.length === 0
                                }
                                onClick={() => void handleVotePoll(post.id, activeMultiDraft)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-medium cursor-pointer"
                              >
                                Submit Poll Selection
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Reactions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
                        {REACTION_OPTIONS.map(({ type, label, Icon }) => {
                          const count = post.reactions.filter((r) => r.type === type).length;
                          const active = myReaction === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => void handleToggleReaction(post.id, type)}
                              aria-pressed={active}
                              className={`min-h-[40px] sm:min-h-0 justify-center px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
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

                    {/* Comments */}
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {post.comments.length > 0 && (
                        <div className="space-y-2">
                          {post.comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 px-3.5 py-2.5 space-y-1"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => onViewMemberProfile(comment.authorId)}
                                  className="font-semibold text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                                >
                                  {comment.authorName}
                                </button>
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  {comment.authorCode}
                                </span>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                  {formatDateTime(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {comment.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {post.commentsLocked && !isAdmin ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
                          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Replies to this discussion have been locked by an administrator.</span>
                        </div>
                      ) : currentUser.communityMuted ? null : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleAddComment(post.id);
                          }}
                          className="flex items-center gap-2 pt-1"
                        >
                          <input
                            type="text"
                            maxLength={2000}
                            value={commentDrafts[post.id] || ''}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                            placeholder="Write a comment..."
                            className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          />
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
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <ActionModal
        open={Boolean(actionError)}
        mode="notice"
        tone="red"
        title="Action Failed"
        description={actionError || ''}
        onClose={() => setActionError(null)}
      />
    </motion.div>
  );
}
