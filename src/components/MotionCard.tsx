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
  emerald: 'bg-gradient-to-br from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent dark:from-[#00ED64]/[0.08] dark:to-transparent',
  teal: 'bg-gradient-to-br from-teal-500/[0.06] via-teal-500/[0.02] to-transparent dark:from-teal-400/[0.08] dark:to-transparent',
  amber: 'bg-gradient-to-br from-amber-500/[0.06] via-amber-500/[0.02] to-transparent dark:from-amber-400/[0.08] dark:to-transparent',
  sky: 'bg-gradient-to-br from-blue-500/[0.06] via-sky-500/[0.02] to-transparent dark:from-blue-400/[0.08] dark:to-transparent',
  rose: 'bg-gradient-to-br from-rose-500/[0.06] via-rose-500/[0.02] to-transparent dark:from-rose-400/[0.08] dark:to-transparent',
  violet: 'bg-gradient-to-br from-purple-500/[0.06] via-purple-500/[0.02] to-transparent dark:from-purple-400/[0.08] dark:to-transparent',
  'deep-emerald': 'bg-gradient-to-br from-emerald-600/[0.07] via-emerald-500/[0.025] to-transparent dark:from-[#00ED64]/[0.10] dark:to-transparent',
};

const HUE_SURFACE_CLASS: Record<CardHue, string> = {
  emerald:
    'amanah-card-emerald border-emerald-200/90 dark:border-[#00ED64]/24 hover:border-emerald-400/75 dark:hover:border-[#00ED64]/50',
  'deep-emerald':
    'amanah-card-emerald border-emerald-300/80 dark:border-[#00ED64]/30 hover:border-emerald-500/70 dark:hover:border-[#00ED64]/60',
  teal:
    'amanah-card-teal border-teal-200/90 dark:border-teal-500/26 hover:border-teal-400/75 dark:hover:border-teal-400/52',
  violet:
    'amanah-card-violet border-purple-200/90 dark:border-purple-500/26 hover:border-purple-400/75 dark:hover:border-purple-400/52',
  amber:
    'amanah-card-amber border-amber-200/90 dark:border-amber-500/26 hover:border-amber-400/75 dark:hover:border-amber-400/52',
  sky:
    'amanah-card-sky border-blue-200/90 dark:border-blue-500/26 hover:border-blue-400/75 dark:hover:border-blue-400/52',
  rose:
    'amanah-card-rose border-rose-200/90 dark:border-rose-500/26 hover:border-rose-400/75 dark:hover:border-rose-400/52',
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
