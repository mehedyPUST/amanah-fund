'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const RULES = [
  {
    code: '01',
    title: 'Administrator-Approved Membership Onboarding',
    summary:
      'Every new member registration requires verified identity details (NID, existing member reference, date of birth, mobile, occupation, addresses, and photograph) and remains pending until approved by an Administrator.',
    points: [
      'Applications trigger an automated notification to active Administrators.',
      'Administrators inspect applicant KYC details and uploaded documents before activation.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    codeClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    code: '02',
    title: 'Monthly Bank & MFS Contributions',
    summary:
      'Members deposit their scheduled monthly contribution via approved Bank transfer or Mobile Financial Services (bKash, Nagad, Rocket) and submit the encrypted TrxID in the portal.',
    points: [
      'Submitting a request automatically notifies Treasury Managers for reconciliation.',
      'Accepting a contribution sends a confirmation email to the member and adds the exact amount to the Central Fund Balance.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    codeClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    code: '03',
    title: 'Central Fund Balance Accounting',
    summary:
      'All treasury movements follow transparent double-check arithmetic visible on the overview ledger.',
    points: [
      'Approved Monthly Contributions increase (+) the Central Fund Balance.',
      'Loans reaching 2/3 member approval immediately deduct (−) the principal from the Central Fund Balance.',
      'Verified monthly loan repayment installments restore (+) funds back to the Central Fund Balance.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    codeClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    code: '04',
    title: 'Qard Hasan Eligibility & Annual Quota',
    summary:
      'Loans are strictly 0% interest (Qard Hasan) and repaid in scheduled monthly installments. Automated eligibility checks run before any loan ballot is created.',
    points: [
      'No Active Loan: A member with an active or pending Qard Hasan loan cannot apply for another until repaid.',
      'Annual Quota: Default limit is 3 loans per member per calendar year, dynamically configurable by the Administrator.',
      'Pre-Maturity Window: Qard Hasan lending operates until the fund’s pre-specified maturity date.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    codeClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    code: '05',
    title: '2/3 Supermajority Member Voting',
    summary:
      'Both Qard Hasan loan requests and Halal investment placements are decided democratically by active members inside the app.',
    points: [
      'Quorum requires affirmative votes from at least two-thirds (⌈2/3 × active members⌉) of eligible members.',
      'Each ballot records an immutable SHA-256 signature hash and updates live via Server-Sent Events.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    code: '06',
    title: 'Post-Maturity Halal Investment Transition',
    summary:
      'Once the fund reaches its pre-specified maturity date, the pooled capital transitions from Qard Hasan relief lending to Shariah-vetted real-economy investments.',
    points: [
      'Permitted Islamic structures: Mudarabah (profit-sharing), Musharakah (joint venture), and Murabahah (cost-plus trade).',
      'Every investment placement must pass Shariah review and a 2/3 member "Yes / No" vote.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
];

export function Rules({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-10">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Cooperative Governance &amp; Bylaws
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Operating Rules &amp; Shariah Charter
          </HeadingTag>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            These rules are enforced programmatically in the Amanah backend, encrypted audit
            trail, and 2/3 member voting engine.
          </p>
        </div>

        <div className="space-y-4">
          {RULES.map((rule) => (
            <article
              key={rule.code}
              className={`border rounded-xl p-6 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${rule.cardClass}`}
            >
              <div className="flex items-baseline gap-3">
                <span className={`font-mono text-sm font-bold ${rule.codeClass}`}>
                  RULE {rule.code}
                </span>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {rule.title}
                </h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {rule.summary}
              </p>
              <ul className="space-y-1.5 pt-1">
                {rule.points.map((pt) => (
                  <li
                    key={pt}
                    className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300"
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${rule.iconClass}`}
                      aria-hidden="true"
                    />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already an approved member or ready to apply?
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
            >
              Member Sign In
            </Link>
            <Link
              href="/signup"
              className="group px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
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
