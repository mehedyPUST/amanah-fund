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
import { MotionCard, type CardHue } from './MotionCard.tsx';

const COMMUNITY_FEATURES = [
  {
    index: '01',
    Icon: MessageSquare,
    title: 'Member Feed & Discussions',
    detail:
      'Share updates, Qard Hasan insights, Halal venture ideas, and announcements across the cooperative.',
  },
  {
    index: '02',
    Icon: BarChart2,
    title: 'Community Polls & Replies',
    detail:
      'Create single or multi-choice polls, mention members with @handles, and react to helpful posts.',
  },
  {
    index: '03',
    Icon: Users,
    title: 'Verified Member Directory',
    detail:
      'Browse active members and inspect their community posts, about details, and fund contribution summary.',
  },
  {
    index: '04',
    Icon: ShieldCheck,
    title: 'Encrypted Private Messages',
    detail:
      'Message verified cooperative members directly inside AES-256-GCM encrypted one-on-one threads.',
  },
];

export function HomeCommunitySection({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { user, authChecking } = useCoopSession();

  return (
    <div
      className={
        embedded
          ? 'bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-sm text-slate-900 dark:text-slate-100'
          : 'text-slate-900 dark:text-slate-100'
      }
    >
      <div
        className={
          embedded
            ? 'space-y-5'
            : 'w-full py-6 sm:py-8 space-y-6'
        }
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Member Community
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Cooperative Community Hub
            </h2>
          </div>

          {!authChecking && user && user.status === 'active' && (
            <Link
              href="/dashboard?page=community"
              className="group shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors whitespace-nowrap self-start md:self-auto"
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
            className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
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
                  className="group px-5 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shadow-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Log In to Enter Community</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Apply for Membership
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {COMMUNITY_FEATURES.map((item, idx) => {
                const Icon = item.Icon;
                const cardHue: CardHue = (['emerald', 'teal', 'amber', 'sky'] as const)[idx % 4];
                const cardClass = [
                  'bg-gradient-to-br from-emerald-100/75 via-emerald-50/35 to-white/85 dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900/80 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300/90 dark:hover:border-emerald-700/70',
                  'bg-gradient-to-br from-teal-100/75 via-teal-50/35 to-white/85 dark:from-teal-950/45 dark:via-teal-950/20 dark:to-slate-900/80 border-teal-200/80 dark:border-teal-900/50 hover:border-teal-300/90 dark:hover:border-teal-700/70',
                  'bg-gradient-to-br from-amber-100/75 via-amber-50/35 to-white/85 dark:from-amber-950/45 dark:via-amber-950/20 dark:to-slate-900/80 border-amber-200/80 dark:border-amber-900/50 hover:border-amber-300/90 dark:hover:border-amber-700/70',
                  'bg-gradient-to-br from-sky-100/75 via-sky-50/35 to-white/85 dark:from-sky-950/45 dark:via-sky-950/20 dark:to-slate-900/80 border-sky-200/80 dark:border-sky-900/50 hover:border-sky-300/90 dark:hover:border-sky-700/70',
                ][idx % 4];
                return (
                  <MotionCard
                    key={item.title}
                    hue={cardHue}
                    delay={idx * 0.04}
                    inView
                    className={`backdrop-blur-md p-4 rounded-xl border ${cardClass} space-y-2.5 shadow-xs hover:shadow-md transition-all duration-200`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        {item.index}.
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                      {item.detail}
                    </p>
                  </MotionCard>
                );
              })}
            </div>
          </motion.div>
        ) : user.status !== 'active' ? (
          <div className="bg-amber-50/70 dark:bg-amber-950/35 backdrop-blur-md border border-amber-200/80 dark:border-amber-900/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
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
              className="px-4 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 whitespace-nowrap self-start sm:self-auto transition-colors"
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
