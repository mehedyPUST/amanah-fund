'use client';

import {
  isMeetingOrNoticeBoardNotification,
  isNotificationForUser,
} from '../utils/notificationAlerts.ts';

export { isMeetingOrNoticeBoardNotification, isNotificationForUser };

export type BlinkMarkerVariant = 'emerald' | 'amber' | 'red';

const VARIANT_CLASSES: Record<
  BlinkMarkerVariant,
  { ring: string; dot: string }
> = {
  red: {
    ring: 'bg-red-500/80 dark:bg-red-400/80 amanah-blink-ring-urgent',
    dot: 'bg-red-600 dark:bg-red-500 shadow-[0_0_8px_rgba(220,38,38,0.65)] amanah-blink-dot-urgent',
  },
  emerald: {
    ring: 'bg-emerald-400/80 dark:bg-emerald-400/75 amanah-blink-ring',
    dot: 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.55)] amanah-blink-dot',
  },
  amber: {
    ring: 'bg-amber-500/80 dark:bg-amber-400/80 amanah-blink-ring',
    dot: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.55)] amanah-blink-dot',
  },
};

const SIZE_CLASSES = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
} as const;

interface NotificationBlinkMarkerProps {
  variant?: BlinkMarkerVariant;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export function NotificationBlinkMarker({
  variant = 'emerald',
  size = 'sm',
  label,
  className = '',
}: NotificationBlinkMarkerProps) {
  const colors = VARIANT_CLASSES[variant];
  const dims = SIZE_CLASSES[size];

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 ${dims} ${className}`}
      aria-hidden={label ? undefined : true}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full ${colors.ring}`}
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex rounded-full ${dims} ${colors.dot}`}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
