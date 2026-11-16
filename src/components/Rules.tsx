'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Download, ExternalLink, Eye, EyeOff, FileText } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const CONSTITUTION_PDF_PATH =
  '/assets/aistudio/Savings__Investment_and_Interest-Free_Loan_Fund_Cooperative_Society_Update_1_98df82ac.pdf';

const RULES = [
  {
    code: 'ART. 01–06',
    title: 'Society Identity, VISION-36 Term (2027–2036) & 20-Member Cap',
    summary:
      'Operates as Savings, Investment and Interest-Free Loan Fund Cooperative Society (সঞ্চয়, বিনিয়োগ ও সুদমুক্ত ঋণ তহবিল) from January 2027 through December 2036, building joint capital for Halal investment and interest-free Qard Hasan.',
    points: [
      'Membership & Share Limit (§6): Maximum 20 members / shares total. New intake closes July 2027; late joiners before July 2027 pay all prior months’ arrears in full.',
      'Second Share Rule (§6ঙ): If fewer than 20 members join by July 2027, an existing member may hold up to 2 shares (paying prior arrears), never exceeding 20 total shares.',
      'Onboarding & Fee (§4–5): Applicants must be practicing (Namazi), cautious of Halal/Haram, submit photo + NID (member & nominee), and pay a 200 BDT non-refundable management fee.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    codeClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    code: 'ART. 08–10',
    title: 'Monthly Savings (৳5,000 by 10th), Joint Accounts & Sadaqah Late Fee',
    summary:
      'Every share contributes 5,000 BDT per month into joint cooperative accounts managed with dual-custody safeguards and hard/soft copy ledger archiving.',
    points: [
      'Monthly Due Date (§10ক): 5,000 BDT/month payable by the 10th of each month; upload deposit slip in the portal and retain the original receipt.',
      'Late Fee & Annual Sadaqah (§10খ–গ): Deposits after the 10th incur a 50 BDT late fee held in a separate Sadaqah account and distributed as Sadaqah every January.',
      'Joint Custody (§8): Account cheque books are held by a Shura Committee member separate from the account signatory; withdrawals require Shura/Board meeting approval.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    codeClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    code: 'ART. 11',
    title: 'Membership Cancellation, Arrears & Exit Policy',
    summary:
      'Structured continuity protects long-term cooperative capital while giving fair reinstatement pathways for temporary hardship.',
    points: [
      '3-Month & 7-Month Arrears (§11খ–গ): 3 months of arrears suspends membership (rejoinable within 2 months with 200 BDT fee); 7 consecutive months causes permanent cancellation unless reinstated by written petition, full arrears settlement, and Shura approval.',
      'Minimum Commitment & Exit (§11ক, ঙ): No member may exit before at least 1 investment is completed. Afterwards, shares may be transferred to an approved known person or existing member (prioritizing lower-share holders) at the 4-monthly Board share valuation.',
      'Non-Reentry & Conduct (§11ঘ, ঙ): Exited members cannot rejoin a second time; Shura/Board meetings may revoke membership for misconduct or disruption.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/70',
    codeClass: 'text-indigo-700 dark:text-indigo-400',
    iconClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    code: 'ART. 12',
    title: 'Qard Hasan (0% Interest) — Max ৳50,000 or 75% Savings & 10-Month Cap',
    summary:
      'Effective January 2027, members may request strictly 0% interest Qard Hasan loans enforced programmatically against cooperative caps and maturity timelines.',
    points: [
      'Borrowing Limit (§12ক): Maximum 50,000 BDT per 1 share OR 75% of the member’s accumulated approved savings — whichever is lower.',
      'Repayment Window (§12খ, ঘ): Maximum 10 monthly installments. Within the final 10 months of the project (2036), installment months cap at the remaining project months so all loans settle before project close.',
      'Installment Late Fee (§12গ): Overdue monthly installments incur a 50 BDT late fee tracked separately and distributed as Sadaqah every January.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700/70',
    codeClass: 'text-cyan-700 dark:text-cyan-400',
    iconClass: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    code: 'ART. 07, 13–19',
    title: '2/3 Supermajority Consensus & Dual 5-Member Committees',
    summary:
      'Governance is split between a 5-member Management/Shura Committee and a 5-member Savings Accounts Committee, with impartial asset protections and transparent reporting.',
    points: [
      '2/3 Investment & Ballot Quorum (§7): Every capital investment and Qard Hasan ballot requires at least 2/3 member approval with SHA-256 signature verification.',
      'Shura & Savings Committees (§18–19): Shura oversees loan review and publishes active/pending loan lists by the 15th (with annual December review); Savings Committee maintains per-member ledgers and shares bank statements by the 15th.',
      'Amendments & Impartiality (§14, 17): Member capital/profit cannot be arbitrarily seized; constitution amendments require 2/3 of Shura plus 1/2 of present members.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    code: 'ART. 20–25',
    title: 'VISION-36 Real-Economy Goals, Islamic Schools & Al Madina City',
    summary:
      'Over the 10-year horizon (2027–2036), cooperative Halal investments target durable community assets, education, and safeguarded member equity.',
    points: [
      'VISION-36 Land & Schools (§21): Enable 1 land share per member share by 2036 (or distribute/reinvest upon early target completion) and establish Islamic schools in at least 3 districts.',
      'Al Madina City & Maktabs (§22–23): Long-term residential housing society vision with Masjid, Hifzkhana, Islamic School & Qawmi Madrasah, plus Maktabs across northern and hill-tract districts.',
      'Stewardship & Safeguards (§24–25): Members actively oversee properties; in any leadership crisis, Shura executes an orderly 3–4 month wind-down returning full shareholder funds.',
    ],
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
];

export function Rules({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Official Constitution &amp; Bylaws · Term: Jan 2027 – Dec 2036 (VISION-36)
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Savings, Investment &amp; Interest-Free Loan Fund Charter
          </HeadingTag>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            Articles 1–25 of the cooperative constitution (সঞ্চয়, বিনিয়োগ ও সুদমুক্ত ঋণ তহবিল গঠনতন্ত্র, নীতিমালা এবং নির্দেশিকা) are enforced in the Amanah ledger, 2/3 member voting engine, and Shura audit trail.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.25 }}
          className="rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/75 via-white to-emerald-50/40 dark:from-indigo-950/35 dark:via-slate-900 dark:to-emerald-950/20 p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800/60 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Official Cooperative Constitution PDF (Articles 1–25 · 2027–2036)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Read or download the full Bengali constitution covering membership cap (20), ৳5,000 monthly savings, ৳50 Sadaqah late fees, Qard Hasan limits, and VISION-36.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPdfPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                {showPdfPreview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Hide PDF</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Preview PDF</span>
                  </>
                )}
              </button>
              <a
                href={CONSTITUTION_PDF_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-xs font-medium text-teal-800 dark:text-teal-300 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open PDF</span>
              </a>
              <a
                href={CONSTITUTION_PDF_PATH}
                download="Savings-Investment-Interest-Free-Loan-Fund-Constitution-2027-2036.pdf"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs transition-all whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download PDF</span>
              </a>
            </div>
          </div>

          <AnimatePresence>
            {showPdfPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
              >
                <iframe
                  src={CONSTITUTION_PDF_PATH}
                  title="Savings, Investment and Interest-Free Loan Fund Cooperative Society Constitution PDF"
                  className="w-full h-[560px]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="space-y-4">
          {RULES.map((rule, idx) => (
            <motion.article
              key={rule.code}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ duration: 0.22, delay: idx * 0.04 }}
              className={`border rounded-xl p-6 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${rule.cardClass}`}
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className={`font-mono text-xs sm:text-sm font-bold ${rule.codeClass}`}>
                  {rule.code}
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
            </motion.article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already an approved member or ready to apply under the 20-member charter?
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200 whitespace-nowrap"
            >
              Member Sign In
            </Link>
            <Link
              href="/signup"
              className="group px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
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
