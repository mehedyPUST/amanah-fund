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
  emerald: 'bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-teal-500/[0.06] dark:from-emerald-400/[0.09] dark:to-teal-400/[0.08]',
  teal: 'bg-gradient-to-br from-teal-500/[0.06] via-transparent to-cyan-500/[0.06] dark:from-teal-400/[0.09] dark:to-cyan-400/[0.08]',
  amber: 'bg-gradient-to-br from-amber-500/[0.06] via-transparent to-orange-500/[0.05] dark:from-amber-400/[0.09] dark:to-orange-400/[0.07]',
  sky: 'bg-gradient-to-br from-sky-500/[0.06] via-transparent to-cyan-500/[0.06] dark:from-sky-400/[0.09] dark:to-cyan-400/[0.08]',
  rose: 'bg-gradient-to-br from-rose-500/[0.06] via-transparent to-pink-500/[0.05] dark:from-rose-400/[0.09] dark:to-pink-400/[0.07]',
  violet: 'bg-gradient-to-br from-violet-500/[0.06] via-transparent to-indigo-500/[0.06] dark:from-violet-400/[0.09] dark:to-indigo-400/[0.08]',
  'deep-emerald': 'bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-teal-500/[0.07] dark:from-emerald-400/[0.11] dark:to-teal-400/[0.09]',
};

const HUE_SURFACE_CLASS: Record<CardHue, string> = {
  emerald:
    'amanah-card-emerald border-emerald-500/32 dark:border-emerald-400/26 hover:border-emerald-600/58 dark:hover:border-emerald-300/48',
  'deep-emerald':
    'amanah-card-emerald border-emerald-500/38 dark:border-emerald-400/30 hover:border-emerald-600/62 dark:hover:border-emerald-300/52',
  teal:
    'amanah-card-teal border-teal-500/32 dark:border-teal-400/26 hover:border-teal-600/58 dark:hover:border-teal-300/48',
  violet:
    'amanah-card-violet border-violet-500/32 dark:border-violet-400/26 hover:border-violet-600/58 dark:hover:border-violet-300/48',
  amber:
    'amanah-card-amber border-amber-500/32 dark:border-amber-400/26 hover:border-amber-600/58 dark:hover:border-amber-300/48',
  sky:
    'amanah-card-sky border-sky-500/32 dark:border-sky-400/26 hover:border-sky-600/58 dark:hover:border-sky-300/48',
  rose:
    'amanah-card-rose border-rose-500/32 dark:border-rose-400/26 hover:border-rose-600/58 dark:hover:border-rose-300/48',
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
      transition: { duration: 0.22, delay, ease: EASE_OUT_EXPO },
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
