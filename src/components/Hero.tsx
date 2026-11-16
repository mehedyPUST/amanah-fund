'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Sheet, Vote } from 'lucide-react';
import { motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

const HERO_IMAGE_URL =
  'https://i.ibb.co.com/cc8kRKR3/Qard-Hasan-Banking-can-be-an-alternative.png';
const INVESTMENT_IMAGE_URL = 'https://i.ibb.co.com/21vdb554/coop-halal-investment.jpg';

const HIGHLIGHTS = [
  {
    Icon: Vote,
    title: '2/3 Democratic Member Voting',
    detail:
      'Every Qard Hasan loan request and Halal investment placement requires a verified 2/3 supermajority ballot with SHA-256 voter signatures.',
    cardStyle:
      'bg-white dark:bg-slate-950 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    iconBg:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
  },
  {
    Icon: Lock,
    title: 'End-to-End Encrypted Ledger',
    detail:
      'Applicant KYC records, Bank/MFS transaction IDs, and audit metadata are encrypted at rest with AES-256-GCM and protected by HttpOnly JWT sessions.',
    cardStyle:
      'bg-white dark:bg-slate-950 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/70',
    iconBg:
      'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
  },
  {
    Icon: Sheet,
    title: 'Live Google Sheets & Gmail Sync',
    detail:
      'Mirror a 7-tab treasury blueprint to Google Sheets and dispatch Gmail alerts for contributions, approvals, and scheduled repayments.',
    cardStyle:
      'bg-white dark:bg-slate-950 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    iconBg:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
  },
  {
    Icon: ShieldCheck,
    title: 'Admin-Verified Onboarding',
    detail:
      'Applicants submit verified identification, references, and portrait uploads for administrator review before gaining access to cooperative funds.',
    cardStyle:
      'bg-white dark:bg-slate-950 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    iconBg:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
  },
];

const METRICS = [
  {
    value: '0% · ৳50k',
    label: 'Qard Hasan (or 75% Savings)',
    cardHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
    valueColor: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    value: '2/3',
    label: 'Investment & Loan Quorum',
    cardHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
    valueColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    value: '20 · 10m',
    label: 'Max Shares · Max Repay',
    cardHover: 'hover:border-indigo-300 dark:hover:border-indigo-700/70',
    valueColor: 'text-indigo-700 dark:text-indigo-400',
  },
];

export function Hero() {
  const pathname = usePathname();
  const { user } = useCoopSession();

  function handleSectionLink(e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) {
    if (pathname === '/') {
      e.preventDefault();
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="relative bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-emerald-50/70 via-teal-50/30 to-transparent dark:from-emerald-950/25 dark:via-indigo-950/10 dark:to-transparent"
      />

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="lg:col-span-6 space-y-6"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Savings, Investment &amp; Interest-Free Loan Fund ·{' '}
              <span className="text-teal-700 dark:text-teal-400">VISION-36 (2027–2036)</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] text-balance">
              Cooperative Treasury Governed by Shariah &amp; 2/3 Consensus
            </h1>

            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              A 20-member cooperative pooling ৳5,000 monthly savings by the 10th of each month. Ongoing capital sustains 0% interest Qard Hasan loans (up to ৳50,000 or 75% of savings over 10 months) while advancing 2/3-approved Halal real-economy ventures toward VISION-36.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group px-5 py-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span>{user ? 'Enter Member Portal' : 'Apply for Membership'}</span>
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>

              {!user && (
                <Link
                  href="/login"
                  className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 text-sm font-medium shadow-2xs hover:shadow-sm transition-all duration-200 whitespace-nowrap"
                >
                  Member Sign In
                </Link>
              )}

              <Link
                href="/#governance-charter"
                onClick={(e) => handleSectionLink(e, 'governance-charter')}
                className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 transition-colors whitespace-nowrap"
              >
                Governance Charter
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-4">
              {METRICS.map((metric, idx) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: 0.08 * idx }}
                  className={`p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${metric.cardHover}`}
                >
                  <div
                    className={`font-mono text-lg sm:text-2xl font-bold tabular-nums ${metric.valueColor}`}
                  >
                    {metric.value}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {metric.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32 }}
            className="lg:col-span-6"
          >
            <div className="p-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/50 dark:from-emerald-950/25 dark:via-slate-900 dark:to-teal-950/20 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 aspect-[16/10]">
                <img
                  src={HERO_IMAGE_URL}
                  alt="Qard Hasan cooperative banking alternative visualization for Amanah"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.25 }}
            className="max-w-2xl space-y-2"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              Platform Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Built for Financial Integrity and Cooperative Accountability
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((item, idx) => {
              const Icon = item.Icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.24, delay: idx * 0.06 }}
                  className={`p-5 rounded-xl border space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${item.cardStyle}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.iconBg}`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.28 }}
            className="lg:col-span-5"
          >
            <div className="p-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-amber-50/50 via-white to-teal-50/50 dark:from-amber-950/20 dark:via-slate-900 dark:to-teal-950/20 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 aspect-[4/3]">
                <img
                  src={INVESTMENT_IMAGE_URL}
                  alt="Shariah-compliant Halal cooperative investment sectors after fund maturity"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.28 }}
            className="lg:col-span-7 space-y-6"
          >
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Two-Stage Capital Lifecycle
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                How Central Fund Balances Evolve from Mutual Relief to Productive Equity
              </h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70 flex items-start gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CheckCircle2
                  className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Live Central Balance Formula
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Accepted Bank/MFS contributions immediately credit the Central Balance. When a Qard Hasan loan passes 2/3 member voting, its principal deducts from the central balance; every verified monthly installment restores funds back to the pool.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70 flex items-start gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CheckCircle2
                  className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Post-Maturity Halal Investment Placements
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    After the pre-specified maturity date, members vote “Yes” or “No” in real time on vetted Mudarabah, Musharakah, and Murabahah projects—requiring a 2/3 approval threshold before capital deployment.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/#architecture"
                onClick={(e) => handleSectionLink(e, 'architecture')}
                className="px-4 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-white dark:bg-slate-900 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 transition-all duration-200 whitespace-nowrap"
              >
                Security &amp; Architecture
              </Link>
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
              >
                <span>{user ? 'Open Member Portal' : 'Submit Membership Application'}</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
