import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Vote,
  XCircle,
} from 'lucide-react';

interface StatusTextProps {
  status: string;
}

const STATUS_MAP: Record<
  string,
  { label: string; colorClass: string; Icon: typeof CheckCircle2 }
> = {
  approved: {
    label: 'Approved',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  paid: {
    label: 'Paid',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  repaid: {
    label: 'Fully Repaid',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: ShieldCheck,
  },
  active: {
    label: 'Active',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  vetted: {
    label: 'Shariah Vetted',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: ShieldCheck,
  },
  pending_approval: {
    label: 'Awaiting Admin Approval',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending: {
    label: 'Pending Approval',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_guarantor: {
    label: 'Awaiting Guarantor Co-Sign',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_manager_review: {
    label: 'Awaiting Manager Review',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  pending_vote: {
    label: '2/3 Member Voting',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Vote,
  },
  approved_pending_disbursement: {
    label: 'Ready for Disbursement',
    colorClass: 'text-teal-700 dark:text-teal-400',
    Icon: ShieldCheck,
  },
  pending_verification: {
    label: 'Pending Verification',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Clock,
  },
  open: {
    label: 'Poll Ongoing',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: Vote,
  },
  closed: {
    label: 'Poll Closed',
    colorClass: 'text-slate-600 dark:text-slate-400',
    Icon: CheckCircle2,
  },
  completed: {
    label: 'Completed',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    colorClass: 'text-red-700 dark:text-red-400',
    Icon: XCircle,
  },
  scheduled: {
    label: 'Scheduled',
    colorClass: 'text-slate-600 dark:text-slate-400',
    Icon: Clock,
  },
  proposed: {
    label: 'Proposed',
    colorClass: 'text-slate-600 dark:text-slate-400',
    Icon: Clock,
  },
  rejected: {
    label: 'Rejected',
    colorClass: 'text-red-700 dark:text-red-400',
    Icon: XCircle,
  },
  suspended: {
    label: 'Suspended',
    colorClass: 'text-red-700 dark:text-red-400',
    Icon: AlertCircle,
  },
  overdue: {
    label: 'Overdue',
    colorClass: 'text-red-700 dark:text-red-400',
    Icon: AlertCircle,
  },
};

export function StatusText({ status }: StatusTextProps) {
  const entry = STATUS_MAP[status] || {
    label: status.replace(/_/g, ' '),
    colorClass: 'text-slate-600 dark:text-slate-300',
    Icon: Clock,
  };
  const { Icon } = entry;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{entry.label}</span>
    </span>
  );
}
