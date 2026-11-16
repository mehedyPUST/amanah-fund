'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

const PILLAR_STYLES = [
  {
    Icon: ShieldCheck,
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    iconClass:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
  },
  {
    Icon: Users,
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    iconClass:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
  },
  {
    Icon: Lock,
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    iconClass:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
  },
  {
    Icon: Vote,
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    iconClass:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
  },
  {
    Icon: KeyRound,
    cardStyle:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    iconClass:
      'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
  },
];

export function About({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname();
  const { t } = useCoopSession();
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {t.about.eyebrow}
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t.about.headline}
          </HeadingTag>
          <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            {t.about.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.about.pillars.map((pillar, idx) => {
            const style = PILLAR_STYLES[idx];
            const Icon = style.Icon;
            return (
              <div
                key={pillar.title}
                className={`border rounded-xl p-6 space-y-3 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.cardStyle}`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${style.iconClass}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-emerald-50/75 via-white to-white dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-200 hover:shadow-md">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t.about.ctaTitle}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t.about.ctaBody}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/#governance-charter"
              onClick={(e) => {
                if (pathname === '/') {
                  e.preventDefault();
                  document
                    .getElementById('governance-charter')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 transition-all duration-200"
            >
              {t.about.governanceCharter}
            </Link>
            <Link
              href="/signup"
              className="group px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              <span>{t.about.applyMembership}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
