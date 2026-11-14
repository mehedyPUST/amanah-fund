import { ArrowRight, KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';
import type { PublicPage } from './PublicNavbar.tsx';

interface PublicAboutViewProps {
  onNavigate: (page: PublicPage) => void;
}

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: 'Admin-Verified Membership',
    description:
      'Every new registration enters a pending approval queue. Only accounts vetted and activated by a cooperative administrator can sign in, vote, or submit transactions.',
  },
  {
    Icon: Users,
    title: 'Granular Role-Based Access Control',
    description:
      'Strict separation of duties across Administrator (policy, RBAC, annual loan cap), Treasury Manager (Bank/MFS verification, loan disbursement), and Member (deposits, ballots, repayments).',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'Sensitive account numbers, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest with AES-256-GCM and linked in a sequential SHA-256 hash chain.',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Both Qard Hasan lending requests and post-maturity Halal investment placements require affirmative votes from at least two-thirds of active members.',
  },
  {
    Icon: KeyRound,
    title: 'Automated Treasury & Workspace Sync',
    description:
      'Live central balance accounting tracks every contribution, loan approval deduction, and repayment return, with automated Google Sheets blueprint sync and Gmail notifications.',
  },
];

export function PublicAboutView({ onNavigate }: PublicAboutViewProps) {
  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            About Amanah Co-op
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Transparent mutual support before maturity. Real-economy Halal growth after maturity.
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Amanah Co-op was designed so a trusted community can pool monthly savings without
            interest, extend interest-free Qard Hasan relief to fellow members through democratic 2/3
            voting, and later deploy the matured capital into vetted Mudarabah, Musharakah, and
            Murabahah enterprises.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PILLARS.map((pillar) => {
            const Icon = pillar.Icon;
            return (
              <div
                key={pillar.title}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {pillar.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Ready to inspect the cooperative bylaws or access your account?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Review all eligibility criteria, repayment rules, and central balance accounting before
              submitting an application.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('rules')}
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Read Cooperative Rules
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Sign In / Apply</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
