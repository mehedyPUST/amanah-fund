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
  emerald: 'bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-green-500/[0.03] dark:from-emerald-400/[0.06] dark:to-emerald-500/[0.04]',
  teal: 'bg-gradient-to-br from-teal-500/[0.04] via-transparent to-emerald-500/[0.03] dark:from-teal-400/[0.06] dark:to-emerald-400/[0.04]',
  amber: 'bg-gradient-to-br from-amber-500/[0.05] via-transparent to-orange-500/[0.03] dark:from-amber-400/[0.06] dark:to-orange-400/[0.04]',
  sky: 'bg-gradient-to-br from-blue-500/[0.045] via-transparent to-sky-500/[0.03] dark:from-blue-400/[0.06] dark:to-sky-400/[0.04]',
  rose: 'bg-gradient-to-br from-rose-500/[0.045] via-transparent to-pink-500/[0.03] dark:from-rose-400/[0.06] dark:to-pink-400/[0.04]',
  violet: 'bg-gradient-to-br from-purple-500/[0.045] via-transparent to-indigo-500/[0.03] dark:from-purple-400/[0.06] dark:to-indigo-400/[0.04]',
  'deep-emerald': 'bg-gradient-to-br from-emerald-500/[0.055] via-transparent to-teal-500/[0.035] dark:from-emerald-400/[0.08] dark:to-teal-400/[0.05]',
};

const HUE_SURFACE_CLASS: Record<CardHue, string> = {
  emerald:
    'amanah-card-emerald border-emerald-200/90 dark:border-emerald-800/65 hover:border-emerald-400/70 dark:hover:border-emerald-500/55',
  'deep-emerald':
    'amanah-card-emerald border-emerald-300/80 dark:border-emerald-700/70 hover:border-emerald-500/65 dark:hover:border-emerald-400/60',
  teal:
    'amanah-card-teal border-teal-200/90 dark:border-teal-800/65 hover:border-teal-400/70 dark:hover:border-teal-500/55',
  violet:
    'amanah-card-violet border-purple-200/90 dark:border-purple-800/65 hover:border-purple-400/70 dark:hover:border-purple-500/55',
  amber:
    'amanah-card-amber border-amber-200/90 dark:border-amber-800/65 hover:border-amber-400/70 dark:hover:border-amber-500/55',
  sky:
    'amanah-card-sky border-blue-200/90 dark:border-blue-800/65 hover:border-blue-400/70 dark:hover:border-blue-500/55',
  rose:
    'amanah-card-rose border-rose-200/90 dark:border-rose-800/65 hover:border-rose-400/70 dark:hover:border-rose-500/55',
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
