'use client';

import Link from 'next/link';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Users, Vote } from 'lucide-react';

const PILLARS = [
  {
    Icon: ShieldCheck,
    title: 'Admin-Verified Membership',
    description:
      'Every applicant submits verified identity details (NID, photo, reference member, and addresses) into a pending queue. Only accounts vetted and activated by an Administrator can sign in.',
    gradient:
      'bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/35 dark:from-emerald-950/35 dark:via-slate-900 dark:to-emerald-950/15 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700/80',
    iconClass: 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 text-emerald-700 dark:text-emerald-400',
  },
  {
    Icon: Users,
    title: 'Granular Role-Based Access Control',
    description:
      'Strict separation of duties across Administrator (KYC approval, policy, annual loan cap), Treasury Manager (Bank/MFS reconciliation, disbursement), and Member (deposits, ballots, repayments).',
    gradient:
      'bg-gradient-to-br from-emerald-50/85 via-white to-amber-50/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-amber-950/15 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700/80',
    iconClass: 'bg-gradient-to-br from-emerald-500/20 to-amber-500/10 text-emerald-700 dark:text-emerald-400',
  },
  {
    Icon: Lock,
    title: 'AES-256-GCM & SHA-256 Audit Chain',
    description:
      'Personal KYC fields, Bank/MFS transaction IDs, and disbursement contexts are encrypted at rest with AES-256-GCM and linked in a sequential SHA-256 hash chain.',
    gradient:
      'bg-gradient-to-br from-amber-50/90 via-white to-amber-50/35 dark:from-amber-950/30 dark:via-slate-900 dark:to-amber-950/15 border-amber-200/80 dark:border-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700/80',
    iconClass: 'bg-gradient-to-br from-amber-500/20 to-amber-600/5 text-amber-700 dark:text-amber-400',
  },
  {
    Icon: Vote,
    title: '2/3 Supermajority Consensus',
    description:
      'Both Qard Hasan lending requests and post-maturity Halal investment placements require affirmative votes from at least two-thirds of active members.',
    gradient:
      'bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-emerald-950/15 border-amber-200/80 dark:border-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700/80',
    iconClass: 'bg-gradient-to-br from-amber-500/20 to-emerald-500/10 text-amber-700 dark:text-amber-400',
  },
  {
    Icon: KeyRound,
    title: 'Automated Treasury & Workspace Sync',
    description:
      'Live central balance accounting tracks every contribution, loan approval deduction, and repayment return, with automated Google Sheets blueprint sync and Gmail notifications.',
    gradient:
      'bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/45 dark:from-amber-950/25 dark:via-slate-900 dark:to-emerald-950/20 border-amber-200/80 dark:border-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700/80',
    iconClass: 'bg-gradient-to-br from-amber-500/20 to-emerald-500/15 text-amber-700 dark:text-amber-400',
  },
];

export function About() {
  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Security & Architecture
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
                className={`border rounded-xl p-6 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${pillar.gradient}`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${pillar.iconClass}`}
                >
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

        <div className="bg-gradient-to-br from-emerald-50/85 via-white to-amber-50/60 dark:from-emerald-950/35 dark:via-slate-900 dark:to-amber-950/25 border border-emerald-200/80 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-200 hover:shadow-md">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Ready to inspect the governance charter or apply for membership?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Review all eligibility criteria, repayment rules, and central balance accounting before
              submitting an application.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/rules"
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 transition-all duration-200"
            >
              Governance Charter
            </Link>
            <Link
              href="/signup"
              className="group px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              <span>Apply for Membership</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
