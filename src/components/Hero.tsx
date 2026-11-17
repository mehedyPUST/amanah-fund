'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, HandCoins, LayoutDashboard, Shield } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

const HERO_IMAGE_URL =
  'https://i.ibb.co.com/cc8kRKR3/Qard-Hasan-Banking-can-be-an-alternative.png';
const INVESTMENT_IMAGE_URL =
  'https://i.ibb.co.com/21vdb554/coop-halal-investment.jpg';

const KEY_TERMS: Array<{
  kicker: string;
  meta: string;
  value: string;
  sublabel: string;
  hue: CardHue;
  cardClass: string;
  metaClass: string;
}> = [
  {
    kicker: 'Qard Hasan Ceiling',
    meta: '0% Interest',
    value: '৳50,000',
    sublabel: 'Or up to 75% of personal verified savings',
    hue: 'emerald',
    cardClass:
      'bg-white/90 dark:bg-slate-900/85 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80',
    metaClass: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    kicker: 'Monthly Contribution',
    meta: 'Due 10th Monthly',
    value: '৳5,000',
    sublabel: 'Pooled per share with ৳50 Sadaqah late-fee isolation',
    hue: 'teal',
    cardClass:
      'bg-white/90 dark:bg-slate-900/85 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80',
    metaClass: 'text-teal-700 dark:text-teal-400',
  },
  {
    kicker: 'Supermajority Quorum',
    meta: 'Secret Ballot',
    value: '2/3 Vote',
    sublabel: 'Required consensus for loans & Halal capital deployment',
    hue: 'amber',
    cardClass:
      'bg-white/90 dark:bg-slate-900/85 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80',
    metaClass: 'text-amber-700 dark:text-amber-400',
  },
  {
    kicker: 'Charter Term & Cap',
    meta: '2027–2036',
    value: '20 Shares',
    sublabel: 'Up to 10-month revolving repayment schedules',
    hue: 'sky',
    cardClass:
      'bg-white/90 dark:bg-slate-900/85 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80',
    metaClass: 'text-teal-700 dark:text-teal-400',
  },
];

export function Hero({
  includeLifecycle = true,
  embedded = false,
}: {
  includeLifecycle?: boolean;
  embedded?: boolean;
}) {
  const { user, authChecking } = useCoopSession();
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-4 w-full">
      {/* Main Hero Statement + Architectural Showcase */}
      <MotionCard
        as="section"
        hue="emerald"
        className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs hover:shadow-md transition-all duration-200"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between gap-6 py-1">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  Shariah Cooperative Treasury
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">2027–2036 Charter</span>
                <span aria-hidden="true">·</span>
                <span>20-Member Cap</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[clamp(2.35rem,3.4vw,3.15rem)] font-bold tracking-[-0.025em] text-slate-900 dark:text-white leading-[1.08] text-balance max-w-2xl">
                Interest-free mutual relief governed by 2/3 consensus
              </h1>

              <p className="text-[15px] sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl text-justify">
                Twenty verified shareholders pool ৳5,000 monthly savings into an encrypted cooperative ledger—extending 0% Qard Hasan relief loans today and deploying 2/3-approved Halal assets toward 2036.
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
                    <span>Open Dashboard</span>
                  </>
                ) : (
                  <>
                    <span>Join Amanah</span>
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
                  Member Sign In
                </Link>
              )}

              {!authChecking && user && user.status === 'active' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('notice-board')}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Notice Board
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
                How It Works
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 flex">
            <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-full min-h-[240px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-950">
              {heroImgFailed ? (
                <div className="w-full h-full p-8 bg-gradient-to-br from-emerald-950/15 via-slate-100 to-teal-950/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center justify-center text-center gap-2.5">
                  <Shield className="w-10 h-10 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Amanah Cooperative Sanctuary
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    0% Qard Hasan Relief · 2/3 Member Quorum
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={HERO_IMAGE_URL}
                    alt="Qard Hasan ethical interest-free banking alternative banner"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent flex items-end justify-between gap-3"
                  >
                    <div className="text-xs text-white/95 font-medium">
                      Dual Shura &amp; Savings Custody · AES-256-GCM Ledger
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
        {KEY_TERMS.map((metric, idx) => (
          <MotionCard
            key={metric.kicker}
            hue={metric.hue}
            delay={0.03 * idx}
            className={`backdrop-blur-md border rounded-xl p-5 shadow-xs hover:shadow-md flex flex-col justify-between gap-3 transition-all duration-200 ${metric.cardClass}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                {metric.kicker}
              </span>
              <span className={`font-mono text-[11px] font-semibold shrink-0 ${metric.metaClass}`}>
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
  const [lifecycleImgFailed, setLifecycleImgFailed] = useState(false);

  return (
    <MotionCard
      as="section"
      id="lifecycle"
      hue="teal"
      inView
      className={`scroll-mt-2 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/90 dark:hover:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 ${
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
                  Halal Capital Lifecycle
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Mutual Relief → Productive Equity
                </div>
              </div>
            ) : (
              <>
                <img
                  src={INVESTMENT_IMAGE_URL}
                  alt="Amanah VISION-36 Halal cooperative investment horizon"
                  referrerPolicy="no-referrer"
                  onError={() => setLifecycleImgFailed(true)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-950/75 via-slate-950/30 to-transparent">
                  <span className="text-xs font-medium text-white/95">
                    VISION-36 Real-Economy Asset Horizon
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Two-Stage Capital Lifecycle
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              From immediate 0% mutual relief to productive Halal equity
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200/75 dark:border-slate-800">
            <div className="space-y-2">
              <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                01. Active Qard Hasan Pool
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Revolving Central Balance Formula
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                Verified member deposits credit the central pool; 2/3-approved Qard Hasan loans disburse interest-free principal; monthly installments restore liquidity cleanly.
              </p>
            </div>

            <div className="space-y-2 sm:border-l sm:border-slate-200/75 sm:dark:border-slate-800 sm:pl-6">
              <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                02. Post-Maturity Ventures
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                2/3-Voted Halal Asset Deployment
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                Upon reaching the maturity threshold, members vote on Mudarabah, Musharakah, and Murabahah ventures by 2/3 supermajority before capital deployment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}
