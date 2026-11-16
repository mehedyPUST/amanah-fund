'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Applicants submit KYC details, nominee NID, photo, reference member, and a ৳200 fee into a queue capped at 20 shares.',
    cardClass:
      'bg-gradient-to-br from-emerald-100/65 via-emerald-50/35 to-white/75 dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900/75 backdrop-blur-md border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700/80',
    iconClass:
      'bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/80 dark:ring-emerald-800/60',
  },
  {
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura Management (loan review & monthly updates), Savings Accounts (joint custody), and Members.',
    cardClass:
      'bg-gradient-to-br from-teal-100/65 via-teal-50/35 to-white/75 dark:from-teal-950/45 dark:via-teal-950/20 dark:to-slate-900/75 backdrop-blur-md border-teal-200/80 dark:border-teal-900/50 hover:border-teal-300 dark:hover:border-teal-700/80',
    iconClass:
      'bg-teal-100/90 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/80 dark:ring-teal-800/60',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'KYC fields, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest and linked in a SHA-256 hash chain.',
    cardClass:
      'bg-gradient-to-br from-violet-100/65 via-violet-50/35 to-white/75 dark:from-violet-950/45 dark:via-violet-950/20 dark:to-slate-900/75 backdrop-blur-md border-violet-200/80 dark:border-violet-900/50 hover:border-violet-300 dark:hover:border-violet-700/80',
    iconClass:
      'bg-violet-100/90 dark:bg-violet-950/70 text-violet-700 dark:text-violet-400 ring-1 ring-violet-200/80 dark:ring-violet-800/60',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Qard Hasan loans and Halal investments require a 2/3 member majority; charter amendments require 2/3 Shura + 1/2 member quorum.',
    cardClass:
      'bg-gradient-to-br from-orange-100/65 via-orange-50/35 to-white/75 dark:from-orange-950/45 dark:via-orange-950/20 dark:to-slate-900/75 backdrop-blur-md border-orange-200/80 dark:border-orange-900/50 hover:border-orange-300 dark:hover:border-orange-700/80',
    iconClass:
      'bg-orange-100/90 dark:bg-orange-950/70 text-orange-700 dark:text-orange-400 ring-1 ring-orange-200/80 dark:ring-orange-800/60',
  },
  {
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks ৳5,000 monthly savings due by the 10th, isolates ৳50 late fees for January Sadaqah, and syncs to Google Sheets.',
    cardClass:
      'bg-gradient-to-br from-slate-100/70 via-slate-50/35 to-white/75 dark:from-slate-800/50 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border-slate-200/80 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600',
    iconClass:
      'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300/80 dark:ring-slate-700',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={
        embedded
          ? 'bg-gradient-to-b from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100 w-full'
          : 'bg-gradient-to-b from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 shadow-2xs text-slate-900 dark:text-slate-100 w-full'
      }
    >
      <section className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.22 }}
          className="max-w-3xl space-y-1.5"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
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
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                className={`${spanClass} border rounded-xl p-4 space-y-2.5 transition-colors ${pillar.cardClass}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pillar.iconClass}`}>
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
