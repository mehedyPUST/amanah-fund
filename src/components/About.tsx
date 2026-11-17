'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';
import { MotionCard, type CardHue } from './MotionCard.tsx';

const PILLARS: Array<{
  index: string;
  Icon: typeof ShieldCheck;
  title: string;
  description: string;
  hue: CardHue;
  iconBoxClass: string;
  badgeClass: string;
}> = [
  {
    index: '01.',
    Icon: ShieldCheck,
    title: '20-Member Shura-Approved Onboarding',
    description:
      'Applicants submit KYC details, nominee NID, portrait photo, existing member reference, and a ৳200 fee into a queue capped at 20 shares.',
    hue: 'emerald',
    iconBoxClass:
      'bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    badgeClass:
      'bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  },
  {
    index: '02.',
    Icon: Users,
    title: '5-Member Shura & Savings Committees',
    description:
      'Separation of duties across Shura Management (loan review and monthly updates), Savings Accounts (joint custody), and verified Members.',
    hue: 'violet',
    iconBoxClass:
      'bg-violet-100/85 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
    badgeClass:
      'bg-violet-100/80 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300',
  },
  {
    index: '03.',
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'Sensitive KYC fields, Bank/MFS transaction references, and disbursement contexts are encrypted at rest and linked in a tamper-evident hash chain.',
    hue: 'teal',
    iconBoxClass:
      'bg-teal-100/85 dark:bg-teal-500/15 border border-teal-200/70 dark:border-teal-500/25 text-teal-700 dark:text-teal-300',
    badgeClass:
      'bg-teal-100/80 dark:bg-teal-500/15 text-teal-800 dark:text-teal-300',
  },
  {
    index: '04.',
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Qard Hasan loans and Halal investments require a two-thirds member majority; charter amendments require 2/3 Shura plus 1/2 member quorum.',
    hue: 'amber',
    iconBoxClass:
      'bg-amber-100/85 dark:bg-amber-500/15 border border-amber-200/70 dark:border-amber-500/25 text-amber-700 dark:text-amber-300',
    badgeClass:
      'bg-amber-100/80 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    index: '05.',
    Icon: KeyRound,
    title: 'VISION-36 & Sadaqah Late-Fee Ledger',
    description:
      'Tracks ৳5,000 monthly savings due by the 10th, isolates ৳50 late fees for annual January Sadaqah distribution, and syncs live to Google Sheets.',
    hue: 'violet',
    iconBoxClass:
      'bg-violet-100/85 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
    badgeClass:
      'bg-violet-100/80 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={`bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs text-slate-900 dark:text-slate-100 w-full ${
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
              <MotionCard
                key={pillar.title}
                hue={pillar.hue}
                delay={idx * 0.03}
                inView
                className={`${spanClass} backdrop-blur-md rounded-xl border p-5 space-y-3 shadow-xs hover:shadow-md transition-all duration-200`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pillar.iconBoxClass}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full ${pillar.badgeClass}`}
                  >
                    {pillar.index}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                  {pillar.description}
                </p>
              </MotionCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
