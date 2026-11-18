'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  ShieldCheck,
  Vote,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StatusTextProps {
  status: string;
}

const STATUS_META: Record<
  string,
  { colorClass: string; Icon: typeof CheckCircle2 }
> = {
  approved: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  paid: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  repaid: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: ShieldCheck,
  },
  active: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  vetted: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: ShieldCheck,
  },
  pending_approval: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_activation: {
    colorClass: 'text-indigo-700 dark:text-indigo-400',
    Icon: KeyRound,
  },
  pending: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_guarantor: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_manager_review: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_vote: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Vote,
  },
  approved_pending_disbursement: {
    colorClass: 'text-teal-700 dark:text-teal-400',
    Icon: ShieldCheck,
  },
  pending_verification: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  open: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Vote,
  },
  closed: {
    colorClass: 'text-slate-600 dark:text-slate-400',
    Icon: CheckCircle2,
  },
  completed: {
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  cancelled: {
    colorClass: 'text-red-700 dark:text-red-400',
    Icon: XCircle,
  },
  scheduled: {
    colorClass: 'text-indigo-700 dark:text-indigo-400',
    Icon: Clock,
  },
  proposed: {
    colorClass: 'text-indigo-700 dark:text-indigo-400',
    Icon: Clock,
  },
  rejected: {
    colorClass: 'text-rose-700 dark:text-rose-400',
    Icon: XCircle,
  },
  suspended: {
    colorClass: 'text-rose-700 dark:text-rose-400',
    Icon: AlertCircle,
  },
  overdue: {
    colorClass: 'text-rose-700 dark:text-rose-400',
    Icon: AlertCircle,
  },
};

export function StatusText({ status }: StatusTextProps) {
  const tStatus = useTranslations('Status');
  const entry = STATUS_META[status] || {
    colorClass: 'text-slate-600 dark:text-slate-300',
    Icon: Clock,
  };
  const { Icon } = entry;
  const label = STATUS_META[status]
    ? tStatus(status as keyof typeof STATUS_META)
    : status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
