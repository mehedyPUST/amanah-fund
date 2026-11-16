'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  HandCoins,
  LayoutDashboard,
  Lock,
  MessageSquare,
  ScrollText,
  Shield,
  ShieldCheck,
  TrendingUp,
  Vote,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

export type HeroSectionTarget =
  | 'notice-board'
  | 'community'
  | 'architecture'
  | 'how-it-works'
  | 'governance-charter';

const METRICS = [
  {
    kicker: 'QARD HASAN CAP',
    value: '৳50,000',
    sublabel: 'Up to 75% of member savings',
    badgeText: '0% Interest',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400',
    valueColor: 'text-emerald-700 dark:text-emerald-400',
    footerText: 'Max 10-month repayment',
    Icon: HandCoins,
  },
  {
    kicker: 'MONTHLY SAVINGS',
    value: '৳5,000',
    sublabel: 'Per cooperative share',
    badgeText: 'Due 10th',
    badgeClass: 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400',
    valueColor: 'text-slate-900 dark:text-white',
    footerText: 'Capped at 20 total shares',
    Icon: Wallet,
  },
  {
    kicker: 'BALLOT QUORUM',
    value: '2/3',
    sublabel: 'Secret member supermajority',
    badgeText: 'Consensus',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
    valueColor: 'text-amber-600 dark:text-amber-400',
    footerText: 'Loans & Halal ventures',
    Icon: Vote,
  },
  {
    kicker: 'CYCLE HORIZON',
    value: '10 Yrs',
    sublabel: 'Jan 2027 through Dec 2036',
    badgeText: 'VISION-36',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400',
    valueColor: 'text-indigo-700 dark:text-indigo-400',
    footerText: 'Land shares & Islamic schools',
    Icon: Shield,
  },
];

const MICRO_RULES = [
  {
    label: 'ADMISSION FEE',
    value: '৳200',
    hint: 'One-time KYC fee',
    boxClass: 'bg-purple-50/60 dark:bg-purple-950/25 border-purple-200/70 dark:border-purple-900/50',
    labelClass: 'text-purple-700 dark:text-purple-400',
  },
  {
    label: 'SHARE CAP',
    value: '20',
    hint: 'Max member shares',
    boxClass: 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200/70 dark:border-emerald-900/50',
    labelClass: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    label: 'LATE FEE',
    value: '৳50',
    hint: 'Annual Jan Sadaqah',
    boxClass: 'bg-cyan-50/60 dark:bg-cyan-950/25 border-cyan-200/70 dark:border-cyan-900/50',
    labelClass: 'text-cyan-700 dark:text-cyan-400',
  },
  {
    label: 'SHURA BOARD',
    value: '5',
    hint: 'Elected review desk',
    boxClass: 'bg-amber-50/60 dark:bg-amber-950/25 border-amber-200/70 dark:border-amber-900/50',
    labelClass: 'text-amber-700 dark:text-amber-400',
  },
  {
    label: 'CUSTODIANS',
    value: '5',
    hint: 'Joint bank holders',
    boxClass: 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200/70 dark:border-rose-900/50',
    labelClass: 'text-rose-700 dark:text-rose-400',
  },
  {
    label: 'BYLAWS',
    value: '25',
    hint: 'Charter articles',
    boxClass: 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200/90 dark:border-slate-800',
    labelClass: 'text-slate-600 dark:text-slate-400',
  },
];

