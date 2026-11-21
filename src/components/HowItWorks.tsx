'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  HandCoins,
  HelpCircle,
  LockKeyhole,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

type RoleGuideKey = 'member' | 'manager' | 'admin';

interface GuideStep {
  number: string;
  title: string;
  summary: string;
  actionHint: string;
  Icon: LucideIcon;
}

interface RoleGuide {
  key: RoleGuideKey;
  label: string;
  headline: string;
  steps: GuideStep[];
}

export function HowItWorks({ embedded = true }: { embedded?: boolean }) {
  const { user } = useCoopSession();
  const t = useTranslations('Public.howItWorks');
  const tNav = useTranslations('Navigation');
  const [activeRole, setActiveRole] = useState<RoleGuideKey>('member');

  const roleGuides: RoleGuide[] = [
    {
      key: 'member',
      label: t('roles.member.label'),
      headline: t('roles.member.headline'),
      steps: [
        {
          number: '01.',
          title: t('roles.member.s1Title'),
          summary: t('roles.member.s1Summary'),
          actionHint: t('roles.member.s1Hint'),
          Icon: UserCheck,
        },
        {
          number: '02.',
          title: t('roles.member.s2Title'),
          summary: t('roles.member.s2Summary'),
          actionHint: t('roles.member.s2Hint'),
          Icon: Wallet,
        },
        {
          number: '03.',
          title: t('roles.member.s3Title'),
          summary: t('roles.member.s3Summary'),
          actionHint: t('roles.member.s3Hint'),
          Icon: HandCoins,
        },
        {
          number: '04.',
          title: t('roles.member.s4Title'),
          summary: t('roles.member.s4Summary'),
          actionHint: t('roles.member.s4Hint'),
          Icon: Vote,
        },
      ],
    },
    {
      key: 'manager',
      label: t('roles.manager.label'),
      headline: t('roles.manager.headline'),
      steps: [
        {
          number: '01.',
          title: t('roles.manager.s1Title'),
          summary: t('roles.manager.s1Summary'),
          actionHint: t('roles.manager.s1Hint'),
          Icon: ClipboardCheck,
        },
        {
          number: '02.',
          title: t('roles.manager.s2Title'),
          summary: t('roles.manager.s2Summary'),
          actionHint: t('roles.manager.s2Hint'),
          Icon: Vote,
        },
        {
          number: '03.',
          title: t('roles.manager.s3Title'),
          summary: t('roles.manager.s3Summary'),
          actionHint: t('roles.manager.s3Hint'),
          Icon: CheckCircle2,
        },
        {
          number: '04.',
          title: t('roles.manager.s4Title'),
          summary: t('roles.manager.s4Summary'),
          actionHint: t('roles.manager.s4Hint'),
          Icon: Building2,
        },
      ],
    },
    {
      key: 'admin',
      label: t('roles.admin.label'),
      headline: t('roles.admin.headline'),
      steps: [
        {
          number: '01.',
          title: t('roles.admin.s1Title'),
          summary: t('roles.admin.s1Summary'),
          actionHint: t('roles.admin.s1Hint'),
          Icon: ShieldCheck,
        },
        {
          number: '02.',
          title: t('roles.admin.s2Title'),
          summary: t('roles.admin.s2Summary'),
          actionHint: t('roles.admin.s2Hint'),
          Icon: Settings,
        },
        {
          number: '03.',
          title: t('roles.admin.s3Title'),
          summary: t('roles.admin.s3Summary'),
          actionHint: t('roles.admin.s3Hint'),
          Icon: FileCheck2,
        },
        {
          number: '04.',
          title: t('roles.admin.s4Title'),
          summary: t('roles.admin.s4Summary'),
          actionHint: t('roles.admin.s4Hint'),
          Icon: LockKeyhole,
        },
      ],
    },
  ];

  const currentGuide = roleGuides.find((g) => g.key === activeRole) || roleGuides[0];
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={`w-full text-slate-900 dark:text-slate-100 ${
        embedded
          ? 'bg-white/95 dark:bg-slate-900/92 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] p-6 sm:p-7'
          : ''
      }`}
    >
      <section className="space-y-6 sm:space-y-7">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800">
          <div className="max-w-2xl space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('eyebrow')}</span>
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
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentGuide.headline}
            </p>
          </div>

          <div
            role="tablist"
            aria-label={t('selectRoleGuide')}
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 self-start lg:self-auto"
          >
            {roleGuides.map((guide) => {
              const selected = guide.key === activeRole;
              return (
                <button
                  key={guide.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveRole(guide.key)}
                  className={`relative px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    selected
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="how-it-works-role-tab"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 rounded-lg bg-emerald-700 dark:bg-emerald-600 shadow-xs border border-emerald-600/80 dark:border-emerald-500/80"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{guide.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentGuide.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {currentGuide.steps.map((step, idx) => {
              const Icon = step.Icon;
              const stepHue: CardHue = (['emerald', 'teal', 'emerald', 'teal'] as const)[idx % 4];
              const iconBoxClass =
                stepHue === 'teal'
                  ? 'bg-teal-50 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-700/50 text-teal-700 dark:text-teal-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300';
              return (
                <MotionCard
                  key={step.number}
                  hue={stepHue}
                  delay={idx * 0.03}
                  className="backdrop-blur-xl rounded-2xl border ring-1 ring-inset ring-white/70 dark:ring-white/5 p-5 flex flex-col justify-between gap-4 transition-all duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`w-9 h-9 rounded-xl shadow-2xs flex items-center justify-center ${iconBoxClass}`}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-500">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {step.summary}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {step.actionHint}
                  </div>
                </MotionCard>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900 dark:text-white">
                {t('quickRuleLabel')}
              </strong>{' '}
              {t('quickRuleText')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/rules"
              className="px-4 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-950/65 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              {tNav('rules')}
            </Link>
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="group px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs shadow-emerald-900/15 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <span>{user ? tNav('dashboard') : tNav('joinAmanah')}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
