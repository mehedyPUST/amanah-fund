'use client';

import { Languages } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { AppLocale } from '../i18n/config.ts';
import { useCoopSession } from './AppProviders.tsx';

interface LanguageSwitcherProps {
  /** 'segmented' renders English | বাংলা; 'compact' renders a single toggle button for narrow headers */
  variant?: 'segmented' | 'compact';
  /** Optional tone for dark/emerald surfaces such as mobile welcome headers */
  surface?: 'default' | 'inverted';
  /** Unique layoutId prefix so multiple switchers on screen don't collide in motion */
  layoutId?: string;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'segmented',
  surface = 'default',
  layoutId = 'amanah-lang-pill',
  className = '',
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useCoopSession();
  const t = useTranslations('Common');
  const hasBaseDisplayClass = /(?:^|\s)(hidden|flex|inline-flex|block|inline-block|grid)(?:\s|$)/.test(
    className
  );
  const baseDisplayClass = hasBaseDisplayClass ? '' : 'inline-flex';

  if (variant === 'compact') {
    const nextLocale: AppLocale = locale === 'en' ? 'bn' : 'en';
    const hasCustomHeight = /(?:^|\s)h-/.test(className);
    const hasCustomPaddingX = /(?:^|\s)px-/.test(className);
    const hasCustomTextSize = /(?:^|\s)text-(?:xs|sm|base|lg|\[)/.test(className);
    const hasCustomGap = /(?:^|\s)gap-/.test(className);
    return (
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        title={t('switchLanguage')}
        aria-label={t('switchLanguage')}
        className={`${baseDisplayClass} items-center justify-center ${
          hasCustomGap ? '' : 'gap-1'
        } ${
          hasCustomHeight ? '' : 'h-9'
        } ${hasCustomPaddingX ? '' : 'px-2.5'} ${
          hasCustomTextSize ? '' : 'text-xs'
        } rounded-xl border font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
          surface === 'inverted'
            ? 'border-white/25 bg-white/15 hover:bg-white/25 text-white'
            : 'border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-300'
        } ${className}`}
      >
        <Languages className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span lang={nextLocale === 'bn' ? 'bn' : 'en'}>
          {nextLocale === 'bn' ? 'বাংলা' : 'EN'}
        </span>
      </button>
    );
  }

  const options: Array<{ id: AppLocale; label: string }> = [
    { id: 'en', label: 'English' },
    { id: 'bn', label: 'বাংলা' },
  ];

  return (
    <div
      role="group"
      aria-label={t('switchLanguage')}
      className={`${baseDisplayClass} items-center p-0.5 rounded-xl border shrink-0 ${
        surface === 'inverted'
          ? 'border-white/25 bg-white/12'
          : 'border-slate-200/85 dark:border-slate-700/85 bg-slate-100/85 dark:bg-slate-950/75'
      } ${className}`}
    >
      {options.map((opt) => {
        const active = locale === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) setLocale(opt.id);
            }}
            className={`relative px-2.5 h-7 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center ${
              surface === 'inverted'
                ? active
                  ? 'text-emerald-950 font-semibold'
                  : 'text-white/85 hover:text-white'
                  : active
                    ? 'text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300'
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className={`absolute inset-0 rounded-lg shadow-xs ${
                    surface === 'inverted'
                      ? 'bg-white'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 border border-emerald-500/70'
                  }`}
                  aria-hidden="true"
                />
            )}
            <span lang={opt.id} className="relative z-10 leading-none">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
