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
      hue: 'emerald',
      iconBoxClass:
        'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
      badgeClass:
        'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60',
      ctaClass: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      href: '/#architecture',
      index: '02.',
      label: t('card2Label'),
      eyebrow: t('card2Eyebrow'),
      description: t('card2Desc'),
      cta: t('card2Cta'),
      Icon: ShieldCheck,
      hue: 'sky',
      iconBoxClass:
        'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20',
      badgeClass:
        'bg-blue-100/80 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60',
      ctaClass: 'text-blue-700 dark:text-blue-400',
    },
    {
      href: '/rules',
      index: '03.',
      label: t('card3Label'),
      eyebrow: t('card3Eyebrow'),
      description: t('card3Desc'),
      cta: t('card3Cta'),
      Icon: ScrollText,
      hue: 'violet',
      iconBoxClass:
        'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md shadow-purple-500/20',
      badgeClass:
        'bg-purple-100/80 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60',
      ctaClass: 'text-purple-700 dark:text-purple-400',
    },
  ];

  return (
    <section className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-200/75 dark:border-[#163948]">
        <div className="space-y-1 animate__animated animate__fadeInUp animate__faster">
          <div className="text-xs font-semibold text-emerald-700 dark:text-[#00ED64]">
            {t('eyebrow')}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t('heading')}
          </h2>
        </div>
        <span className="font-mono text-xs tabular-nums px-2.5 py-1 rounded-lg border border-amber-200/85 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-amber-100/70 dark:from-amber-950/45 dark:to-[#02232D] text-amber-800 dark:text-amber-300 self-start sm:self-auto animate__animated animate__fadeInRight animate__faster amanah-stagger-1">
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
                className="w-full rounded-2xl backdrop-blur-xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 p-5 sm:p-6 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.42)] hover:shadow-[0_12px_30px_-12px_rgba(15,23,42,0.12)] flex flex-col justify-between gap-5 transition-all duration-200"
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
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
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
