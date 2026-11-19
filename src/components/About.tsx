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
    badgeClass: string;
  }> = [
    {
      key: 'p1',
      index: '01.',
      Icon: ShieldCheck,
      title: t('p1Title'),
      description: t('p1Desc'),
      hue: 'emerald',
      iconBoxClass:
        'bg-emerald-500/18 dark:bg-emerald-400/20 border border-emerald-400/70 dark:border-emerald-400/40 text-emerald-700 dark:text-emerald-300',
      badgeClass:
        'bg-emerald-500/15 dark:bg-emerald-400/20 border border-emerald-400/60 text-emerald-800 dark:text-emerald-200',
    },
    {
      key: 'p2',
      index: '02.',
      Icon: Users,
      title: t('p2Title'),
      description: t('p2Desc'),
      hue: 'violet',
      iconBoxClass:
        'bg-violet-500/18 dark:bg-violet-400/20 border border-violet-400/70 dark:border-violet-400/40 text-violet-700 dark:text-violet-300',
      badgeClass:
        'bg-violet-500/15 dark:bg-violet-400/20 border border-violet-400/60 text-violet-800 dark:text-violet-200',
    },
    {
      key: 'p3',
      index: '03.',
      Icon: Lock,
      title: t('p3Title'),
      description: t('p3Desc'),
      hue: 'teal',
      iconBoxClass:
        'bg-teal-500/18 dark:bg-teal-400/20 border border-teal-400/70 dark:border-teal-400/40 text-teal-700 dark:text-teal-300',
      badgeClass:
        'bg-teal-500/15 dark:bg-teal-400/20 border border-teal-400/60 text-teal-800 dark:text-teal-200',
    },
    {
      key: 'p4',
      index: '04.',
      Icon: Vote,
      title: t('p4Title'),
      description: t('p4Desc'),
      hue: 'amber',
      iconBoxClass:
        'bg-amber-500/18 dark:bg-amber-400/20 border border-amber-400/70 dark:border-amber-400/40 text-amber-700 dark:text-amber-300',
      badgeClass:
        'bg-amber-500/15 dark:bg-amber-400/20 border border-amber-400/60 text-amber-800 dark:text-amber-200',
    },
    {
      key: 'p5',
      index: '05.',
      Icon: KeyRound,
      title: t('p5Title'),
      description: t('p5Desc'),
      hue: 'sky',
      iconBoxClass:
        'bg-sky-500/18 dark:bg-sky-400/20 border border-sky-400/70 dark:border-sky-400/40 text-sky-700 dark:text-sky-300',
      badgeClass:
        'bg-sky-500/15 dark:bg-sky-400/20 border border-sky-400/60 text-sky-800 dark:text-sky-200',
    },
  ];

  return (
    <div
      className={`w-full text-slate-900 dark:text-slate-100 ${
        embedded
          ? 'amanah-card-sky backdrop-blur-md border rounded-2xl shadow-xs p-6 sm:p-7'
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
