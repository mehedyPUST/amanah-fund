'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Every applicant submits verified identity details (NID for member & nominee, photo, reference member, and ৳200 non-refundable fee) into a pending queue capped at 20 shares.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    iconClass:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
  },
  {
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura/Management (loan review & 15th-of-month updates), Savings Accounts Committee (joint custody & monthly bank statements), and Members.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    iconClass:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'Personal KYC fields, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest with AES-256-GCM and linked in a sequential SHA-256 hash chain.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/70',
    iconClass:
      'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Every Qard Hasan loan and Halal investment placement requires affirmative votes from at least two-thirds of active members; amendments require 2/3 Shura + 1/2 member quorum.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    iconClass:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
  },
  {
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks monthly ৳5,000 savings due by the 10th, isolates ৳50 late fees for annual January Sadaqah distribution, and syncs a 7-tab Google Sheets ledger.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700/70',
    iconClass:
      'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname();
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className="max-w-3xl space-y-4"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            Security &amp; Architecture · Term 2027–2036
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Interest-free mutual relief today. VISION-36 Halal assets and Islamic schools by 2036.
          </HeadingTag>
          <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Built for the Savings, Investment and Interest-Free Loan Fund Cooperative Society so 20 members can pool ৳5,000 monthly savings without interest, extend 0% Qard Hasan relief, and deploy capital into Shariah-vetted land, schools, and community ventures.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.Icon;
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.24, delay: idx * 0.05 }}
                className={`border rounded-xl p-6 space-y-3 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${pillar.cardStyle}`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${pillar.iconClass}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pillar.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className="bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-indigo-50/40 dark:from-emerald-950/35 dark:via-slate-900 dark:to-indigo-950/20 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-200 hover:shadow-md"
        >
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Ready to inspect the governance charter or apply for membership?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Review all eligibility criteria, repayment rules, and central balance accounting before submitting an application.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/#governance-charter"
              onClick={(e) => {
                if (pathname === '/') {
                  e.preventDefault();
                  document
                    .getElementById('governance-charter')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200 whitespace-nowrap"
            >
              Governance Charter
            </Link>
            <Link
              href="/signup"
              className="group px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
            >
              <span>Apply for Membership</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
