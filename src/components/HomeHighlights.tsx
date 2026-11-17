'use client';

import Link from 'next/link';
import {
  ArrowRight,
  HelpCircle,
  MessageSquare,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';

const EXPLORE_PAGES = [
  {
    href: '/community',
    index: '01.',
    label: 'Community Hub',
    eyebrow: 'Members & Discussions',
    description:
      'Access member feed updates, cooperative polls, the verified directory, and AES-256-GCM encrypted direct messages.',
    cta: 'Open Community',
    Icon: MessageSquare,
    spanClass: 'lg:col-span-7',
    cardClass:
      'bg-gradient-to-br from-emerald-100/75 via-emerald-50/35 to-white/85 dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900/80 border-emerald-200/80 dark:border-emerald-900/50',
  },
  {
    href: '/how-it-works',
    index: '02.',
    label: 'How It Works',
    eyebrow: 'Role Workflows',
    description:
      'Step-by-step guides for cooperative Members, 5-member Shura Managers, and system Administrators.',
    cta: 'View Workflows',
    Icon: HelpCircle,
    spanClass: 'lg:col-span-5',
    cardClass:
      'bg-gradient-to-br from-teal-100/75 via-teal-50/35 to-white/85 dark:from-teal-950/45 dark:via-teal-950/20 dark:to-slate-900/80 border-teal-200/80 dark:border-teal-900/50',
  },
  {
    href: '/about',
    index: '03.',
    label: 'Security & Architecture',
    eyebrow: 'Trust Stack',
    description:
      '20-share KYC onboarding, dual Shura and Savings committees, AES-256-GCM encrypted fields, and SHA-256 audit chains.',
    cta: 'Inspect Architecture',
    Icon: ShieldCheck,
    spanClass: 'lg:col-span-5',
    cardClass:
      'bg-gradient-to-br from-sky-100/75 via-sky-50/35 to-white/85 dark:from-sky-950/45 dark:via-sky-950/20 dark:to-slate-900/80 border-sky-200/80 dark:border-sky-900/50',
  },
  {
    href: '/rules',
    index: '04.',
    label: 'Governance Charter',
    eyebrow: 'Articles 1–25 · PDF',
    description:
      'Read the official VISION-36 cooperative constitution, arrears policies, Qard Hasan ceilings, and preview the signed PDF.',
    cta: 'Read Charter',
    Icon: ScrollText,
    spanClass: 'lg:col-span-7',
    cardClass:
      'bg-gradient-to-br from-amber-100/75 via-amber-50/35 to-white/85 dark:from-amber-950/45 dark:via-amber-950/20 dark:to-slate-900/80 border-amber-200/80 dark:border-amber-900/50',
  },
];

export function HomeHighlights() {
  return (
    <section className="bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-200/75 dark:border-slate-800">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Cooperative Portal Guide
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Dedicated guides, community, and official bylaws
          </h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          2027–2036 · 20 Shares
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {EXPLORE_PAGES.map((item, idx) => {
          const Icon = item.Icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.18, delay: idx * 0.04 }}
              className={`${item.spanClass} flex`}
            >
              <Link
                href={item.href}
                className={`amanah-card-border group w-full rounded-xl border ${item.cardClass} p-5 sm:p-6 flex flex-col justify-between gap-5 transition-colors duration-150`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                      <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                        {item.index}
                      </span>
                      <span>{item.eyebrow}</span>
                    </span>
                    <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {item.label}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800 inline-flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <span>{item.cta}</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
