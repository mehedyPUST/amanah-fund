'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { MotionCard, type CardHue } from './MotionCard.tsx';

type RoleGuideKey = 'member' | 'manager' | 'admin';

interface GuideStep {
  number: string;
  title: string;
  summary: string;
  actionHint: string;
  Icon: LucideIcon;
}

interface RoleGuide {
  key: RoleGuideKey;
  label: string;
  headline: string;
  steps: GuideStep[];
}

const ROLE_GUIDES: RoleGuide[] = [
  {
    key: 'member',
    label: 'Members',
    headline: 'Everyday workflow for verified cooperative shareholders',
    steps: [
      {
        number: '01.',
        title: 'Apply & Complete KYC',
        summary:
          'Submit your application on Join Amanah with NID, nominee details, portrait photo, and an existing member reference.',
        actionHint: 'Application → Admin Review → Portal Access',
        Icon: UserCheck,
      },
      {
        number: '02.',
        title: 'Log Monthly Savings',
        summary:
          'Deposit ৳5,000 per share by the 10th via Bank or MFS, then upload the receipt or transaction ID in Monthly Contribution.',
        actionHint: 'Monthly Contribution → Submit Receipt',
        Icon: Wallet,
      },
      {
        number: '03.',
        title: 'Request & Repay Qard Hasan',
        summary:
          'Apply for a 0% interest loan (up to ৳50,000 or 75% of your savings) and submit monthly installments over up to 10 months.',
        actionHint: 'Request Qard Hasan → Track Schedule',
        Icon: HandCoins,
      },
      {
        number: '04.',
        title: 'Vote & Connect Safely',
        summary:
          'Cast secret 2/3 ballots on loan requests and Halal ventures in Opinion Ballot, and message verified peers in Community.',
        actionHint: 'Opinion Ballot · Community Hub',
        Icon: Vote,
      },
    ],
  },
  {
    key: 'manager',
    label: 'Shura Managers',
    headline: 'Operational oversight for elected 5-member Shura managers',
    steps: [
      {
        number: '01.',
        title: 'Verify Deposit Receipts',
        summary:
          'Inspect incoming Bank/MFS deposit slips and installment payments in Governance Desk before crediting member savings.',
        actionHint: 'Governance Desk → Contributions',
        Icon: ClipboardCheck,
      },
      {
        number: '02.',
        title: 'Open 2/3 Loan Ballots',
        summary:
          'Review pending Qard Hasan applications against liquidity limits and launch secret opinion voting for active members.',
        actionHint: 'Governance Desk → Loan Requests',
        Icon: Vote,
      },
      {
        number: '03.',
        title: 'Reveal Tallies & Disburse',
        summary:
          'Close voting once quorum is met, reveal anonymized tallies, and record disbursement proof for approved loans.',
        actionHint: 'Reveal Ballot → Mark Disbursed',
        Icon: CheckCircle2,
      },
      {
        number: '04.',
        title: 'Propose Ventures & Meetings',
        summary:
          'Publish Halal investment proposals for 2/3 voting, create community polls, and sync Shura meeting notices.',
        actionHint: 'Governance Desk → Projects & Polls',
        Icon: Building2,
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administrators',
    headline: 'System administration, KYC approval, and constitution custody',
    steps: [
      {
        number: '01.',
        title: 'Approve Member KYC',
        summary:
          'Verify NIDs, nominee shares, portrait uploads, and reference checks in Member Registry before activating new accounts.',
        actionHint: 'User & Role Management → Pending',
        Icon: ShieldCheck,
      },
      {
        number: '02.',
        title: 'Set Treasury Parameters',
        summary:
          'Configure monthly contribution rates, late fees, loan caps, maturity date, and member roles in Site Settings.',
        actionHint: 'Site Settings → Policy Controls',
        Icon: Settings,
      },
      {
        number: '03.',
        title: 'Publish Constitution PDF',
        summary:
          'Upload the signed cooperative constitution PDF in Site Settings so all visitors and members can view or download it.',
        actionHint: 'Site Settings → Constitution PDF',
        Icon: FileCheck2,
      },
      {
        number: '04.',
        title: 'Audit & Sync Reports',
        summary:
          'Verify the SHA-256 audit log chain, mirror treasury tabs to Google Sheets, and export periodic financial reports.',
        actionHint: 'Audit Logs · Sheets Sync',
        Icon: LockKeyhole,
      },
    ],
  },
];

export function HowItWorks({ embedded = true }: { embedded?: boolean }) {
  const { user } = useCoopSession();
  const [activeRole, setActiveRole] = useState<RoleGuideKey>('member');

  const currentGuide = ROLE_GUIDES.find((g) => g.key === activeRole) || ROLE_GUIDES[0];
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div
      className={`bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs text-slate-900 dark:text-slate-100 w-full ${
        embedded ? 'p-6 sm:p-7' : 'p-6 sm:p-9'
      }`}
    >
      <section className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800">
          <div className="max-w-2xl space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>How It Works</span>
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
              }
            >
              Clear workflows for every cooperative role
            </HeadingTag>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentGuide.headline}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Select cooperative role guide"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 self-start lg:self-auto"
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
                  className={`relative px-3.5 py-2 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    selected
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="how-it-works-role-tab"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/70 dark:border-slate-700/70"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{guide.label}</span>
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {currentGuide.steps.map((step, idx) => {
              const Icon = step.Icon;
              const stepHue: CardHue = (['emerald', 'teal', 'sky', 'amber'] as const)[idx % 4];
              const stepCardClass = [
                'bg-gradient-to-br from-emerald-100/75 via-emerald-50/35 to-white/85 dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900/80 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-300/90 dark:hover:border-emerald-700/70',
                'bg-gradient-to-br from-teal-100/75 via-teal-50/35 to-white/85 dark:from-teal-950/45 dark:via-teal-950/20 dark:to-slate-900/80 border-teal-200/80 dark:border-teal-900/50 hover:border-teal-300/90 dark:hover:border-teal-700/70',
                'bg-gradient-to-br from-sky-100/75 via-sky-50/35 to-white/85 dark:from-sky-950/45 dark:via-sky-950/20 dark:to-slate-900/80 border-sky-200/80 dark:border-sky-900/50 hover:border-sky-300/90 dark:hover:border-sky-700/70',
                'bg-gradient-to-br from-amber-100/75 via-amber-50/35 to-white/85 dark:from-amber-950/45 dark:via-amber-950/20 dark:to-slate-900/80 border-amber-200/80 dark:border-amber-900/50 hover:border-amber-300/90 dark:hover:border-amber-700/70',
              ][idx % 4];
              return (
                <MotionCard
                  key={step.number}
                  hue={stepHue}
                  delay={idx * 0.03}
                  className={`backdrop-blur-md rounded-xl border ${stepCardClass} p-5 flex flex-col justify-between gap-4 shadow-xs hover:shadow-md transition-all duration-200`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {step.number}
                      </span>
                      <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                      {step.summary}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/75 dark:border-slate-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {step.actionHint}
                  </div>
                </MotionCard>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900 dark:text-white">Quick rule:</strong>{' '}
              ৳5,000/share monthly due by the 10th · 0% Qard Hasan requires 2/3 member vote · ৳50 late fees go to annual Sadaqah.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/rules"
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Read Charter
            </Link>
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="group px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              <span>{user ? 'Open Dashboard' : 'Join Amanah'}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
