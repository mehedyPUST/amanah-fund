'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  HandCoins,
  HelpCircle,
  LockKeyhole,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

type RoleGuideKey = 'member' | 'manager' | 'admin';

interface GuideStep {
  number: string;
  title: string;
  summary: string;
  actionHint: string;
  Icon: LucideIcon;
  toneClass: string;
  borderHover: string;
}

interface RoleGuide {
  key: RoleGuideKey;
  label: string;
  badge: string;
  headline: string;
  steps: GuideStep[];
}

const ROLE_GUIDES: RoleGuide[] = [
  {
    key: 'member',
    label: 'Members',
    badge: 'Savings, Loans & Ballots',
    headline: 'Everyday workflow for verified cooperative shareholders',
    steps: [
      {
        number: '01.',
        title: 'Apply & Complete KYC',
        summary:
          'Submit your application on Join / Apply with NID, nominee details, portrait photo, and an existing member reference.',
        actionHint: 'Application → Admin Review → Portal Access',
        Icon: UserCheck,
        toneClass:
          'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
      },
      {
        number: '02.',
        title: 'Log Monthly Savings',
        summary:
          'Deposit ৳5,000 per share by the 10th via Bank or MFS, then upload the receipt or transaction ID in Monthly Contribution.',
        actionHint: 'Monthly Contribution → Submit Receipt',
        Icon: Wallet,
        toneClass:
          'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
        borderHover: 'hover:border-teal-300 dark:hover:border-teal-700/70',
      },
      {
        number: '03.',
        title: 'Request & Repay Qard Hasan',
        summary:
          'Apply for a 0% interest loan (up to ৳50,000 or 75% of your savings) and submit monthly installments over up to 10 months.',
        actionHint: 'Request Qard Hasan → Track Schedule',
        Icon: HandCoins,
        toneClass:
          'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50',
        borderHover: 'hover:border-cyan-300 dark:hover:border-cyan-700/70',
      },
      {
        number: '04.',
        title: 'Vote & Connect Safely',
        summary:
          'Cast secret 2/3 ballots on loan requests and Halal ventures in Opinion Ballot, and message verified peers in Community.',
        actionHint: 'Opinion Ballot · Community Hub',
        Icon: Vote,
        toneClass:
          'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
        borderHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
      },
    ],
  },
  {
    key: 'manager',
    label: 'Shura Managers',
    badge: 'Review & Ballots',
    headline: 'Operational oversight for elected 5-member Shura managers',
    steps: [
      {
        number: '01.',
        title: 'Verify Deposit Receipts',
        summary:
          'Inspect incoming Bank/MFS deposit slips and installment payments in Governance Desk before crediting member savings.',
        actionHint: 'Governance Desk → Contributions',
        Icon: ClipboardCheck,
        toneClass:
          'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
      },
      {
        number: '02.',
        title: 'Open 2/3 Loan Ballots',
        summary:
          'Review pending Qard Hasan applications against liquidity limits and launch secret opinion voting for active members.',
        actionHint: 'Governance Desk → Loan Requests',
        Icon: Vote,
        toneClass:
          'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
        borderHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
      },
      {
        number: '03.',
        title: 'Reveal Tallies & Disburse',
        summary:
          'Close voting once quorum is met, reveal anonymized tallies, and record disbursement proof for approved loans.',
        actionHint: 'Reveal Ballot → Mark Disbursed',
        Icon: CheckCircle2,
        toneClass:
          'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
        borderHover: 'hover:border-teal-300 dark:hover:border-teal-700/70',
      },
      {
        number: '04.',
        title: 'Propose Ventures & Meetings',
        summary:
          'Publish Halal investment proposals for 2/3 voting, create community polls, and sync Shura meeting notices.',
        actionHint: 'Governance Desk → Projects & Polls',
        Icon: Building2,
        toneClass:
          'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
        borderHover: 'hover:border-indigo-300 dark:hover:border-indigo-700/70',
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administrators',
    badge: 'Registry & Policy',
    headline: 'System administration, KYC approval, and constitution custody',
    steps: [
      {
        number: '01.',
        title: 'Approve Member KYC',
        summary:
          'Verify NIDs, nominee shares, portrait uploads, and reference checks in Member Registry before activating new accounts.',
        actionHint: 'User & Role Management → Pending',
        Icon: ShieldCheck,
        toneClass:
          'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/70 dark:ring-indigo-800/50',
        borderHover: 'hover:border-indigo-300 dark:hover:border-indigo-700/70',
      },
      {
        number: '02.',
        title: 'Set Treasury Parameters',
        summary:
          'Configure monthly contribution rates, late fees, loan caps, maturity date, and member roles in Site Settings.',
        actionHint: 'Site Settings → Policy Controls',
        Icon: Settings,
        toneClass:
          'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/70 dark:ring-teal-800/50',
        borderHover: 'hover:border-teal-300 dark:hover:border-teal-700/70',
      },
      {
        number: '03.',
        title: 'Publish Constitution PDF',
        summary:
          'Upload the signed cooperative constitution PDF in Site Settings so all visitors and members can view it from ImageKit.',
        actionHint: 'Site Settings → Constitution PDF',
        Icon: FileCheck2,
        toneClass:
          'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/70 dark:ring-amber-800/50',
        borderHover: 'hover:border-amber-300 dark:hover:border-amber-700/70',
      },
      {
        number: '04.',
        title: 'Audit & Sync Reports',
        summary:
          'Verify the SHA-256 audit log chain, mirror treasury tabs to Google Sheets, and export periodic financial reports.',
        actionHint: 'Audit Logs · Sheets Sync',
        Icon: LockKeyhole,
        toneClass:
          'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-800/50',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700/70',
      },
    ],
  },
];

export function HowItWorks({ embedded = true }: { embedded?: boolean }) {
  const pathname = usePathname();
  const { user } = useCoopSession();
  const [activeRole, setActiveRole] = useState<RoleGuideKey>('member');

  const currentGuide = ROLE_GUIDES.find((g) => g.key === activeRole) || ROLE_GUIDES[0];
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={
        embedded
          ? 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100'
          : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-8 shadow-2xs text-slate-900 dark:text-slate-100 max-w-7xl mx-auto'
      }
    >
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-2xl space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>How It Works</span>
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
              }
            >
              Simple Workflows for Every Cooperative Role
            </HeadingTag>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentGuide.headline}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Select cooperative role guide"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 self-start lg:self-auto"
          >
            {ROLE_GUIDES.map((guide) => {
              const selected = guide.key === activeRole;
              return (
                <button
                  key={guide.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveRole(guide.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    selected
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-900'
                  }`}
                >
                  {guide.label}
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentGuide.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5"
          >
            {currentGuide.steps.map((step) => {
              const Icon = step.Icon;
              return (
                <div
                  key={step.number}
                  className={`rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 flex flex-col justify-between gap-3 transition-colors ${step.borderHover}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${step.toneClass}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {step.summary}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {step.actionHint}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900 dark:text-white">Quick rule:</strong>{' '}
              ৳5,000/share monthly due by the 10th · 0% Qard Hasan requires 2/3 member vote · ৳50 late fees go to annual Sadaqah.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/#governance-charter"
              onClick={(e) => {
                if (pathname === '/') {
                  e.preventDefault();
                  document
                    .getElementById('governance-charter')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', '#governance-charter');
                }
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-300 dark:hover:border-amber-700 transition-colors whitespace-nowrap"
            >
              Read Charter
            </Link>
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="group px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-all whitespace-nowrap"
            >
              <span>{user ? 'Dashboard' : 'Join Amanah'}</span>
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
