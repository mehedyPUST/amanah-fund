'use client';

import Link from 'next/link';
import {
  ChevronRight,
  HelpCircle,
  MessageSquare,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { MotionCard, type CardHue } from './MotionCard.tsx';

const EXPLORE_PAGES: Array<{
  href: string;
  index: string;
  label: string;
  eyebrow: string;
  description: string;
  cta: string;
  Icon: typeof MessageSquare;
  spanClass: string;
  hue: CardHue;
  iconBoxClass: string;
  badgeClass: string;
  ctaClass: string;
}> = [
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
    hue: 'emerald',
    iconBoxClass:
      'bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    badgeClass:
      'bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    ctaClass: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    href: '/#how-it-works',
    index: '02.',
    label: 'How It Works',
    eyebrow: 'Role Workflows',
    description:
      'Step-by-step guides for cooperative Members, 5-member Shura Managers, and system Administrators.',
    cta: 'View Workflows',
    Icon: HelpCircle,
    spanClass: 'lg:col-span-5',
    hue: 'violet',
    iconBoxClass:
      'bg-violet-100/85 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
    badgeClass:
      'bg-violet-100/80 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300',
    ctaClass: 'text-violet-700 dark:text-violet-400',
  },
  {
    href: '/#architecture',
    index: '03.',
    label: 'Security & Architecture',
    eyebrow: 'Trust Stack',
    description:
      '20-share KYC onboarding, dual Shura and Savings committees, AES-256-GCM encrypted fields, and SHA-256 audit chains.',
    cta: 'Inspect Architecture',
    Icon: ShieldCheck,
    spanClass: 'lg:col-span-5',
    hue: 'violet',
    iconBoxClass:
      'bg-violet-100/85 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
    badgeClass:
      'bg-violet-100/80 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300',
    ctaClass: 'text-violet-700 dark:text-violet-400',
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
    hue: 'emerald',
    iconBoxClass:
      'bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
    badgeClass:
      'bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    ctaClass: 'text-emerald-700 dark:text-emerald-400',
  },
];

export function HomeHighlights() {
  return (
    <section className="w-full space-y-6">
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
            <Link
              key={item.href}
              href={item.href}
              className={`${item.spanClass} group flex`}
            >
              <MotionCard
                hue={item.hue}
                delay={idx * 0.04}
                inView
                interactive
                className="w-full rounded-xl backdrop-blur-md border p-5 sm:p-6 flex flex-col justify-between gap-5 shadow-xs hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.iconBoxClass}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                          {item.label}
                        </h3>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.eyebrow}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${item.badgeClass}`}
                    >
                      {item.index}
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl text-justify">
                    {item.description}
                  </p>
                </div>

                <div
                  className={`pt-3 border-t border-slate-200/75 dark:border-slate-800/80 inline-flex items-center justify-between text-xs font-medium ${item.ctaClass}`}
                >
                  <span>{item.cta}</span>
                  <ChevronRight
                    className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </MotionCard>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