export function Hero({
  includeLifecycle = true,
  embedded = false,
  onNavigateSection,
}: {
  includeLifecycle?: boolean;
  embedded?: boolean;
  onNavigateSection?: (section: HeroSectionTarget) => void;
}) {
  const { user, authChecking } = useCoopSession();
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');

  function goTo(section: HeroSectionTarget) {
    if (onNavigateSection) {
      onNavigateSection(section);
    } else if (typeof window !== 'undefined') {
      window.location.hash = section;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }

  return (
    <div className={embedded ? 'space-y-2.5' : 'space-y-3 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6'}>
      {/* Subtle Live Context Row matching Dashboard Overview */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
        <div className="text-slate-600 dark:text-slate-400">
          {!authChecking && user ? (
            <>
              Welcome back, <span className="font-semibold text-slate-900 dark:text-white">{user.name}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
              <span className="capitalize">{user.role} portal overview</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-900 dark:text-white">Amanah Cooperative Treasury</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
              <span>Shariah-governed mutual fund overview</span>
            </>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span className="font-mono tabular-nums">VISION-36 · 2027–2036</span>
        </div>
      </div>

      {/* Dotted Section Eyebrow matching Dashboard Screenshot */}
      <div className="flex items-center gap-2 px-0.5 pt-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Fund Diagnostics &amp; Summary
        </span>
      </div>

      {/* 4-Column KPI Cards matching Dashboard Screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {METRICS.map((metric, idx) => {
          const Icon = metric.Icon;
          return (
            <motion.div
              key={metric.kicker}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.04 * idx }}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                  {metric.kicker}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 ${metric.badgeClass}`}>
                  {metric.badgeText}
                </span>
              </div>
              <div className="space-y-0.5">
                <div className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${metric.valueColor}`}>
                  {metric.value}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {metric.sublabel}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                <Icon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                <span className="truncate">{metric.footerText}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 6-Tile Pastel Governance Strip matching Dashboard Screenshot */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {MICRO_RULES.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-3.5 py-3 shadow-2xs flex flex-col justify-between gap-1 ${item.boxClass}`}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${item.labelClass}`}>
              {item.label}
            </div>
            <div className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white leading-tight">
              {item.value}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {item.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Gradient Mandate Hero Banner matching OverviewView */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="bg-gradient-to-br from-emerald-50/75 via-teal-50/35 to-white dark:from-emerald-950/35 dark:via-teal-950/20 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Savings, Investment &amp; Interest-Free Loan Fund
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                20-Share Term (2027–2036)
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Cooperative Treasury Governed by Shariah &amp; 2/3 Consensus
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
              Pooling ৳5,000 monthly member savings for strictly 0% Qard Hasan mutual relief and 2/3-approved Halal real-economy ventures.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => goTo('how-it-works')}
              className="px-3.5 py-2 rounded-lg border border-indigo-200/90 dark:border-indigo-800/70 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              How It Works
            </button>

            {isActiveMember && (
              <button
                type="button"
                onClick={() => goTo('notice-board')}
                className="px-3.5 py-2 rounded-lg border border-emerald-200/90 dark:border-emerald-800/70 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Notice Board
              </button>
            )}

            <Link
              href={user ? '/dashboard' : '/signup'}
              className="group px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {user ? (
                <>
                  <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Dashboard</span>
                </>
              ) : (
                <>
                  <span>Join Amanah</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Bottom 2-Column Split Grid matching Dashboard Overview */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        {/* Left Card: Two-Stage Capital Lifecycle */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>Capital Lifecycle</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                From interest-free mutual support to shared Halal real-economy equity.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 text-[11px] font-medium shrink-0">
              2 Stages
            </span>
          </div>

          <div className="space-y-2">
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Stage 01 · Live Central Balance &amp; Qard Hasan
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Verified monthly savings credit the pool; 2/3-voted loans deduct principal at 0% interest and restore on repayment.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Stage 02 · Post-Maturity Halal Ventures
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Mudarabah, Musharakah, and VISION-36 real-asset investments require a formal 2/3 member vote before deployment.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Dual 5-member Shura &amp; Savings oversight
            </span>
            <button
              type="button"
              onClick={() => goTo('architecture')}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Architecture</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right Card: Community, Security & Charter Shortcuts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>Member Hub &amp; Governance Charter</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Encrypted discussions, official notices, and the Articles 1–25 constitution.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 text-[11px] font-medium shrink-0">
              AES-256-GCM
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => goTo('community')}
              className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-300 dark:hover:border-teal-700 p-3 space-y-1.5 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <MessageSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <Lock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Community &amp; Polls
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Member feed, verified peer directory, and encrypted direct messages.
              </p>
            </button>

            <button
              type="button"
              onClick={() => goTo('governance-charter')}
              className="text-left rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-amber-300 dark:hover:border-amber-700 p-3 space-y-1.5 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <ScrollText className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Charter &amp; PDF (Art. 1–25)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Full bylaws, arrears rules, and downloadable official constitution PDF.
              </p>
            </button>
          </div>

          <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              SHA-256 tamper-evident audit chain
            </span>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>{user ? 'Go to Dashboard' : 'Member Sign In'}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {includeLifecycle && <HeroLifecycle embedded={embedded} />}
    </div>
  );
}

export function HeroLifecycle({ embedded = false }: { embedded?: boolean }) {
  return (
    <section
      id="lifecycle"
      className={
        embedded
          ? 'scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs'
          : 'scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-2xs'
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Two-Stage Capital Lifecycle
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              From Mutual Relief to Productive Equity
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            Jan 2027 – Dec 2036
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 flex items-start gap-3 transition-colors">
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

          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 flex items-start gap-3 transition-colors">
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
    </section>
  );
}
