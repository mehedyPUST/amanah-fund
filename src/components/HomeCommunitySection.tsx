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
    iconClass: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-900/60',
    cardHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
  },
  {
    Icon: BarChart2,
    title: 'Community Polls & Replies',
    detail:
      'Create single or multi-choice polls, mention members with @handles, and react to helpful posts.',
    iconClass: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-900/60',
    cardHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
  },
  {
    Icon: Users,
    title: 'Verified Member Directory',
    detail:
      'Browse active members and inspect their community posts, about details, and fund contribution summary.',
    iconClass: 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 border-teal-200/80 dark:border-teal-900/60',
    cardHover: 'hover:border-teal-300 dark:hover:border-teal-700/70',
  },
  {
    Icon: ShieldCheck,
    title: 'Encrypted Private Messages',
    detail:
      'Message verified cooperative members directly inside AES-256-GCM encrypted one-on-one threads.',
    iconClass: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200/80 dark:border-indigo-900/60',
    cardHover: 'hover:border-indigo-300 dark:hover:border-indigo-700/70',
  },
];

export function HomeCommunitySection() {
  const router = useRouter();
  const { user, authChecking } = useCoopSession();

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Member Community
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Cooperative Community Hub
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect with verified Amanah members through discussion threads, polls, member profiles, and encrypted direct messaging.
            </p>
          </div>

          {!authChecking && user && user.status === 'active' && (
            <Link
              href="/dashboard?page=community"
              className="group shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-teal-200 dark:border-teal-800/70 bg-white dark:bg-slate-900 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-all duration-200 whitespace-nowrap self-start md:self-auto"
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 lg:p-10 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-start gap-4 flex-1 max-w-2xl">
                <Skeleton width={48} height={48} borderRadius={12} />
                <div className="flex-1 space-y-2">
                  <Skeleton width={160} height={14} />
                  <Skeleton width="70%" height={24} />
                  <Skeleton width="90%" height={14} count={2} />
                </div>
              </div>
              <div className="flex gap-3">
                <Skeleton width={180} height={42} borderRadius={8} />
                <Skeleton width={140} height={42} borderRadius={8} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <Skeleton width={32} height={32} borderRadius={8} />
                  <Skeleton width="75%" height={16} />
                  <Skeleton width="100%" height={12} count={2} />
                </div>
              ))}
            </div>
          </div>
        ) : !user ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-sm space-y-8"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Registered Members Only
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    Please Log In to Enter the Community
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    To protect member privacy, cooperative discussions, polls, member profiles, and encrypted direct messages are only visible to registered, logged-in Amanah members. Please log in with your verified account to enter the community.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link
                  href="/login"
                  className="group px-5 py-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Log In to Enter Community</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 text-sm font-medium transition-all duration-200 whitespace-nowrap"
                >
                  Apply for Membership
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {COMMUNITY_FEATURES.map((item, idx) => {
                const Icon = item.Icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.22, delay: idx * 0.05 }}
                    className={`p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${item.cardHover}`}
                  >
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${item.iconClass}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.detail}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : user.status !== 'active' ? (
          <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Membership Verification Required
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Community access unlocks automatically once an Administrator approves your member registration.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap self-start sm:self-auto"
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
