'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Applicants submit KYC details, nominee NID, photo, reference member, and a ৳200 fee into a queue capped at 20 shares.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    iconClass:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
  },
  {
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura Management (loan review & monthly updates), Savings Accounts (joint custody), and Members.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    iconClass:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'KYC fields, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest and linked in a SHA-256 hash chain.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/70',
    iconClass:
      'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Qard Hasan loans and Halal investments require a 2/3 member majority; charter amendments require 2/3 Shura + 1/2 member quorum.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    iconClass:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
  },
  {
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks ৳5,000 monthly savings due by the 10th, isolates ৳50 late fees for January Sadaqah, and syncs to Google Sheets.',
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700/70',
    iconClass:
      'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className="max-w-3xl space-y-3"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            Security &amp; Architecture · Term 2027–2036
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Interest-free mutual relief today. VISION-36 Halal assets and Islamic schools by 2036.
          </HeadingTag>
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
      </section>
    </div>
  );
}
