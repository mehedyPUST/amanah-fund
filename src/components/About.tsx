'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Applicants submit KYC details, nominee NID, photo, reference member, and a ৳200 fee into a queue capped at 20 shares.',
  },
  {
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura Management (loan review & monthly updates), Savings Accounts (joint custody), and Members.',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'KYC fields, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest and linked in a SHA-256 hash chain.',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Qard Hasan loans and Halal investments require a 2/3 member majority; charter amendments require 2/3 Shura + 1/2 member quorum.',
  },
  {
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks ৳5,000 monthly savings due by the 10th, isolates ৳50 late fees for January Sadaqah, and syncs to Google Sheets.',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={
        embedded
          ? 'bg-gradient-to-b from-emerald-50/45 via-white to-white dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100 w-full'
          : 'bg-gradient-to-b from-emerald-50/45 via-white to-white dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-5 sm:p-6 shadow-2xs text-slate-900 dark:text-slate-100 w-full'
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
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
                className={`${spanClass} border rounded-xl p-4 space-y-2.5 transition-colors bg-gradient-to-br from-emerald-50/75 via-emerald-50/25 to-white dark:from-emerald-950/35 dark:via-emerald-950/15 dark:to-slate-900 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700/80`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/80 dark:ring-emerald-800/60">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
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
