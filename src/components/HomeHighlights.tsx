'use client';

import Link from 'next/link';
import {
  ChevronRight,
  HelpCircle,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MotionCard, type CardHue } from './MotionCard.tsx';

export function HomeHighlights() {
  const t = useTranslations('Public.highlights');

  const explorePages: Array<{
    href: string;
    index: string;
    label: string;
    eyebrow: string;
    description: string;
    cta: string;
    Icon: typeof HelpCircle;
    hue: CardHue;
    iconBoxClass: string;
    badgeClass: string;
    ctaClass: string;
  }> = [
    {
      href: '/#how-it-works',
      index: '01.',
      label: t('card1Label'),
      eyebrow: t('card1Eyebrow'),
      description: t('card1Desc'),
      cta: t('card1Cta'),
      Icon: HelpCircle,
      hue: 'violet',
      iconBoxClass:
        'bg-violet-100/85 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/25 text-violet-700 dark:text-violet-300',
      badgeClass:
        'bg-violet-100/80 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300',
      ctaClass: 'text-violet-700 dark:text-violet-400',
    },
    {
      href: '/#architecture',
      index: '02.',
      label: t('card2Label'),
      eyebrow: t('card2Eyebrow'),
      description: t('card2Desc'),
      cta: t('card2Cta'),
      Icon: ShieldCheck,
      hue: 'teal',
      iconBoxClass:
        'bg-teal-100/85 dark:bg-teal-500/15 border border-teal-200/70 dark:border-teal-500/25 text-teal-700 dark:text-teal-300',
      badgeClass:
        'bg-teal-100/80 dark:bg-teal-500/15 text-teal-800 dark:text-teal-300',
      ctaClass: 'text-teal-700 dark:text-teal-400',
    },
    {
      href: '/rules',
      index: '03.',
      label: t('card3Label'),
      eyebrow: t('card3Eyebrow'),
      description: t('card3Desc'),
      cta: t('card3Cta'),
      Icon: ScrollText,
      hue: 'emerald',
      iconBoxClass:
        'bg-emerald-100/85 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
      badgeClass:
        'bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
      ctaClass: 'text-emerald-700 dark:text-emerald-400',
    },
  ];

  return (
    <section className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-200/75 dark:border-slate-800">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {t('eyebrow')}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t('heading')}
          </h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {t('meta')}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {explorePages.map((item, idx) => {
          const Icon = item.Icon;
          return (
            <Link key={item.href} href={item.href} className="group flex">
              <MotionCard
                hue={item.hue}
                delay={idx * 0.04}
                inView
                interactive
                className="w-full rounded-2xl backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 p-5 sm:p-6 flex flex-col justify-between gap-5 transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl shadow-2xs flex items-center justify-center shrink-0 ${item.iconBoxClass}`}
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
                      className={`font-mono text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 ${item.badgeClass}`}
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
