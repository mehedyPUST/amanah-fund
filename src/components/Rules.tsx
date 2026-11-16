'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { ConstitutionDocumentInfo } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatShortDate } from '../utils/format.ts';

interface CharterSection {
  code: string;
  title: string;
  summary: string;
  points: string[];
}

const CHARTER_SECTIONS: CharterSection[] = [
  {
    code: 'ART. 01–03',
    title: 'Identity, Core Mission & Community Objectives',
    summary:
      'Operates as the Savings, Investment and Interest-Free Loan Fund Cooperative Society to pool joint Halal investment capital while extending strictly 0% interest Qard Hasan support to members.',
    points: [
      'Article 1 — Society Name: Officially established as the Savings, Investment and Interest-Free Loan Fund Cooperative Society.',
      'Article 2 — Core Objective: Build collective capital for future Halal investments while utilizing ongoing accumulated funds as interest-free Qard Hasan loans to meet members’ urgent financial needs.',
      'Article 3 — Aims & Purposes: (a) Cultivate a strong, supportive community among members; (b) Contribute meaningfully to vital avenues of religious and charitable service; and (c) Empower members toward shared economic resilience and prosperity.',
    ],
  },
  {
    code: 'ART. 04–06',
    title: 'Membership Admission, Character Standards & 20-Share Term (2027–2036)',
    summary:
      'Sets transparent KYC onboarding standards, ethical conduct criteria, a strict 20-share ceiling, and a 10-year cooperative cycle running from January 2027 through December 2036.',
    points: [
      'Article 4 — Admission & Management Fee: Applicants enroll by completing the designated application form with a photograph, National ID copies for both member and nominee, and a non-refundable BDT 200 fee allocated to administrative supplies (stationery, registers, photocopying, stamps, and filing).',
      'Article 5 — Member Qualifications: Every member must (a) observe regular daily prayers (Salah), (b) exercise strict vigilance regarding Halal and Haram, (c) show sincere respect and affection toward respected Islamic scholars, and (d) wish well for the flourishing of Islamic values.',
      'Article 6 — Term & Cap: (a) Operations begin January 2027; (b) capped at 20 members total; (c) new admissions close in July 2027; (d) applicants joining up to July 2027 must settle all prior months’ arrears in full; (e) if fewer than 20 join by July 2027, an existing member may hold up to 2 shares by paying prior arrears in full—never exceeding 20 total members or shares; (f) the term concludes in December 2036, when members will unanimously determine any extension.',
    ],
  },
  {
    code: 'ART. 07–10',
    title: '2/3 Investment Consensus, Dual-Custody Accounts & Monthly Savings',
    summary:
      'Requires supermajority member approval for capital deployment, separates account signatories from checkbook custody, maintains hard and digital records, and routes late fees to annual charity.',
    points: [
      'Article 7 — Investment Approval: All financial investments deployed through the platform require formal approval from at least a two-thirds (2/3) majority of members.',
      'Article 8 — Capital Custody & Licensing: Share savings are deposited into a joint bank account (with an additional joint account permitted if balances grow). Checkbooks are held by a Shura/Management member separate from the signatories, and withdrawals require Shura/Board meeting authorization. Upon institutional licensing in the future, accounts will transition to the licensed entity and individual joint accounts will be closed.',
      'Article 9 — Recordkeeping: All membership applications, deposit slips, income ledgers, and expenditure records are preserved in both physical hard copies and digital formats using standardized forms and receipts.',
      'Article 10 — Monthly Savings & Sadaqah Late Fee: (a) BDT 5,000 per share is due by the 10th of each month, with deposit slips submitted to the designated officer and originals retained by members; (b) members unable to pay on time must notify a Management Committee member, and post-deadline deposits incur a BDT 50 late fee; (c) all late fees are held in a separate account and distributed as Sadaqah (charity) each January after annual closing.',
    ],
  },
  {
    code: 'ART. 11',
    title: 'Membership Cancellation, Arrears Policy & Share Exit Valuation',
    summary:
      'Protects long-term cooperative liquidity through structured notice windows, fair reinstatement procedures for temporary arrears, and 4-monthly share valuations.',
    points: [
      'Minimum Commitment & Exit (11a): No member may exit before at least one cooperative investment is completed. Thereafter, a member may withdraw upon consultation; entitled payouts are disbursed immediately if fund liquidity allows, or once sufficient capital accumulates.',
      'Three-Month & Seven-Month Arrears (11b–c): Three months of unpaid contributions result in suspension, redeemable within two months via a BDT 200 re-joining fee and reinstatement form. Seven consecutive unpaid months result in permanent cancellation, unless the member submits a written pledge of adherence, settles all arrears in full, and receives Shura/Management approval.',
      'Disciplinary Revocation & Share Transfers (11d–e): Creating disorder or undermining Shura/Board decisions warrants revocation via Shura/Board resolution. After the first investment, departing members should transfer their share to an approved acquaintance or an existing member (prioritizing holders with fewer shares), or else receive payout from the investment fund at the 4-monthly Board share valuation. Once exited, a member may never rejoin a second time.',
    ],
  },
  {
    code: 'ART. 12',
    title: 'Qard Hasan (0% Interest) — Up to BDT 50,000 or 75% of Savings',
    summary:
      'Starting January 2027, eligible members may access strictly interest-free Qard Hasan loans bounded by share caps, member savings ratios, and the cooperative end date.',
    points: [
      'Borrowing Limit (12a): Per single share, a member may borrow up to BDT 50,000 or 75% of their accumulated savings—whichever is lower.',
      'Repayment Schedule (12b): Loans must be repaid within a maximum of 10 monthly installments calculated proportionally to the principal and maximum term.',
      'Installment Late Fee & Maturity Settlement (12c–d): Overdue monthly installments incur a BDT 50 late fee held separately for annual January Sadaqah distribution. Within the final 10 months of the project (2036), installment counts scale to the remaining project months so every Qard Hasan settles in full before term completion.',
    ],
  },
  {
    code: 'ART. 13–17',
    title: 'Shariah Safeguards, Capital Protection, Due Diligence & Amendments',
    summary:
      'Guarantees impartial institutional governance free from outside influence, safeguards member principal and profits, and defines clear supermajority amendment procedures.',
    points: [
      'Articles 13–14 — Shariah Ruling & Capital Impartiality: Any fund loss caused through an individual’s involvement is resolved by final Shariah ruling. The society remains free from external or personal interference: a member’s capital and profit can never be arbitrarily confiscated, and verified dues owed to the society may only be offset via formal Board meeting notice.',
      'Articles 15–16 — Due Diligence & Dispute Resolution: Maximum caution and stamped legal documentation must accompany all fund investments. Unforeseen matters not covered by existing clauses are resolved through Shura consultation or a general advisory assembly of members.',
      'Article 17 — Constitutional Amendments: Amending, adding, or repealing any constitutional clause requires a member meeting convened by the Shura/Management Committee and the consent of at least two-thirds (2/3) of the Shura/Management Committee alongside one-half (1/2) of the other members present.',
    ],
  },
  {
    code: 'ART. 18–20',
    title: 'Dual 5-Member Shura & Savings Committees and Member Field Duties',
    summary:
      'Separates operational oversight and loan governance from ledger accounting, mandates monthly transparency by the 15th, and encourages active grassroots participation.',
    points: [
      'Article 18 — Management / Shura Committee (5 Members): Composed of up to 5 active, diligent members dedicated to property transactions and non-profit initiatives (with field allowances set by consultation). Shura administers loan reviews, resolves project disputes, publishes active/pending Qard Hasan lists by the 15th monthly, and allows voluntary annual rotation every December.',
      'Article 19 — Savings Accounts Committee (5 Members): Comprises joint bank account holders who maintain itemized per-member Excel ledgers, separately track Qard Hasan inflows/outflows and Sadaqah late fees, and publish bank statements plus account summaries to the member group by the 15th of every month.',
      'Article 20 — Member Duties: When any cooperative investment, religious, or social initiative operates in a member’s local or permanent area, members are expected to participate actively—or at minimum follow progress closely—as a service committed to lasting good.',
    ],
  },
  {
    code: 'ART. 21–25',
    title: 'VISION-36 Real Assets, Al Madina City, Stewardship & Continuity',
    summary:
      'Charts the 10-year roadmap toward member-owned land shares, Islamic educational institutions, model residential communities, and an orderly wind-down safeguard.',
    points: [
      'Article 21 — VISION-36 Goals: Achieve one land share per member share within 10 years (extending via Shura/Board resolution if needed, or distributing/reinvesting upon early completion), establish Islamic schools in at least 3 districts, and allow members to sell personal acquired shares when needed—prioritizing buyers aligned with cooperative values.',
      'Articles 22–23 — Al Madina City & Maktabs: Build a model residential housing community in each metropolitan city corporation featuring a Masjid and Hifzkhana complex, Islamic School, Qawmi Madrasah (integrating Islamic and general studies), prayer-centered community life, children’s play park and swimming pond, alongside foundational Maktabs across northern and hill-tract districts.',
      'Articles 24–25 — Property Stewardship & Wind-Down Safeguard: Recognizing that every asset reflects the hard-earned Halal savings of 20 members, all members share duty for property care. Should leadership disruptions ever threaten safe operations, the Shura/Board Committee must execute an orderly 3–4 month wind-down returning full shareholder funds.',
    ],
  },
];

