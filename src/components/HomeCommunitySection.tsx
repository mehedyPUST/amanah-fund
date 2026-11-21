'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

export function HomeCommunitySection({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { user, authChecking } = useCoopSession();
  const t = useTranslations('Public.communityGate');
  const tNav = useTranslations('Navigation');

  const communityFeatures = [
    {
      index: '01',
      Icon: MessageSquare,
      title: t('feature1Title'),
      detail: t('feature1Desc'),
    },
    {
      index: '02',
      Icon: BarChart2,
      title: t('feature2Title'),
      detail: t('feature2Desc'),
    },
    {
      index: '03',
      Icon: Users,
      title: t('feature3Title'),
      detail: t('feature3Desc'),
    },
    {
      index: '04',
      Icon: ShieldCheck,
      title: t('feature4Title'),
      detail: t('feature4Desc'),
    },
  ];

  return (
    <div
      className={
        embedded
          ? 'bg-white/88 dark:bg-slate-900/82 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 sm:p-8 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] text-slate-900 dark:text-slate-100'
          : 'text-slate-900 dark:text-slate-100'
      }
    >
      <div className={embedded ? 'space-y-5' : 'w-full py-6 sm:py-8 space-y-6'}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {t('eyebrow')}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {t('heading')}
            </h2>
          </div>

          {!authChecking && user && user.status === 'active' && (
            <Link
              href="/dashboard?page=community"
              className="group shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 shadow-2xs transition-colors whitespace-nowrap self-start md:self-auto"
            >
              <span>{tNav('dashboard')}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          )}
        </div>

        {authChecking ? (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md p-4 sm:p-5 space-y-5">
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
            className="amanah-card-emerald backdrop-blur-xl rounded-2xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 p-6 sm:p-8 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] space-y-6"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {t('lockedEyebrow')}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {t('lockedTitle')}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    {t('lockedDesc')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link
                  href="/login"
                  className="group px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>{tNav('signIn')}</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-950/75 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium shadow-2xs active:scale-[0.98] transition-all whitespace-nowrap"
                >
                  {tNav('joinAmanah')}
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {communityFeatures.map((item, idx) => {
                const Icon = item.Icon;
                const cardHue: CardHue = (['emerald', 'violet', 'teal', 'amber'] as const)[idx % 4];
                const iconBoxClass =
                  cardHue === 'violet'
                    ? 'border-violet-200/80 dark:border-violet-500/25 bg-violet-100/85 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    : cardHue === 'teal'
                      ? 'border-teal-200/80 dark:border-teal-500/25 bg-teal-100/85 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : cardHue === 'amber'
                        ? 'border-amber-200/80 dark:border-amber-500/25 bg-amber-100/85 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'border-emerald-200/80 dark:border-emerald-500/25 bg-emerald-100/85 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
                return (
                  <MotionCard
                    key={item.index}
                    hue={cardHue}
                    delay={idx * 0.04}
                    inView
                    className="backdrop-blur-xl p-4 rounded-2xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] space-y-2.5 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-9 h-9 rounded-xl border shadow-2xs flex items-center justify-center ${iconBoxClass}`}>
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
          <div className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-5 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('verificationTitle')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('verificationDesc')}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 whitespace-nowrap self-start sm:self-auto transition-colors"
            >
              {t('checkAccountStatus')}
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
