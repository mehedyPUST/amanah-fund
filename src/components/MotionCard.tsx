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
  emerald: 'bg-emerald-500/[0.03] dark:bg-emerald-400/[0.04]',
  teal: 'bg-teal-500/[0.03] dark:bg-teal-400/[0.04]',
  amber: 'bg-amber-500/[0.03] dark:bg-amber-400/[0.04]',
  sky: 'bg-sky-500/[0.03] dark:bg-sky-400/[0.04]',
  rose: 'bg-rose-500/[0.03] dark:bg-rose-400/[0.04]',
  violet: 'bg-violet-500/[0.03] dark:bg-violet-400/[0.04]',
  'deep-emerald': 'bg-emerald-500/[0.035] dark:bg-emerald-400/[0.045]',
};

const HUE_SURFACE_CLASS: Record<CardHue, string> = {
  emerald:
    'amanah-card-emerald border-emerald-400/75 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400/70',
  'deep-emerald':
    'amanah-card-emerald border-emerald-400/80 dark:border-emerald-500/45 hover:border-emerald-500 dark:hover:border-emerald-400/75',
  teal:
    'amanah-card-teal border-teal-400/75 dark:border-teal-500/40 hover:border-teal-500 dark:hover:border-teal-400/70',
  violet:
    'amanah-card-violet border-violet-400/75 dark:border-violet-500/40 hover:border-violet-500 dark:hover:border-violet-400/70',
  amber:
    'amanah-card-amber border-amber-400/70 dark:border-amber-500/35 hover:border-amber-500 dark:hover:border-amber-400/65',
  sky:
    'amanah-card-sky border-sky-400/70 dark:border-sky-500/35 hover:border-sky-500 dark:hover:border-sky-400/65',
  rose:
    'amanah-card-rose border-rose-400/70 dark:border-rose-500/35 hover:border-rose-500 dark:hover:border-rose-400/65',
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
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, delay, ease: EASE_OUT_EXPO },
    },
    hover: {
      opacity: 1,
      y: -2,
      transition: { duration: 0.18, ease: EASE_OUT_EXPO },
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
      whileTap={interactive ? { scale: 0.996 } : undefined}
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
