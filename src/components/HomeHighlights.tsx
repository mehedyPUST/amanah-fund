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
    label: 'Community Hub',
    eyebrow: 'Members & Discussions',
    description:
      'Access member feed updates, cooperative polls, the verified directory, and AES-256-GCM encrypted messages.',
    cta: 'Open Community',
    Icon: MessageSquare,
    cardClass:
      'bg-gradient-to-br from-teal-100/65 via-teal-50/35 to-white/75 dark:from-teal-950/45 dark:via-teal-950/20 dark:to-slate-900/75 backdrop-blur-md border-teal-200/80 dark:border-teal-900/50 hover:border-teal-300 dark:hover:border-teal-700/80',
    iconClass:
      'bg-teal-100/90 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/80 dark:ring-teal-800/60',
    dividerClass: 'border-teal-200/70 dark:border-teal-900/40',
    ctaClass: 'text-teal-700 dark:text-teal-400',
  },
  {
    href: '/how-it-works',
    label: 'How It Works',
    eyebrow: 'Role Workflows',
    description:
      'Step-by-step operations for cooperative Members, 5-member Shura Managers, and Administrators.',
    cta: 'View Workflows',
    Icon: HelpCircle,
    cardClass:
      'bg-gradient-to-br from-emerald-100/65 via-emerald-50/35 to-white/75 dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900/75 backdrop-blur-md border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700/80',
    iconClass:
      'bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/80 dark:ring-emerald-800/60',
    dividerClass: 'border-emerald-200/70 dark:border-emerald-900/40',
    ctaClass: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    href: '/about',
    label: 'Security & Architecture',
    eyebrow: 'Trust Stack',
    description:
      '20-share KYC onboarding, dual Shura and Savings committees, AES-256-GCM fields, and SHA-256 audit chain.',
    cta: 'Inspect Architecture',
    Icon: ShieldCheck,
    cardClass:
      'bg-gradient-to-br from-violet-100/65 via-violet-50/35 to-white/75 dark:from-violet-950/45 dark:via-violet-950/20 dark:to-slate-900/75 backdrop-blur-md border-violet-200/80 dark:border-violet-900/50 hover:border-violet-300 dark:hover:border-violet-700/80',
    iconClass:
      'bg-violet-100/90 dark:bg-violet-950/70 text-violet-700 dark:text-violet-400 ring-1 ring-violet-200/80 dark:ring-violet-800/60',
    dividerClass: 'border-violet-200/70 dark:border-violet-900/40',
    ctaClass: 'text-violet-700 dark:text-violet-400',
  },
  {
    href: '/rules',
    label: 'Governance Charter',
    eyebrow: 'Articles 1–25 · PDF',
    description:
      'Read the official VISION-36 cooperative constitution, arrears policies, and preview the signed PDF.',
    cta: 'Read Charter',
    Icon: ScrollText,
    cardClass:
      'bg-gradient-to-br from-orange-100/65 via-orange-50/35 to-white/75 dark:from-orange-950/45 dark:via-orange-950/20 dark:to-slate-900/75 backdrop-blur-md border-orange-200/80 dark:border-orange-900/50 hover:border-orange-300 dark:hover:border-orange-700/80',
    iconClass:
      'bg-orange-100/90 dark:bg-orange-950/70 text-orange-700 dark:text-orange-400 ring-1 ring-orange-200/80 dark:ring-orange-800/60',
    dividerClass: 'border-orange-200/70 dark:border-orange-900/40',
    ctaClass: 'text-orange-700 dark:text-orange-400',
  },
];

export function HomeHighlights() {
  return (
    <section className="bg-gradient-to-b from-slate-100/65 via-slate-50/35 to-white/75 dark:from-slate-800/45 dark:via-slate-900/75 dark:to-slate-950/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Explore Cooperative Pages
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dedicated Guides, Community &amp; Official Bylaws
          </h2>
        </div>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          2027–2036 · 20 Shares
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {EXPLORE_PAGES.map((item, idx) => {
          const Icon = item.Icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.18, delay: idx * 0.04 }}
              className="flex"
            >
              <Link
                href={item.href}
                className={`group w-full rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors ${item.cardClass}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.iconClass}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {item.eyebrow}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.label}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    {item.description}
                  </p>
                </div>

                <div className={`pt-2 border-t inline-flex items-center gap-1.5 text-xs font-medium ${item.dividerClass} ${item.ctaClass}`}>
                  <span>{item.cta}</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
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
