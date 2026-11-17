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
  emerald:
    'bg-gradient-to-br from-emerald-500/22 via-emerald-400/12 to-emerald-500/5 dark:from-emerald-400/22 dark:via-emerald-500/12 dark:to-emerald-900/12',
  teal:
    'bg-gradient-to-br from-teal-500/22 via-teal-400/12 to-teal-500/5 dark:from-teal-400/22 dark:via-teal-500/12 dark:to-teal-900/12',
  amber:
    'bg-gradient-to-br from-amber-500/22 via-amber-400/12 to-amber-500/5 dark:from-amber-400/22 dark:via-amber-500/12 dark:to-amber-900/12',
  sky:
    'bg-gradient-to-br from-sky-500/22 via-sky-400/12 to-sky-500/5 dark:from-sky-400/22 dark:via-sky-500/12 dark:to-sky-900/12',
  rose:
    'bg-gradient-to-br from-rose-500/22 via-rose-400/12 to-rose-500/5 dark:from-rose-400/22 dark:via-rose-500/12 dark:to-rose-900/12',
  violet:
    'bg-gradient-to-br from-violet-500/22 via-violet-400/12 to-violet-500/5 dark:from-violet-400/22 dark:via-violet-500/12 dark:to-violet-900/12',
  'deep-emerald':
    'bg-gradient-to-br from-emerald-950/38 via-emerald-900/22 to-emerald-950/32 dark:from-emerald-950/48 dark:via-emerald-900/26 dark:to-slate-950/40',
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
      className={`relative isolate ${className}`}
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
