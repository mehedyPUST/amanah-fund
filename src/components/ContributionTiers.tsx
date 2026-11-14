'use client';

import { useMemo } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  HandCoins,
  Scale,
  ShieldCheck,
  TrendingUp,
  Vote,
} from 'lucide-react';
import type { Contribution, FundConfig, PublicUser } from '../types/coop.ts';
import { formatMoney } from '../utils/format.ts';
import type { NavTab } from './OverviewView.tsx';

interface ContributionTiersProps {
  user: PublicUser;
  contributions: Contribution[];
  config: FundConfig | null;
  onNavigate?: (tab: NavTab) => void;
}

type TierKey = 'onboarding' | 'standard' | 'silver' | 'gold' | 'anchor';

interface TierDefinition {
  key: TierKey;
  name: string;
  monthlyCadence: string;
  minMultiplier: number;
  maxMultiplier: number | null;
  summary: string;
  accentClass: string;
  loanAccessLabel: string;
  votingRightLabel: string;
  halalProposalRight: string;
  referenceRight: string;
  benefits: string[];
}

const TIER_DEFINITIONS: TierDefinition[] = [
  {
    key: 'onboarding',
    name: 'Onboarding Tier',
    monthlyCadence: 'Pending 1st verified deposit',
    minMultiplier: 0,
    maxMultiplier: 0,
    summary: 'Verified KYC account preparing first monthly Bank or MFS cooperative contribution.',
    accentClass: 'text-slate-600 dark:text-slate-400',
    loanAccessLabel: 'Directory & Transparency Only',
    votingRightLabel: 'Observer (Unlocks after 1st deposit)',
    halalProposalRight: 'View-only',
    referenceRight: 'Not yet eligible',
    benefits: [
      'Full access to Active Members Directory & Treasury Analytics',
      'Downloadable statement ledger upon first verified contribution',
      'Eligible for Standard Tier rights immediately after first deposit approval',
    ],
  },
  {
    key: 'standard',
    name: 'Standard Tier',
    monthlyCadence: '1× monthly base target',
    minMultiplier: 0.01,
    maxMultiplier: 2,
    summary: 'Active monthly contributor building steady cooperative equity and 2/3 voting standing.',
    accentClass: 'text-slate-800 dark:text-slate-200',
    loanAccessLabel: 'Standard Qard Hasan Cap',
    votingRightLabel: '1 Member = 1 Vote (Full 2/3 Ballot)',
    halalProposalRight: 'Vote Yes / No on placements',
    referenceRight: 'After 2nd approved month',
    benefits: [
      'Full 2/3 voting rights to Upvote or Downvote Qard Hasan loan requests',
      'Eligible to apply for 0% interest Qard Hasan loans within annual quota',
      'Generate signed PDF contribution & loan repayment statements anytime',
    ],
  },
  {
    key: 'silver',
    name: 'Silver Tier',
    monthlyCadence: '2+ months equivalent cumulative',
    minMultiplier: 2,
    maxMultiplier: 6,
    summary: 'Consistent cooperative contributor unlocking extended repayment windows and endorsements.',
    accentClass: 'text-sky-700 dark:text-sky-400',
    loanAccessLabel: 'Up to Max Installment Term',
    votingRightLabel: '1 Member = 1 Vote (Full 2/3 Ballot)',
    halalProposalRight: 'Vote Yes / No on placements',
    referenceRight: 'Eligible to endorse applicants',
    benefits: [
      'All Standard Tier benefits and full 2/3 democratic voting power',
      'Priority multi-month Qard Hasan installment plans up to maximum term',
      'Authorized as a verified member reference for new membership applications',
    ],
  },
  {
    key: 'gold',
    name: 'Gold Tier',
    monthlyCadence: '6+ months equivalent (or 2× pace)',
    minMultiplier: 6,
    maxMultiplier: 12,
    summary: 'Established cooperative partner eligible to propose Shariah-vetted Halal investments.',
    accentClass: 'text-amber-700 dark:text-amber-400',
    loanAccessLabel: 'Full Cooperative Loan Cap',
    votingRightLabel: '1 Member = 1 Vote (Full 2/3 Ballot)',
    halalProposalRight: 'Propose & Vote on Halal Projects',
    referenceRight: 'Priority applicant endorsement',
    benefits: [
      'All Silver Tier benefits with full maximum loan cap eligibility',
      'Eligible to submit post-maturity Mudarabah, Musharakah & Murabahah proposals',
      'Highlighted Gold standing in the authenticated Active Members directory',
    ],
  },
  {
    key: 'anchor',
    name: 'Anchor Tier',
    monthlyCadence: '12+ months equivalent cumulative',
    minMultiplier: 12,
    maxMultiplier: null,
    summary: 'Foundational long-term capital steward eligible for cooperative governance leadership.',
    accentClass: 'text-emerald-700 dark:text-emerald-400',
    loanAccessLabel: 'Full Cap + Emergency Priority',
    votingRightLabel: '1 Member = 1 Vote (Full 2/3 Ballot)',
    halalProposalRight: 'Propose, Vet & Vote on Projects',
    referenceRight: 'Senior guarantor endorsement',
    benefits: [
      'All Gold Tier rights with senior cooperative stewardship recognition',
      'Eligible for Treasurer / Manager governance nomination & audit committee review',
      'Full post-maturity Shariah real-economy surplus weight proportional to ledger equity',
    ],
  },
];

