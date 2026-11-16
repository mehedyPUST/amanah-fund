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
    iconClass:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
    borderHover: 'hover:border-teal-300 dark:hover:border-teal-700/70',
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
    iconClass:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
    borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
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
    iconClass:
      'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
    borderHover: 'hover:border-indigo-300 dark:hover:border-indigo-700/70',
    ctaClass: 'text-indigo-700 dark:text-indigo-400',
  },
  {
    href: '/rules',
    label: 'Governance Charter',
    eyebrow: 'Articles 1–25 · PDF',
    description:
      'Read the official VISION-36 cooperative constitution, arrears policies, and preview the signed PDF.',
    cta: 'Read Charter',
    Icon: ScrollText,
    iconClass:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
    borderHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
    ctaClass: 'text-amber-700 dark:text-amber-400',
  },
];

export function HomeHighlights() {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
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
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.18, delay: idx * 0.04 }}
              className="flex"
            >
              <Link
                href={item.href}
                className={`group w-full rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 flex flex-col justify-between gap-3 transition-colors ${item.borderHover}`}
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
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className={`pt-2 border-t border-slate-200/80 dark:border-slate-800 inline-flex items-center gap-1.5 text-xs font-medium ${item.ctaClass}`}>
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
