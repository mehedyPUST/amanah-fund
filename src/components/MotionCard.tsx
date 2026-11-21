'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export type CardHue =
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'sky'
  | 'rose'
  | 'violet'
  | 'deep-emerald';

const HUE_DEEP_OVERLAY: Record<CardHue, string> = {
  emerald: 'bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-teal-500/[0.02] dark:from-emerald-400/[0.05] dark:to-teal-400/[0.04]',
  teal: 'bg-gradient-to-br from-teal-500/[0.03] via-transparent to-emerald-500/[0.02] dark:from-teal-400/[0.05] dark:to-emerald-400/[0.04]',
  amber: 'bg-gradient-to-br from-amber-500/[0.03] via-transparent to-orange-500/[0.02] dark:from-amber-400/[0.05] dark:to-orange-400/[0.04]',
  sky: 'bg-gradient-to-br from-sky-500/[0.03] via-transparent to-teal-500/[0.02] dark:from-sky-400/[0.05] dark:to-teal-400/[0.04]',
  rose: 'bg-gradient-to-br from-rose-500/[0.03] via-transparent to-amber-500/[0.02] dark:from-rose-400/[0.05] dark:to-amber-400/[0.04]',
  violet: 'bg-gradient-to-br from-teal-500/[0.03] via-transparent to-emerald-500/[0.02] dark:from-teal-400/[0.05] dark:to-emerald-400/[0.04]',
  'deep-emerald': 'bg-gradient-to-br from-emerald-500/[0.045] via-transparent to-teal-500/[0.03] dark:from-emerald-400/[0.07] dark:to-teal-400/[0.05]',
};

const HUE_SURFACE_CLASS: Record<CardHue, string> = {
  emerald:
    'amanah-card-emerald border-emerald-500/24 dark:border-emerald-400/20 hover:border-emerald-600/44 dark:hover:border-emerald-300/38',
  'deep-emerald':
    'amanah-card-emerald border-emerald-500/30 dark:border-emerald-400/25 hover:border-emerald-600/50 dark:hover:border-emerald-300/45',
  teal:
    'amanah-card-teal border-teal-500/24 dark:border-teal-400/20 hover:border-teal-600/44 dark:hover:border-teal-300/38',
  violet:
    'bg-white/95 dark:bg-slate-900/92 border-slate-200/85 dark:border-slate-800/85 hover:border-teal-500/35 dark:hover:border-teal-400/35',
  amber:
    'amanah-card-amber border-amber-500/26 dark:border-amber-400/22 hover:border-amber-600/46 dark:hover:border-amber-300/40',
  sky:
    'amanah-card-sky border-sky-500/24 dark:border-sky-400/20 hover:border-sky-600/44 dark:hover:border-sky-300/38',
  rose:
    'amanah-card-rose border-rose-500/26 dark:border-rose-400/22 hover:border-rose-600/46 dark:hover:border-rose-300/40',
};

const DEPTH_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 0 },
  hover: { opacity: 1 },
};

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface MotionCardProps {
  as?: 'div' | 'section' | 'article';
  id?: string;
  hue?: CardHue;
  delay?: number;
  inView?: boolean;
  interactive?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children: ReactNode;
}

export function MotionCard({
  as = 'div',
  id,
  hue = 'emerald',
  delay = 0,
  inView = false,
  interactive = false,
  className = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  children,
}: MotionCardProps) {
  const Component =
    as === 'section'
      ? motion.section
      : as === 'article'
        ? motion.article
        : motion.div;

  const containerVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, delay, ease: EASE_OUT_EXPO },
    },
    hover: {
      opacity: 1,
      y: -1.5,
      transition: { duration: 0.16, ease: EASE_OUT_EXPO },
    },
  };

  return (
    <Component
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      initial="hidden"
      {...(inView
        ? { whileInView: 'visible', viewport: { once: true, amount: 0.1 } }
        : { animate: 'visible' })}
      whileHover="hover"
      whileTap={interactive ? { scale: 0.994 } : undefined}
      variants={containerVariants}
      className={`relative isolate ${className} ${HUE_SURFACE_CLASS[hue]}`}
    >
      <motion.span
        aria-hidden="true"
        data-card-depth="true"
        variants={DEPTH_VARIANTS}
        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        className={`pointer-events-none absolute inset-0 -z-1 rounded-[inherit] ${HUE_DEEP_OVERLAY[hue]}`}
      />
      {children}
    </Component>
  );
}
