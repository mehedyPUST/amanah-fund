'use client';

import type { EmailNotification, PublicUser } from '../types/coop.ts';

export type BlinkMarkerVariant = 'emerald' | 'amber' | 'red';

export function isMeetingOrNoticeBoardNotification(
  n: Pick<EmailNotification, 'type' | 'relatedId' | 'subject'>
): boolean {
  if (n.type === 'meeting_scheduled') {
    return true;
  }
  if (n.type === 'cooperative_notice') {
    if (n.relatedId?.startsWith('notice-')) {
      return true;
    }
    const subj = (n.subject || '').toLowerCase();
    if (
      subj.startsWith('password reset request') ||
      subj.startsWith('temporary password issued')
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function isNotificationForUser(
  n: Pick<EmailNotification, 'recipientUserId' | 'recipientEmail'>,
  user: Pick<PublicUser, 'id' | 'email' | 'role'>
): boolean {
  if (
    (user.role === 'admin' || user.role === 'manager') &&
    !n.recipientUserId &&
    !n.recipientEmail
  ) {
    return true;
  }
  return (
    n.recipientUserId === user.id ||
    (Boolean(n.recipientEmail) &&
      n.recipientEmail.toLowerCase() === user.email.toLowerCase())
  );
}

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
