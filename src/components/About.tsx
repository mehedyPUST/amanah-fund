'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';

const PILLARS = [
  {
    index: '01.',
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Applicants submit KYC details, nominee NID, portrait photo, existing member reference, and a ৳200 fee into a queue capped at 20 shares.',
  },
  {
    index: '02.',
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura Management (loan review and monthly updates), Savings Accounts (joint custody), and verified Members.',
  },
  {
    index: '03.',
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'Sensitive KYC fields, Bank/MFS transaction references, and disbursement contexts are encrypted at rest and linked in a tamper-evident hash chain.',
  },
  {
    index: '04.',
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Qard Hasan loans and Halal investments require a two-thirds member majority; charter amendments require 2/3 Shura plus 1/2 member quorum.',
  },
  {
    index: '05.',
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks ৳5,000 monthly savings due by the 10th, isolates ৳50 late fees for annual January Sadaqah distribution, and syncs live to Google Sheets.',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={`bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs text-slate-900 dark:text-slate-100 w-full ${
        embedded ? 'p-6 sm:p-7' : 'p-6 sm:p-9'
      }`}
    >
      <section className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800"
        >
          <div className="max-w-3xl space-y-2">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Security &amp; Architecture · Term 2027–2036
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
              }
            >
              Interest-free mutual relief today, VISION-36 Halal assets by 2036
            </HeadingTag>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
            5 Core Custody Safeguards
          </span>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.Icon;
            const spanClass = idx < 3 ? 'xl:col-span-2' : 'xl:col-span-3';
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.18, delay: idx * 0.03 }}
                className={`${spanClass} rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/75 dark:bg-slate-950/55 p-5 space-y-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {pillar.index}
                  </span>
                  <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
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