export function Rules({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';
  const PdfHeadingTag = embedded ? 'h3' : 'h2';
  const ArticleHeadingTag = embedded ? 'h3' : 'h2';
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [constitution, setConstitution] = useState<ConstitutionDocumentInfo | null>(null);
  const [constitutionLoading, setConstitutionLoading] = useState(true);
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({});

  const allExpanded =
    !embedded || CHARTER_SECTIONS.every((section) => Boolean(expandedCodes[section.code]));

  function toggleSectionCode(code: string) {
    setExpandedCodes((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function toggleExpandAll() {
    if (allExpanded) {
      setExpandedCodes({});
    } else {
      const next: Record<string, boolean> = {};
      CHARTER_SECTIONS.forEach((s) => {
        next[s.code] = true;
      });
      setExpandedCodes(next);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .getConstitution()
      .then((res) => {
        if (active) setConstitution(res);
      })
      .catch(() => {
        if (active) setConstitution(null);
      })
      .finally(() => {
        if (active) setConstitutionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const constitutionUrl = constitution?.constitutionPdfUrl || null;
  const constitutionName = constitution?.constitutionPdfName || 'cooperative-constitution.pdf';

  return (
    <div
      className={
        embedded
          ? 'bg-gradient-to-b from-emerald-50/45 via-white to-white dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-4 sm:p-5 shadow-2xs text-slate-900 dark:text-slate-100'
          : 'bg-gradient-to-b from-emerald-50/45 via-white to-white dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-5 sm:p-8 shadow-2xs text-slate-900 dark:text-slate-100 max-w-7xl mx-auto'
      }
    >
      <section className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"
        >
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Official Constitution &amp; Bylaws · Term: Jan 2027 – Dec 2036 (VISION-36)
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
              }
            >
              Savings, Investment &amp; Interest-Free Loan Fund Charter
            </HeadingTag>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed text-justify">
              English translation of Articles 1–25 governing cooperative operations, Qard Hasan lending, and 2/3 member voting.
            </p>
          </div>
          {embedded && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleExpandAll}
                className="px-3 py-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                {allExpanded ? 'Collapse Clauses' : 'Expand All Articles'}
              </button>
              <Link
                href="/rules"
                className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors whitespace-nowrap"
              >
                Full Page
              </Link>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.22 }}
          className="rounded-xl border border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-100/75 via-emerald-50/40 to-white dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900 p-4 sm:p-5 space-y-4 shadow-2xs"
        >
          {constitutionLoading ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Skeleton width={40} height={40} borderRadius={8} />
                <div className="space-y-1.5 flex-1">
                  <Skeleton width="65%" height={16} />
                  <Skeleton width="90%" height={12} />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton width={98} height={34} borderRadius={8} />
                <Skeleton width={98} height={34} borderRadius={8} />
              </div>
            </div>
          ) : constitutionUrl ? (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <PdfHeadingTag className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      Official Cooperative Constitution PDF (Articles 1–25 · 2027–2036)
                    </PdfHeadingTag>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {constitutionName}
                      {constitution?.constitutionUploadedAt
                        ? ` · Updated ${formatShortDate(constitution.constitutionUploadedAt)}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPdfPreview((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-slate-900 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
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
                    href={constitutionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open PDF</span>
                  </a>
                  <a
                    href={constitutionUrl}
                    download={constitutionName}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium shadow-xs transition-all whitespace-nowrap"
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
                    className="overflow-hidden rounded-lg border border-emerald-200/80 dark:border-emerald-900/50 bg-white dark:bg-slate-950"
                  >
                    <iframe
                      src={constitutionUrl}
                      title="Savings, Investment and Interest-Free Loan Fund Cooperative Society Constitution PDF"
                      className="w-full h-[540px]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <PdfHeadingTag className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Official Cooperative Constitution PDF
                </PdfHeadingTag>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                  No constitution PDF published yet. Admins can upload it from Site Settings.
                </p>
              </div>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
          {CHARTER_SECTIONS.map((rule, idx) => {
            const isOpen = !embedded || Boolean(expandedCodes[rule.code]);
            const isEven = idx % 2 === 0;
            return (
              <motion.article
                key={rule.code}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className={`border rounded-xl p-4 space-y-2.5 transition-colors flex flex-col justify-between ${
                  isEven
                    ? 'bg-gradient-to-br from-emerald-100/70 via-emerald-50/35 to-white dark:from-emerald-950/45 dark:via-emerald-950/20 dark:to-slate-900 border-emerald-200/90 dark:border-emerald-800/60 hover:border-emerald-300 dark:hover:border-emerald-700'
                    : 'bg-gradient-to-br from-slate-100/90 via-slate-50/50 to-white dark:from-slate-800/65 dark:via-slate-900/90 dark:to-slate-950 border-slate-200/90 dark:border-slate-700/70 hover:border-emerald-300 dark:hover:border-emerald-700/70'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                          isEven
                            ? 'bg-emerald-100/80 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                            : 'bg-slate-200/75 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300/70 dark:border-slate-700'
                        }`}
                      >
                        {rule.code}
                      </span>
                      <ArticleHeadingTag className="text-sm font-semibold text-slate-900 dark:text-white">
                        {rule.title}
                      </ArticleHeadingTag>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    {rule.summary}
                  </p>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-1.5 pt-2 border-t border-emerald-200/60 dark:border-slate-800 overflow-hidden"
                      >
                        {rule.points.map((pt, ptIdx) => {
                          const pointEven = ptIdx % 2 === 0;
                          return (
                            <li
                              key={pt}
                              className={`flex items-start gap-2 text-xs leading-relaxed rounded-lg px-2.5 py-2 border ${
                                pointEven
                                  ? 'bg-emerald-50/70 dark:bg-emerald-950/35 border-emerald-200/60 dark:border-emerald-900/40 text-slate-800 dark:text-slate-200'
                                  : 'bg-white/85 dark:bg-slate-900/75 border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <CheckCircle2
                                className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                  pointEven
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                                aria-hidden="true"
                              />
                              <span className="text-justify">{pt}</span>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>

                {embedded && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleSectionCode(rule.code)}
                      aria-expanded={isOpen}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>
                        {isOpen ? 'Hide Articles' : `Read ${rule.points.length} Articles`}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>

        <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-gradient-to-r from-emerald-50/75 via-emerald-50/25 to-white dark:from-emerald-950/35 dark:via-emerald-950/15 dark:to-slate-900 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 dark:text-slate-400 text-justify">
            Ready to participate in Amanah&apos;s 20-share cooperative treasury cycle (2027–2036)?
          </p>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/login"
              className="px-3.5 py-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 whitespace-nowrap"
            >
              Member Sign In
            </Link>
            <Link
              href="/signup"
              className="group px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
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
