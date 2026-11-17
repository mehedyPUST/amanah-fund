'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  HelpCircle,
  Search,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

type FaqCategory = 'all' | 'membership' | 'fund' | 'loans' | 'governance';

interface FaqItem {
  id: string;
  number: string;
  category: Exclude<FaqCategory, 'all'>;
  categoryLabel: string;
  articleRef: string;
  question: string;
  answer: string;
  hue: CardHue;
}

const FAQ_CATEGORIES: Array<{ key: FaqCategory; label: string }> = [
  { key: 'all', label: 'All Questions' },
  { key: 'membership', label: 'Membership' },
  { key: 'fund', label: 'Fund & Savings' },
  { key: 'loans', label: 'Qard Hasan' },
  { key: 'governance', label: 'Governance & Halal' },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-kyc-application',
    number: '01.',
    category: 'membership',
    categoryLabel: 'Membership',
    articleRef: 'Articles 04–06',
    hue: 'emerald',
    question: 'How do I apply for membership and what documents are required?',
    answer:
      'Prospective members apply through the Join Amanah portal by submitting verified KYC details, a portrait photo, National ID documents for both the applicant and nominee(s) totaling 100% share allocation, an existing member reference, and a non-refundable BDT 200 administrative fee. Applications are reviewed by the Administrator and Shura before portal activation.',
  },
  {
    id: 'faq-member-cap',
    number: '02.',
    category: 'membership',
    categoryLabel: 'Membership',
    articleRef: 'Article 06',
    hue: 'violet',
    question: 'Why is the cooperative capped at 20 shares and when does enrollment close?',
    answer:
      'Amanah operates on a focused 20-share cap for the 10-year 2027–2036 charter term to preserve high trust and direct accountability. New member admissions close in July 2027, and anyone joining before that cutoff must settle prior months’ savings in full. If fewer than 20 members join by July 2027, existing members may hold up to 2 shares by settling prior arrears, never exceeding 20 total shares.',
  },
  {
    id: 'faq-monthly-contribution',
    number: '03.',
    category: 'fund',
    categoryLabel: 'Fund & Savings',
    articleRef: 'Article 10',
    hue: 'teal',
    question: 'What is the monthly contribution amount and how are deposits verified?',
    answer:
      'Each share contributes BDT 5,000 monthly, due by the 10th of every month via approved Bank or Mobile Financial Service (MFS) channels. After transferring funds, members log the encrypted transaction reference or upload the deposit slip in the Monthly Contribution tab so elected Shura Managers can verify and credit the central treasury.',
  },
  {
    id: 'faq-late-fees',
    number: '04.',
    category: 'fund',
    categoryLabel: 'Fund & Savings',
    articleRef: 'Articles 10c & 12c',
    hue: 'amber',
    question: 'How are BDT 50 late fees handled to remain strictly Shariah-compliant?',
    answer:
      'Late monthly savings or overdue loan installments incur a fixed BDT 50 administrative penalty, which is never added to member equity, profits, or loan principal. All late fees are isolated in a dedicated Sadaqah (charity) ledger and distributed transparently to charitable causes every January after annual account closing.',
  },
  {
    id: 'faq-arrears-policy',
    number: '05.',
    category: 'fund',
    categoryLabel: 'Fund & Savings',
    articleRef: 'Article 11b–c',
    hue: 'emerald',
    question: 'What happens if a member misses multiple monthly contributions?',
    answer:
      'Three missed monthly contributions result in temporary suspension, which can be redeemed within two months by settling unpaid dues with a BDT 200 reinstatement fee. Seven consecutive unpaid months trigger permanent membership cancellation unless the member submits a formal written pledge, settles all arrears in full, and receives Shura approval.',
  },
  {
    id: 'faq-qard-hasan-limits',
    number: '06.',
    category: 'loans',
    categoryLabel: 'Qard Hasan',
    articleRef: 'Article 12',
    hue: 'violet',
    question: 'How much Qard Hasan financing can I borrow and what is the profit or interest rate?',
    answer:
      'Every Qard Hasan loan carries strictly 0% interest and zero compounding fees. Eligible active members may borrow up to BDT 50,000 per share or 75% of their accumulated verified savings—whichever is lower—repayable over up to 10 proportional monthly installments (scaled within the final 10 months of the 2036 project term).',
  },
  {
    id: 'faq-loan-voting',
    number: '07.',
    category: 'loans',
    categoryLabel: 'Qard Hasan',
    articleRef: 'Articles 07 & 18',
    hue: 'teal',
    question: 'How are Qard Hasan loan requests approved and disbursed?',
    answer:
      'Once an eligible member submits a request (and any required guarantor confirms), Shura Managers inspect treasury liquidity and open an anonymized 2/3 supermajority Opinion Ballot for active members. When the ballot reaches 2/3 approval and closes, Shura/Savings disburse the principal and log encrypted payout proof.',
  },
  {
    id: 'faq-security-custody',
    number: '08.',
    category: 'governance',
    categoryLabel: 'Governance & Halal',
    articleRef: 'Articles 08 & 18–19',
    hue: 'amber',
    question: 'How are cooperative funds safeguarded and audited each month?',
    answer:
      'Funds are held in joint accounts where bank signatories and checkbook custody are separated across a 5-member Shura Committee and a 5-member Savings Accounts Committee. Monthly bank statements and loan ledgers are published by the 15th of each month, sensitive KYC/TXN data is AES-256-GCM encrypted, and all system actions are sealed in a SHA-256 hash-chained audit log.',
  },
  {
    id: 'faq-halal-ventures',
    number: '09.',
    category: 'governance',
    categoryLabel: 'Governance & Halal',
    articleRef: 'Articles 07 & 21–25',
    hue: 'emerald',
    question: 'How do post-maturity Halal investments work under VISION-36?',
    answer:
      'In addition to providing 0% mutual relief today, the central fund pools long-term capital toward productive real-economy Mudarabah, Musharakah, and Murabahah ventures (such as verified land shares and ethical residential/educational initiatives). Every venture requires at least a 2/3 majority member vote before any capital is deployed.',
  },
  {
    id: 'faq-exit-transfer',
    number: '10.',
    category: 'membership',
    categoryLabel: 'Membership',
    articleRef: 'Article 11a, d–e',
    hue: 'violet',
    question: 'Can a member withdraw early or transfer their cooperative share?',
    answer:
      'Members commit until at least the cooperative’s first collective investment is completed. Afterward, a departing member may transfer their share to an approved acquaintance or an existing member (prioritizing single-share holders), or receive payout from the fund at the 4-monthly Board share valuation. Once exited, a member may not rejoin a second time.',
  },
];