function resolveTierKey(totalContributed: number, baseMonthly: number): TierKey {
  if (totalContributed >= baseMonthly * 12) return 'anchor';
  if (totalContributed >= baseMonthly * 6) return 'gold';
  if (totalContributed >= baseMonthly * 2) return 'silver';
  if (totalContributed > 0) return 'standard';
  return 'onboarding';
}

export function ContributionTiers({
  user,
  contributions,
  config,
  onNavigate,
}: ContributionTiersProps) {
  const ccy = config?.currency || 'BDT';
  const baseMonthly = Math.max(1000, config?.monthlyContributionAmount || 5000);
  const maxLoanCap = config?.maxLoanAmount || 75000;
  const maxMonths = config?.maxInstallmentMonths || 12;

  const personalStats = useMemo(() => {
    const myApproved = contributions.filter(
      (c) => c.userId === user.id && c.status === 'approved'
    );
    const totalContributed = myApproved.reduce((sum, c) => sum + c.amount, 0);
    const currentKey = resolveTierKey(totalContributed, baseMonthly);
    const currentIndex = TIER_DEFINITIONS.findIndex((t) => t.key === currentKey);
    const currentTier = TIER_DEFINITIONS[currentIndex] || TIER_DEFINITIONS[0];
    const nextTier =
      currentIndex >= 0 && currentIndex < TIER_DEFINITIONS.length - 1
        ? TIER_DEFINITIONS[currentIndex + 1]
        : null;

    const nextThresholdAmount = nextTier
      ? nextTier.key === 'standard'
        ? baseMonthly
        : Math.round(baseMonthly * nextTier.minMultiplier)
      : totalContributed;
    const remainingToNext = nextTier ? Math.max(0, nextThresholdAmount - totalContributed) : 0;
    const progressPct = nextTier
      ? Math.min(100, Math.round((totalContributed / Math.max(1, nextThresholdAmount)) * 100))
      : 100;
    const monthsEquivalent = Math.round((totalContributed / baseMonthly) * 10) / 10;

    return {
      approvedCount: myApproved.length,
      totalContributed,
      currentTier,
      nextTier,
      nextThresholdAmount,
      remainingToNext,
      progressPct,
      monthsEquivalent,
    };
  }, [contributions, user.id, baseMonthly]);

  function getThresholdLabel(tier: TierDefinition): string {
    if (tier.key === 'onboarding') return `${formatMoney(0, ccy)} contributed`;
    if (tier.key === 'standard') {
      return `${formatMoney(1, ccy)} – ${formatMoney(baseMonthly * 2 - 1, ccy)}`;
    }
    if (tier.maxMultiplier === null) {
      return `${formatMoney(baseMonthly * tier.minMultiplier, ccy)}+`;
    }
    return `${formatMoney(baseMonthly * tier.minMultiplier, ccy)} – ${formatMoney(
      baseMonthly * tier.maxMultiplier - 1,
      ccy
    )}`;
  }

  return (
    <div className="space-y-6">
      {/* Personal Tier Standing & Next-Level Progress */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Award className="w-4 h-4" aria-hidden="true" />
              <span>Member Standing & Benefit Tiers</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Your Current Tier:{' '}
              <span className={personalStats.currentTier.accentClass}>
                {personalStats.currentTier.name}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Base monthly cooperative target is{' '}
              <strong className="font-mono text-slate-700 dark:text-slate-300">
                {formatMoney(baseMonthly, ccy)}/month
              </strong>
              . Cumulative verified deposits unlock higher cooperative stewardship tiers while
              preserving strict 1-member-1-vote equality.
            </p>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('contributions')}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0 w-fit"
            >
              <span>Submit Contribution</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Your Verified Contributions
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {formatMoney(personalStats.totalContributed, ccy)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {personalStats.approvedCount} approved deposits · {personalStats.monthsEquivalent} mo
              equiv.
            </div>
          </div>

          <div className="sm:col-span-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {personalStats.nextTier
                  ? `Progress toward ${personalStats.nextTier.name} (${formatMoney(
                      personalStats.nextThresholdAmount,
                      ccy
                    )})`
                  : 'Highest Cooperative Stewardship Tier Achieved'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {personalStats.progressPct}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${personalStats.progressPct}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {personalStats.nextTier
                ? `Contribute ${formatMoney(
                    personalStats.remainingToNext,
                    ccy
                  )} more in verified deposits to unlock ${personalStats.nextTier.name} benefits.`
                : 'You have unlocked every benefit tier across Qard Hasan lending, applicant endorsement, and Halal governance.'}
            </div>
          </div>
        </div>
      </section>

      {/* Equal Governance Notice */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start gap-3">
        <Scale className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <strong className="font-semibold text-slate-900 dark:text-white">
            Shariah Cooperative Fairness Rule:
          </strong>{' '}
          Contribution tiers recognize cumulative savings consistency and unlock mentorship,
          repayment term flexibility, and proposal rights.{' '}
          <strong className="font-semibold text-slate-900 dark:text-white">
            Democratic 2/3 voting weight always stays strictly 1 verified member = 1 vote
          </strong>{' '}
          so no single member can dominate loan approvals.
        </div>
      </div>

      {/* 5 Tier Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TIER_DEFINITIONS.map((tier) => {
          const isCurrent = personalStats.currentTier.key === tier.key;
          return (
            <article
              key={tier.key}
              className={`rounded-xl p-5 flex flex-col justify-between gap-4 border transition-colors ${
                isCurrent
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/70 dark:border-emerald-700'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-base font-bold ${tier.accentClass}`}>{tier.name}</h3>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {tier.monthlyCadence}
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Current Tier</span>
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cumulative Deposit Threshold
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {getThresholdLabel(tier)}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tier.summary}
                </p>

                <ul className="space-y-2 pt-1">
                  {tier.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <HandCoins className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tier.loanAccessLabel}</span>
                </span>
                <span className="font-mono">
                  Max {maxMonths}mo · {formatMoney(maxLoanCap, ccy)}
                </span>
              </div>
            </article>
          );
        })}
      </section>

      {/* Benefits & Cooperative Rights Matrix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Contribution Tiers & Member Rights Comparison
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Thresholds scale automatically with your cooperative&apos;s monthly base contribution (
              {formatMoney(baseMonthly, ccy)}/month)
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium">
                <th className="py-3 px-4">Tier</th>
                <th className="py-3 px-4">Cumulative Threshold</th>
                <th className="py-3 px-4">2/3 Loan Voting Right</th>
                <th className="py-3 px-4">Qard Hasan Facility</th>
                <th className="py-3 px-4">Reference Endorsement</th>
                <th className="py-3 px-4">Halal Placements</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {TIER_DEFINITIONS.map((tier) => {
                const isCurrent = personalStats.currentTier.key === tier.key;
                return (
                  <tr
                    key={tier.key}
                    className={
                      isCurrent
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                    }
                  >
                    <td className="py-3 px-4 font-semibold whitespace-nowrap">
                      <span className={tier.accentClass}>{tier.name}</span>
                      {isCurrent && (
                        <span className="ml-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {getThresholdLabel(tier)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Vote className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                        <span>{tier.votingRightLabel}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {tier.loanAccessLabel}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {tier.referenceRight}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{tier.halalProposalRight}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
