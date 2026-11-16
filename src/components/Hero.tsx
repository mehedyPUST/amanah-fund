'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, HandCoins, LayoutDashboard, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

const HERO_IMAGE_URL =
  'https://i.ibb.co.com/cc8kRKR3/Qard-Hasan-Banking-can-be-an-alternative.png';
const INVESTMENT_IMAGE_URL = 'https://i.ibb.co.com/21vdb554/coop-halal-investment.jpg';

const KEY_TERMS = [
  {
    kicker: 'QARD HASAN CAP',
    value: '0% · ৳50k',
    sublabel: 'Or up to 75% of savings',
    badgeText: 'Interest-Free',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400',
    valueColor: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    kicker: 'MONTHLY TARGET',
    value: '৳5,000',
    sublabel: 'Per share · due 10th monthly',
    badgeText: 'Pooled',
    badgeClass: 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400',
    valueColor: 'text-slate-900 dark:text-white',
  },
  {
    kicker: 'BALLOT QUORUM',
    value: '2/3',
    sublabel: 'Approval for loans & ventures',
    badgeText: 'Consensus',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
    valueColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    kicker: 'TERM & CAPACITY',
    value: '20 · 10m',
    sublabel: 'Max 20 shares · max 10m repay',
    badgeText: '2027–2036',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400',
    valueColor: 'text-indigo-700 dark:text-indigo-400',
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
    <div className={embedded ? 'space-y-2.5' : 'space-y-3 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6'}>
      {/* Hero Banner Card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="bg-gradient-to-br from-emerald-50/75 via-teal-50/35 to-white dark:from-emerald-950/35 dark:via-teal-950/20 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-4 sm:p-6 shadow-2xs"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Savings, Investment &amp; Interest-Free Loan Fund
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                  VISION-36 (2027–2036)
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-[2.1rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15] text-balance">
                Cooperative Treasury Governed by Shariah &amp; 2/3 Consensus
              </h1>

              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                A 20-member cooperative pooling ৳5,000 monthly savings for strictly 0% Qard Hasan mutual relief and 2/3-approved Halal real-economy ventures.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs sm:text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2 whitespace-nowrap"
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
                      className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </Link>

              {!user && (
                <Link
                  href="/login"
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap"
                >
                  Sign In
                </Link>
              )}

              {!authChecking && user && user.status === 'active' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('notice-board')}
                  className="px-3.5 py-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/70 bg-white/85 dark:bg-slate-900/85 text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Notice Board
                </button>
              )}

              <button
                type="button"
                onClick={() => scrollToSection('how-it-works')}
                className="px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400 transition-colors whitespace-nowrap cursor-pointer"
              >
                How It Works
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="w-full rounded-xl overflow-hidden border border-emerald-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 flex items-center justify-center">
              {heroImgFailed ? (
                <div className="w-full py-10 px-6 bg-gradient-to-br from-emerald-600/10 via-teal-600/10 to-indigo-600/10 rounded-lg flex flex-col items-center justify-center text-center gap-2">
                  <Shield className="w-10 h-10 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Qard Hasan Cooperative Model
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    0% Interest Relief · 2/3 Shariah Quorum
                  </div>
                </div>
              ) : (
                <img
                  src={HERO_IMAGE_URL}
                  alt="Qard Hasan cooperative banking alternative visualization for Amanah"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-auto max-h-[260px] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* 4-Column Dashboard-Aligned Key Rule Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {KEY_TERMS.map((metric, idx) => (
          <motion.div
            key={metric.kicker}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 * idx }}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                {metric.kicker}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 ${metric.badgeClass}`}>
                {metric.badgeText}
              </span>
            </div>
            <div>
              <div className={`font-mono text-xl sm:text-2xl font-bold tabular-nums ${metric.valueColor}`}>
                {metric.value}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {metric.sublabel}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {includeLifecycle && <HeroLifecycle embedded={embedded} />}
    </div>
  );
}

export function HeroLifecycle({ embedded = false }: { embedded?: boolean }) {
  const [lifecycleImgFailed, setLifecycleImgFailed] = useState(false);

  return (
    <section
      id="lifecycle"
      className={
        embedded
          ? 'scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs'
          : 'scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-2xs'
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-5">
          <div className="w-full aspect-[16/10] rounded-xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
            {lifecycleImgFailed ? (
              <div className="w-full h-full p-6 bg-gradient-to-br from-amber-500/10 via-teal-500/10 to-emerald-500/10 flex flex-col items-center justify-center text-center gap-2">
                <HandCoins className="w-9 h-9 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Halal Capital Lifecycle
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Mutual Relief → Productive Equity
                </div>
              </div>
            ) : (
              <img
                src={INVESTMENT_IMAGE_URL}
                alt="Shariah-compliant Halal cooperative investment sectors after fund maturity"
                referrerPolicy="no-referrer"
                onError={() => setLifecycleImgFailed(true)}
                className="w-full h-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Two-Stage Capital Lifecycle
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              From Mutual Relief to Productive Equity
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 flex items-start gap-2.5 transition-colors">
              <CheckCircle2
                className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Live Central Balance Formula
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Verified deposits credit the pool; 2/3-approved Qard Hasan loans deduct principal; monthly repayments restore the fund.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 flex items-start gap-2.5 transition-colors">
              <CheckCircle2
                className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Post-Maturity Halal Investments
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Members vote on Mudarabah, Musharakah, and Murabahah ventures with a 2/3 supermajority quorum before deployment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
