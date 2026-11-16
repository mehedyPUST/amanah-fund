'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart2,
  Lock,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { useCoopSession } from './AppProviders.tsx';
import { CommunityView } from './CommunityView.tsx';

const COMMUNITY_FEATURES = [
  {
    Icon: MessageSquare,
    title: 'Member Feed & Discussions',
    detail:
      'Share updates, Qard Hasan insights, Halal venture ideas, and announcements across the cooperative.',
    cardClass:
      'border-emerald-200/80 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-100/65 via-emerald-50/35 to-white/75 dark:from-emerald-950/40 dark:via-emerald-950/15 dark:to-slate-900/75 backdrop-blur-md hover:border-emerald-300 dark:hover:border-emerald-700/80',
    iconClass:
      'bg-emerald-100/80 dark:bg-emerald-950/60 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400',
  },
  {
    Icon: BarChart2,
    title: 'Community Polls & Replies',
    detail:
      'Create single or multi-choice polls, mention members with @handles, and react to helpful posts.',
    cardClass:
      'border-orange-200/80 dark:border-orange-900/50 bg-gradient-to-br from-orange-100/65 via-orange-50/35 to-white/75 dark:from-orange-950/40 dark:via-orange-950/15 dark:to-slate-900/75 backdrop-blur-md hover:border-orange-300 dark:hover:border-orange-700/80',
    iconClass:
      'bg-orange-100/80 dark:bg-orange-950/60 border-orange-200/80 dark:border-orange-800/60 text-orange-700 dark:text-orange-400',
  },
  {
    Icon: Users,
    title: 'Verified Member Directory',
    detail:
      'Browse active members and inspect their community posts, about details, and fund contribution summary.',
    cardClass:
      'border-teal-200/80 dark:border-teal-900/50 bg-gradient-to-br from-teal-100/65 via-teal-50/35 to-white/75 dark:from-teal-950/40 dark:via-teal-950/15 dark:to-slate-900/75 backdrop-blur-md hover:border-teal-300 dark:hover:border-teal-700/80',
    iconClass:
      'bg-teal-100/80 dark:bg-teal-950/60 border-teal-200/80 dark:border-teal-800/60 text-teal-700 dark:text-teal-400',
  },
  {
    Icon: ShieldCheck,
    title: 'Encrypted Private Messages',
    detail:
      'Message verified cooperative members directly inside AES-256-GCM encrypted one-on-one threads.',
    cardClass:
      'border-violet-200/80 dark:border-violet-900/50 bg-gradient-to-br from-violet-100/65 via-violet-50/35 to-white/75 dark:from-violet-950/40 dark:via-violet-950/15 dark:to-slate-900/75 backdrop-blur-md hover:border-violet-300 dark:hover:border-violet-700/80',
    iconClass:
      'bg-violet-100/80 dark:bg-violet-950/60 border-violet-200/80 dark:border-violet-800/60 text-violet-700 dark:text-violet-400',
  },
];

export function HomeCommunitySection({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { user, authChecking } = useCoopSession();

  return (
    <div
      className={
        embedded
          ? 'bg-gradient-to-b from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100'
          : 'bg-slate-50/70 dark:bg-slate-950/70 backdrop-blur-sm text-slate-900 dark:text-slate-100'
      }
    >
      <div
        className={
          embedded
            ? 'space-y-4'
            : 'w-full px-4 sm:px-6 py-10 sm:py-12 space-y-6'
        }
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Member Community
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Cooperative Community Hub
            </h2>
          </div>

          {!authChecking && user && user.status === 'active' && (
            <Link
              href="/dashboard?page=community"
              className="group shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-teal-200 dark:border-teal-800/70 bg-white dark:bg-slate-900 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-all duration-200 whitespace-nowrap self-start md:self-auto"
            >
              <span>Open Full Dashboard View</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          )}
        </div>

        {authChecking ? (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-br from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md p-4 sm:p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-start gap-3 flex-1 max-w-2xl">
                <Skeleton width={44} height={44} borderRadius={10} />
                <div className="flex-1 space-y-2">
                  <Skeleton width={150} height={12} />
                  <Skeleton width="65%" height={20} />
                  <Skeleton width="85%" height={13} />
                </div>
              </div>
              <div className="flex gap-2.5">
                <Skeleton width={160} height={38} borderRadius={8} />
                <Skeleton width={130} height={38} borderRadius={8} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <Skeleton width={32} height={32} borderRadius={8} />
                  <Skeleton width="70%" height={14} />
                  <Skeleton width="100%" height={12} count={2} />
                </div>
              ))}
            </div>
          </div>
        ) : !user ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.22 }}
            className="rounded-xl border border-violet-200/80 dark:border-violet-900/50 bg-gradient-to-br from-violet-100/65 via-violet-50/30 to-white/75 dark:from-violet-950/40 dark:via-violet-950/15 dark:to-slate-900/75 backdrop-blur-md p-4 sm:p-5 space-y-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-violet-200/70 dark:border-violet-900/40">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-12 h-12 rounded-xl bg-violet-100/80 dark:bg-violet-950/60 border border-violet-200/80 dark:border-violet-800/60 text-violet-700 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                    Registered Members Only
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    Log In to Enter the Community
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    Discussions, polls, and direct messages are private to verified Amanah members.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link
                  href="/login"
                  className="group px-5 py-3 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Log In to Enter Community</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-3 rounded-lg border border-violet-200/80 dark:border-violet-800/60 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:bg-violet-50/70 dark:hover:bg-violet-950/30 hover:border-violet-300 dark:hover:border-violet-700 text-sm font-medium transition-all duration-200 whitespace-nowrap"
                >
                  Apply for Membership
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {COMMUNITY_FEATURES.map((item, idx) => {
                const Icon = item.Icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className={`p-3.5 rounded-xl border space-y-2 transition-colors ${item.cardClass}`}
                  >
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${item.iconClass}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                      {item.detail}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : user.status !== 'active' ? (
          <div className="bg-gradient-to-br from-orange-100/65 via-orange-50/30 to-white/75 dark:from-orange-950/40 dark:via-orange-950/15 dark:to-slate-900/75 backdrop-blur-md border border-orange-200/80 dark:border-orange-900/50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-orange-100/80 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-800/60 text-orange-700 dark:text-orange-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Membership Verification Required
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                  Community access unlocks automatically once an Administrator approves your member registration.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="px-4 py-2.5 rounded-lg border border-orange-200/80 dark:border-orange-800/60 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 whitespace-nowrap self-start sm:self-auto transition-colors"
            >
              Check Account Status
            </Link>
          </div>
        ) : (
          <CommunityView
            user={user}
            onViewMemberProfile={(memberId) =>
              router.push(`/dashboard?page=member-profile&memberId=${encodeURIComponent(memberId)}`)
            }
          />
        )}
      </div>
    </div>
  );
}
