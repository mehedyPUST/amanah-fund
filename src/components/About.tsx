'use client';

import { KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { MotionCard, type CardHue } from './MotionCard.tsx';

export function About({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('Public.about');
  const HeadingTag = embedded ? 'h2' : 'h1';

  const pillars: Array<{
    key: string;
    index: string;
    Icon: typeof ShieldCheck;
    title: string;
    description: string;
    hue: CardHue;
    iconBoxClass: string;
  }> = [
    {
      key: 'p1',
      index: '01.',
      Icon: ShieldCheck,
      title: t('p1Title'),
      description: t('p1Desc'),
      hue: 'emerald',
      iconBoxClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'p2',
      index: '02.',
      Icon: Users,
      title: t('p2Title'),
      description: t('p2Desc'),
      hue: 'teal',
      iconBoxClass:
        'bg-teal-50 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-700/50 text-teal-700 dark:text-teal-300',
    },
    {
      key: 'p3',
      index: '03.',
      Icon: Lock,
      title: t('p3Title'),
      description: t('p3Desc'),
      hue: 'emerald',
      iconBoxClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'p4',
      index: '04.',
      Icon: Vote,
      title: t('p4Title'),
      description: t('p4Desc'),
      hue: 'teal',
      iconBoxClass:
        'bg-teal-50 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-700/50 text-teal-700 dark:text-teal-300',
    },
    {
      key: 'p5',
      index: '05.',
      Icon: KeyRound,
      title: t('p5Title'),
      description: t('p5Desc'),
      hue: 'emerald',
      iconBoxClass:
        'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300',
    },
  ];

  return (
    <div
      className={`w-full text-slate-900 dark:text-slate-100 ${
        embedded
          ? 'bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] p-6 sm:p-7'
          : ''
      }`}
    >
      <section className="space-y-6 sm:space-y-7">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800"
        >
          <div className="max-w-3xl space-y-2">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {t('eyebrow')}
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
              }
            >
              {t('heading')}
            </HeadingTag>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
            {t('safeguardsBadge')}
          </span>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.Icon;
            const spanClass = idx < 3 ? 'xl:col-span-2' : 'xl:col-span-3';
            return (
              <MotionCard
                key={pillar.key}
                hue={pillar.hue}
                delay={idx * 0.03}
                inView
                className={`${spanClass} backdrop-blur-xl rounded-2xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 p-5 space-y-3 transition-all duration-200`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={`w-9 h-9 rounded-xl shadow-2xs flex items-center justify-center ${pillar.iconBoxClass}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-500">
                    {pillar.index}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
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
