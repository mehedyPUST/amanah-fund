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
    <div
      className={
        embedded
          ? 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100'
          : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-8 shadow-2xs text-slate-900 dark:text-slate-100 max-w-7xl mx-auto'
      }
    >
      <section className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.22 }}
          className="max-w-3xl space-y-1.5"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            Security &amp; Architecture · Term 2027–2036
          </div>
          <HeadingTag
            className={
              embedded
                ? 'text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                : 'text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
            }
          >
            Interest-free mutual relief today. VISION-36 Halal assets and Islamic schools by 2036.
          </HeadingTag>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2.5">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.Icon;
            const spanClass = idx < 3 ? 'xl:col-span-2' : 'xl:col-span-3';
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                className={`${spanClass} border rounded-xl p-4 space-y-2.5 transition-colors bg-slate-50/70 dark:bg-slate-950/60 border-slate-200/90 dark:border-slate-800 ${pillar.cardStyle.replace(/bg-white dark:bg-slate-900 /g, '')}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${pillar.iconClass}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
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
