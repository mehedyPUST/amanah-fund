'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Sheet, Vote } from 'lucide-react';
import { motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

const HIGHLIGHTS = [
  {
    Icon: Vote,
    title: '2/3 Democratic Member Voting',
    detail:
      'Every Qard Hasan loan request and Halal investment placement requires a verified 2/3 supermajority ballot with SHA-256 voter signatures.',
  },
  {
    Icon: Lock,
    title: 'End-to-End Encrypted Ledger',
    detail:
      'Bank/MFS transaction IDs, payout accounts, and audit metadata are encrypted at rest with AES-256-GCM and protected by HttpOnly JWT sessions.',
  },
  {
    Icon: Sheet,
    title: 'Live Google Sheets & Gmail Sync',
    detail:
      'Automatically mirror a 7-tab treasury blueprint to Google Sheets and dispatch Gmail alerts for contributions, approvals, and repayments.',
  },
  {
    Icon: ShieldCheck,
    title: 'Admin-Gated Onboarding',
    detail:
      'New registrations enter a pending verification queue. Only administrator-approved members can sign in and access cooperative funds.',
  },
];

export function PublicHomeView() {
  const { user } = useCoopSession();

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Split Architectural Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-6 space-y-6"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Interest-Free Qard Hasan · Post-Maturity Halal Capital
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] text-balance">
              Cooperative Treasury Governed by Transparency and 2/3 Consensus
            </h1>

            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              Members pool monthly contributions via Bank or MFS into an audited central fund.
              Until the pre-specified maturity date, capital sustains 0% interest Qard Hasan loans
              for members; after maturity, the cooperative invests in Shariah-vetted real-economy
              projects.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={user ? '/dashboard' : '/login'}
                className="px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <span>{user ? 'Enter Members Dashboard' : 'Member Sign In / Apply'}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>

              <Link
                href="/rules"
                className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Read Cooperative Rules
              </Link>
            </div>

            {/* Clean Architectural Metrics Row */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  0%
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Interest (Qard Hasan)
                </div>
              </div>
              <div>
                <div className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  2/3
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Approval Quorum
                </div>
              </div>
              <div>
                <div className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  3 / yr
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configurable Loan Cap
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-6"
          >
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800 aspect-video shadow-sm">
              <img
                src="/images/coop_hero_architecture_1794662148031.jpg"
                alt="Minimalist architectural glass atrium representing transparent Amanah Co-op governance"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Core Capabilities Grid */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 space-y-10">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Platform Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Built for Financial Integrity and Cooperative Accountability
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.Icon;
              return (
                <div
                  key={item.title}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dual-Phase Fund Lifecycle & Halal Asset Transition */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800 aspect-[4/3] shadow-sm">
              <img
                src="/images/coop_halal_investment_1794662148589.jpg"
                alt="Solar-powered agricultural cold storage facility representing Shariah-compliant cooperative investments"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Two-Stage Capital Lifecycle
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                How Central Fund Balances Evolve from Mutual Relief to Productive Equity
              </h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <CheckCircle2
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Live Central Balance Formula
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Accepted Bank/MFS contributions immediately credit the Central Balance. When a
                    Qard Hasan loan passes 2/3 member voting, its principal deducts from the central
                    balance; every verified monthly installment restores funds back to the pool.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <CheckCircle2
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Post-Maturity Halal Investment Placements
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    After the pre-specified maturity date, members vote &ldquo;Yes&rdquo; or
                    &ldquo;No&rdquo; in real time on vetted Mudarabah, Musharakah, and Murabahah
                    projects—requiring a 2/3 approval threshold before capital deployment.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/about"
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Explore Security & RBAC
              </Link>
              <Link
                href={user ? '/dashboard' : '/login'}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <span>{user ? 'Open Members Dashboard' : 'Sign In to Member Portal'}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