export function FAQSection({ embedded = true }: { embedded?: boolean }) {
  const { user } = useCoopSession();
  const [activeCategory, setActiveCategory] = useState<FaqCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    'faq-kyc-application': true,
    'faq-monthly-contribution': true,
  });

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.articleRef.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  const allVisibleExpanded =
    filteredItems.length > 0 && filteredItems.every((item) => Boolean(openIds[item.id]));

  function toggleItem(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleExpandAll() {
    if (allVisibleExpanded) {
      setOpenIds((prev) => {
        const next = { ...prev };
        for (const item of filteredItems) next[item.id] = false;
        return next;
      });
    } else {
      setOpenIds((prev) => {
        const next = { ...prev };
        for (const item of filteredItems) next[item.id] = true;
        return next;
      });
    }
  }

  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <section
      id="faq"
      aria-labelledby="faq-section-heading"
      className={`scroll-mt-4 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs text-slate-900 dark:text-slate-100 w-full space-y-6 ${
        embedded ? 'p-6 sm:p-8' : 'p-6 sm:p-9'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800">
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Frequently Asked Questions · Fund &amp; Membership</span>
          </div>
          <HeadingTag
            id="faq-section-heading"
            className={
              embedded
                ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
            }
          >
            Common questions about savings custody, Qard Hasan &amp; membership
          </HeadingTag>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Clear, charter-backed answers covering KYC onboarding, monthly deposits, 0% interest loan limits, and 2/3 member governance.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleExpandAll}
            disabled={filteredItems.length === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {allVisibleExpanded ? 'Collapse All' : 'Expand All Answers'}
          </button>
        </div>
      </div>

      {/* Category Filter Tabs & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter FAQ by topic"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 self-start"
        >
          {FAQ_CATEGORIES.map((cat) => {
            const selected = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveCategory(cat.key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                  selected
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="faq-category-tab"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/70 dark:border-slate-700/70"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fund or membership questions..."
            aria-label="Search frequently asked questions"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Accordion Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="amanah-card-violet border rounded-xl p-8 text-center space-y-2.5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No FAQ entries match your filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveCategory('all');
              setSearchQuery('');
            }}
            className="px-3.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-900 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
          {filteredItems.map((item, idx) => {
            const isOpen = Boolean(openIds[item.id]);
            const panelId = `${item.id}-panel`;
            return (
              <MotionCard
                as="article"
                key={item.id}
                hue={item.hue}
                delay={Math.min(idx * 0.025, 0.16)}
                inView
                className="backdrop-blur-md border rounded-xl shadow-xs hover:shadow-md transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full text-left p-5 flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {item.number}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.categoryLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{item.articleRef}</span>
                    </div>
                    <h3 className="text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">
                      {item.question}
                    </h3>
                  </div>

                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isOpen
                        ? 'border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-100/75 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400'
                    }`}
                    aria-hidden="true"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-3 border-t border-slate-200/70 dark:border-slate-800/80">
                        <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                          {item.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </MotionCard>
            );
          })}
        </div>
      )}

      {/* Footer CTA Row */}
      <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Need the full constitutional text covering Articles 1–25? Review the official signed charter anytime.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/rules"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Read Full Charter
          </Link>
          <Link
            href={user ? '/dashboard' : '/signup'}
            className="group px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <span>{user ? 'Open Dashboard' : 'Apply for Membership'}</span>
            <ArrowRight
              className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
