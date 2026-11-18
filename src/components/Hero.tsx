'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, HandCoins, LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

const HERO_IMAGE_URL =
  'https://i.ibb.co.com/cc8kRKR3/Qard-Hasan-Banking-can-be-an-alternative.png';
const INVESTMENT_IMAGE_URL =
  'https://i.ibb.co.com/21vdb554/coop-halal-investment.jpg';

export function Hero({
  includeLifecycle = true,
  embedded = false,
}: {
  includeLifecycle?: boolean;
  embedded?: boolean;
}) {
  const { user, authChecking } = useCoopSession();
  const tHero = useTranslations('Public.hero');
  const tNav = useTranslations('Navigation');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const keyTerms: Array<{
    key: string;
    kicker: string;
    meta: string;
    value: string;
    sublabel: string;
    hue: CardHue;
    badgeClass: string;
  }> = [
    {
      key: 'ceiling',
      kicker: tHero('terms.ceilingKicker'),
      meta: tHero('terms.ceilingMeta'),
      value: tHero('terms.ceilingValue'),
      sublabel: tHero('terms.ceilingSub'),
      hue: 'emerald',
      badgeClass:
        'bg-emerald-100/80 dark:bg-emerald-500/15 border border-emerald-200/80 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'contrib',
      kicker: tHero('terms.contribKicker'),
      meta: tHero('terms.contribMeta'),
      value: tHero('terms.contribValue'),
      sublabel: tHero('terms.contribSub'),
      hue: 'violet',
      badgeClass:
        'bg-violet-100/80 dark:bg-violet-500/15 border border-violet-200/80 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
    },
    {
      key: 'quorum',
      kicker: tHero('terms.quorumKicker'),
      meta: tHero('terms.quorumMeta'),
      value: tHero('terms.quorumValue'),
      sublabel: tHero('terms.quorumSub'),
      hue: 'teal',
      badgeClass:
        'bg-teal-100/80 dark:bg-teal-500/15 border border-teal-200/80 dark:border-teal-500/25 text-teal-700 dark:text-teal-300',
    },
    {
      key: 'term',
      kicker: tHero('terms.termKicker'),
      meta: tHero('terms.termMeta'),
      value: tHero('terms.termValue'),
      sublabel: tHero('terms.termSub'),
      hue: 'amber',
      badgeClass:
        'bg-amber-100/80 dark:bg-amber-500/15 border border-amber-200/80 dark:border-amber-500/25 text-amber-800 dark:text-amber-300',
    },
  ];

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-4 w-full">
      {/* Main Hero Statement + Architectural Showcase */}
      <MotionCard
        as="section"
        hue="emerald"
        className="backdrop-blur-md border rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs hover:shadow-md transition-all duration-200"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between gap-6 py-1">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {tHero('kickerTreasury')}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{tHero('kickerCharter')}</span>
                <span aria-hidden="true">·</span>
                <span>{tHero('kickerCap')}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[clamp(2.35rem,3.4vw,3.15rem)] font-bold tracking-[-0.025em] text-slate-900 dark:text-white leading-[1.12] text-balance max-w-2xl">
                {tHero('headline')}
              </h1>

              <p className="text-[15px] sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl text-justify">
                {tHero('subheadline')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-medium shadow-xs transition-colors duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                {user ? (
                  <>
                    <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                    <span>{tNav('dashboard')}</span>
                  </>
                ) : (
                  <>
                    <span>{tNav('joinAmanah')}</span>
                    <ArrowRight
                      className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </Link>

              {!user && (
                <Link
                  href="/login"
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  {tNav('signIn')}
                </Link>
              )}

              {!authChecking && user && user.status === 'active' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('notice-board')}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {tHero('noticeBoard')}
                </button>
              )}

              <Link
                href="/#how-it-works"
                onClick={(e) => {
                  const target = document.getElementById('how-it-works');
                  if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className="px-2.5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
              >
                {tNav('howItWorks')}
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 flex">
            <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-full min-h-[240px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-950">
              {heroImgFailed ? (
                <div className="w-full h-full p-8 bg-gradient-to-br from-emerald-950/15 via-slate-100 to-teal-950/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center justify-center text-center gap-3">
                  <AmanahLogo size="lg" decorative className="shadow-md" />
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {tHero('fallbackTitle')}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {tHero('fallbackSubtitle')}
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={HERO_IMAGE_URL}
                    alt={tHero('fallbackTitle')}
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent flex items-end justify-between gap-3">
                    <div className="text-xs text-white/95 font-medium">
                      {tHero('bannerCaption')}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </MotionCard>

      {/* 4-Column Charter Metrics Strip (Full-Width Row Below Hero Split) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {keyTerms.map((metric, idx) => (
          <MotionCard
            key={metric.key}
            hue={metric.hue}
            delay={0.03 * idx}
            className="backdrop-blur-md border rounded-xl p-5 shadow-xs hover:shadow-md flex flex-col justify-between gap-3 transition-all duration-200"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                {metric.kicker}
              </span>
              <span
                className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${metric.badgeClass}`}
              >
                {metric.meta}
              </span>
            </div>
            <div className="space-y-1">
              <div className="font-display font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
                {metric.value}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
                {metric.sublabel}
              </p>
            </div>
          </MotionCard>
        ))}
      </div>

      {includeLifecycle && <HeroLifecycle embedded={embedded} />}
    </div>
  );
}

export function HeroLifecycle({ embedded = false }: { embedded?: boolean }) {
  const tLife = useTranslations('Public.hero.lifecycle');
  const [lifecycleImgFailed, setLifecycleImgFailed] = useState(false);

  return (
    <MotionCard
      as="section"
      id="lifecycle"
      hue="teal"
      inView
      className={`scroll-mt-2 backdrop-blur-md border rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 ${
        embedded ? 'p-6 sm:p-7' : 'p-6 sm:p-8'
      }`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
        <div className="lg:col-span-5 flex">
          <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-full min-h-[220px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-950">
            {lifecycleImgFailed ? (
              <div className="w-full h-full p-6 bg-gradient-to-br from-emerald-500/15 via-slate-100 to-transparent dark:via-slate-900 flex flex-col items-center justify-center text-center gap-2">
                <HandCoins className="w-9 h-9 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {tLife('fallbackTitle')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {tLife('fallbackSubtitle')}
                </div>
              </div>
            ) : (
              <>
                <img
                  src={INVESTMENT_IMAGE_URL}
                  alt={tLife('caption')}
                  referrerPolicy="no-referrer"
                  onError={() => setLifecycleImgFailed(true)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-950/75 via-slate-950/30 to-transparent">
                  <span className="text-xs font-medium text-white/95">
                    {tLife('caption')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {tLife('eyebrow')}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {tLife('heading')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200/75 dark:border-slate-800">
            <div className="space-y-2">
              <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {tLife('stage1Index')}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {tLife('stage1Title')}
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                {tLife('stage1Body')}
              </p>
            </div>

            <div className="space-y-2 sm:border-l sm:border-slate-200/75 sm:dark:border-slate-800 sm:pl-6">
              <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {tLife('stage2Index')}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {tLife('stage2Title')}
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                {tLife('stage2Body')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}
