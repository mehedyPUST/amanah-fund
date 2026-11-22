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
        'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
    },
    {
      key: 'p2',
      index: '02.',
      Icon: Users,
      title: t('p2Title'),
      description: t('p2Desc'),
      hue: 'sky',
      iconBoxClass:
        'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20',
    },
    {
      key: 'p3',
      index: '03.',
      Icon: Lock,
      title: t('p3Title'),
      description: t('p3Desc'),
      hue: 'violet',
      iconBoxClass:
        'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md shadow-purple-500/20',
    },
    {
      key: 'p4',
      index: '04.',
      Icon: Vote,
      title: t('p4Title'),
      description: t('p4Desc'),
      hue: 'amber',
      iconBoxClass:
        'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20',
    },
    {
      key: 'p5',
      index: '05.',
      Icon: KeyRound,
      title: t('p5Title'),
      description: t('p5Desc'),
      hue: 'teal',
      iconBoxClass:
        'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/20',
    },
  ];

  return (
    <div
      className={`w-full text-slate-900 dark:text-slate-100 ${
        embedded
          ? 'bg-gradient-to-b from-white/98 to-slate-50/50 dark:from-[#02232D]/96 dark:to-[#001E2B]/98 backdrop-blur-xl border border-slate-200/85 dark:border-[#163948] ring-1 ring-inset ring-white/75 dark:ring-[#00ED64]/10 rounded-2xl shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,10,15,0.68)] p-6 sm:p-7'
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
            <div className="text-xs font-semibold text-emerald-700 dark:text-[#00ED64]">
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
