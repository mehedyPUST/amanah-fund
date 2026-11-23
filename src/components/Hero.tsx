'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, HandCoins, LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AmanahLogo } from './AmanahLogo.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

const HERO_BANNER_IMAGE_URL =
  'https://i.ibb.co.com/cc8kRKR3/Qard-Hasan-Banking-can-be-an-alternative.png';
const TWO_STAGE_INVEST_IMAGE_URL =
  'https://miro.medium.com/v2/1*m-SggRQCFQnJv3TL65I6zQ.jpeg';

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
  }> = [
    {
      key: 'ceiling',
      kicker: tHero('terms.ceilingKicker'),
      meta: tHero('terms.ceilingMeta'),
      value: tHero('terms.ceilingValue'),
      sublabel: tHero('terms.ceilingSub'),
      hue: 'emerald',
    },
    {
      key: 'contrib',
      kicker: tHero('terms.contribKicker'),
      meta: tHero('terms.contribMeta'),
      value: tHero('terms.contribValue'),
      sublabel: tHero('terms.contribSub'),
      hue: 'sky',
    },
    {
      key: 'quorum',
      kicker: tHero('terms.quorumKicker'),
      meta: tHero('terms.quorumMeta'),
      value: tHero('terms.quorumValue'),
      sublabel: tHero('terms.quorumSub'),
      hue: 'violet',
    },
    {
      key: 'term',
      kicker: tHero('terms.termKicker'),
      meta: tHero('terms.termMeta'),
      value: tHero('terms.termValue'),
      sublabel: tHero('terms.termSub'),
      hue: 'amber',
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
        className="backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-8 lg:p-10 transition-all duration-200"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between gap-5 sm:gap-6 py-0.5 sm:py-1">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium animate__animated animate__fadeInDown animate__faster">
                <span className="font-semibold text-emerald-700 dark:text-[#00ED64]">
                  {tHero('kickerTreasury')}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{tHero('kickerCharter')}</span>
                <span aria-hidden="true">·</span>
                <span>{tHero('kickerCap')}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[clamp(2.35rem,3.4vw,3.15rem)] font-bold tracking-[-0.025em] text-slate-900 dark:text-white leading-[1.12] text-balance max-w-2xl animate__animated animate__fadeInUp amanah-stagger-1">
                {tHero('headline')}
              </h1>

              <p className="text-[15px] sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl animate__animated animate__fadeInUp amanah-stagger-2">
                {tHero('subheadline')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1 animate__animated animate__fadeInUp amanah-stagger-3">
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 dark:from-[#00684A] dark:to-[#05875C] dark:hover:from-[#05875C] dark:hover:to-[#13AA52] text-white text-sm font-semibold shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
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
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-950/65 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium shadow-2xs active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center whitespace-nowrap shrink-0"
                >
                  {tNav('signIn')}
                </Link>
              )}

              {!authChecking && user && user.status === 'active' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('notice-board')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-950/65 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-2xs active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center whitespace-nowrap shrink-0 cursor-pointer"
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
                className="min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-colors inline-flex items-center justify-center whitespace-nowrap shrink-0"
              >
                {tNav('howItWorks')}
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 flex animate__animated animate__zoomIn amanah-stagger-2">
            <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-full min-h-[240px] rounded-2xl overflow-hidden border border-slate-200/85 dark:border-[#163948] ring-1 ring-inset ring-white/25 dark:ring-white/10 bg-slate-100 dark:bg-[#00151F] shadow-[0_12px_32px_-16px_rgba(15,23,42,0.22)]">
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
                    src={HERO_BANNER_IMAGE_URL}
                    alt={tHero('fallbackTitle')}
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover object-center"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-emerald-950/90 via-emerald-950/45 to-transparent flex items-end justify-between gap-3">
                    <div className="text-xs text-white/95 font-medium leading-snug">
                      {tHero('bannerCaption')}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </MotionCard>

      {/* 4-Column Charter Metrics Strip (2x2 Bento on Mobile, 4-Col Row on XL) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3.5">
        {keyTerms.map((metric, idx) => {
          const kickerColorClass =
            metric.hue === 'sky'
              ? 'text-blue-700 dark:text-blue-400'
              : metric.hue === 'violet'
                ? 'text-purple-700 dark:text-purple-400'
                : metric.hue === 'amber'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-[#00ED64]';
          return (
            <MotionCard
              key={metric.key}
              hue={metric.hue}
              delay={0.03 * idx}
              className="backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between gap-2 sm:gap-3 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span className={`font-semibold truncate ${kickerColorClass}`}>
                  {metric.kicker}
                </span>
                <span className="font-mono text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {metric.meta}
                </span>
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <div className="font-display font-mono text-lg sm:text-[26px] font-bold tracking-tight tabular-nums text-slate-900 dark:text-white leading-tight">
                  {metric.value}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-snug sm:leading-relaxed">
                  {metric.sublabel}
                </p>
              </div>
            </MotionCard>
          );
        })}
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
      className={`scroll-mt-2 backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl transition-all duration-200 ${
        embedded ? 'p-4 sm:p-7' : 'p-4 sm:p-8'
      }`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-7 items-stretch">
        <div className="lg:col-span-5 flex">
          <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-full min-h-[220px] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/25 dark:ring-white/10 bg-slate-100 dark:bg-slate-950 shadow-sm">
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
                  src={TWO_STAGE_INVEST_IMAGE_URL}
                  alt={tLife('caption')}
                  referrerPolicy="no-referrer"
                  onError={() => setLifecycleImgFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-emerald-950/88 via-emerald-950/42 to-transparent">
                  <span className="text-xs font-medium text-white/95">
                    {tLife('caption')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-1.5 animate__animated animate__fadeInUp animate__faster">
            <div className="text-xs font-semibold text-teal-700 dark:text-teal-300">
              {tLife('eyebrow')}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {tLife('heading')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200/80 dark:border-[#163948]">
            <div className="space-y-2 animate__animated animate__fadeInUp amanah-stagger-1">
              <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-[#00ED64]">
                {tLife('stage1Index')}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {tLife('stage1Title')}
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {tLife('stage1Body')}
              </p>
            </div>

            <div className="space-y-2 sm:border-l sm:border-slate-200/80 sm:dark:border-[#163948] sm:pl-6 animate__animated animate__fadeInUp amanah-stagger-2">
              <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                {tLife('stage2Index')}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {tLife('stage2Title')}
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {tLife('stage2Body')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}
