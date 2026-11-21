import type { FaqCategory, FaqItem } from '../types/coop.ts';

export type FaqFilterCategory = 'all' | FaqCategory;
export type FaqCardHue = 'emerald' | 'violet' | 'teal' | 'amber';

export const FAQ_CATEGORIES: Array<{ key: FaqFilterCategory; label: string }> = [
  { key: 'all', label: 'All Questions' },
  { key: 'membership', label: 'Membership' },
  { key: 'fund', label: 'Fund & Savings' },
  { key: 'loans', label: 'Qard Hasan' },
  { key: 'governance', label: 'Governance & Halal' },
];

export const FAQ_CATEGORY_META: Record<
  FaqCategory,
  { label: string; hue: FaqCardHue }
> = {
  membership: { label: 'Membership', hue: 'emerald' },
  fund: { label: 'Fund & Savings', hue: 'teal' },
  loans: { label: 'Qard Hasan', hue: 'emerald' },
  governance: { label: 'Governance & Halal', hue: 'teal' },
};

export const FAQ_CARD_HUE_CYCLE: FaqCardHue[] = ['emerald', 'teal'];

const DEFAULT_FAQ_SEED: Array<{
  id: string;
  category: FaqCategory;
  articleRef: string;
  question: string;
  answer: string;
  sortOrder: number;
}> = [
  {
    id: 'faq-kyc-application',
    category: 'membership',
    articleRef: 'Articles 04–06',
    sortOrder: 1,
    question: 'How do I apply for membership and what documents are required?',
    answer:
      'Prospective members apply through the Join Amanah portal by submitting verified KYC details, a portrait photo, National ID documents for both the applicant and nominee(s) totaling 100% share allocation, an existing member reference, and a non-refundable BDT 200 administrative fee. Applications are reviewed by the Administrator and Shura before portal activation.',
  },
  {
    id: 'faq-member-cap',
    category: 'membership',
    articleRef: 'Article 06',
    sortOrder: 2,
    question: 'Why is the cooperative capped at 20 shares and when does enrollment close?',
    answer:
      'Amanah operates on a focused 20-share cap for the 10-year 2027–2036 charter term to preserve high trust and direct accountability. New member admissions close in July 2027, and anyone joining before that cutoff must settle prior months’ savings in full. If fewer than 20 members join by July 2027, existing members may hold up to 2 shares by settling prior arrears, never exceeding 20 total shares.',
  },
  {
    id: 'faq-monthly-contribution',
    category: 'fund',
    articleRef: 'Article 10',
    sortOrder: 3,
    question: 'What is the monthly contribution amount and how are deposits verified?',
    answer:
      'Each share contributes BDT 5,000 monthly, due by the 10th of every month via approved Bank or Mobile Financial Service (MFS) channels. After transferring funds, members log the encrypted transaction reference or upload the deposit slip in the Monthly Contribution tab so elected Shura Managers can verify and credit the central treasury.',
  },
  {
    id: 'faq-late-fees',
    category: 'fund',
    articleRef: 'Articles 10c & 12c',
    sortOrder: 4,
    question: 'How are BDT 50 late fees handled to remain strictly Shariah-compliant?',
    answer:
      'Late monthly savings or overdue loan installments incur a fixed BDT 50 administrative penalty, which is never added to member equity, profits, or loan principal. All late fees are isolated in a dedicated Sadaqah (charity) ledger and distributed transparently to charitable causes every January after annual account closing.',
  },
  {
    id: 'faq-arrears-policy',
    category: 'fund',
    articleRef: 'Article 11b–c',
    sortOrder: 5,
    question: 'What happens if a member misses multiple monthly contributions?',
    answer:
      'Three missed monthly contributions result in temporary suspension, which can be redeemed within two months by settling unpaid dues with a BDT 200 reinstatement fee. Seven consecutive unpaid months trigger permanent membership cancellation unless the member submits a formal written pledge, settles all arrears in full, and receives Shura approval.',
  },
  {
    id: 'faq-qard-hasan-limits',
    category: 'loans',
    articleRef: 'Article 12',
    sortOrder: 6,
    question: 'How much Qard Hasan financing can I borrow and what is the profit or interest rate?',
    answer:
      'Every Qard Hasan loan carries strictly 0% interest and zero compounding fees. Eligible active members may borrow up to BDT 50,000 per share or 75% of their accumulated verified savings—whichever is lower—repayable over up to 10 proportional monthly installments (scaled within the final 10 months of the 2036 project term).',
  },
  {
    id: 'faq-loan-voting',
    category: 'loans',
    articleRef: 'Articles 07 & 18',
    sortOrder: 7,
    question: 'How are Qard Hasan loan requests approved and disbursed?',
    answer:
      'Once an eligible member submits a request (and any required guarantor confirms), Shura Managers inspect treasury liquidity and open an anonymized 2/3 supermajority Opinion Ballot for active members. When the ballot reaches 2/3 approval and closes, Shura/Savings disburse the principal and log encrypted payout proof.',
  },
  {
    id: 'faq-security-custody',
    category: 'governance',
    articleRef: 'Articles 08 & 18–19',
    sortOrder: 8,
    question: 'How are cooperative funds safeguarded and audited each month?',
    answer:
      'Funds are held in joint accounts where bank signatories and checkbook custody are separated across a 5-member Shura Committee and a 5-member Savings Accounts Committee. Monthly bank statements and loan ledgers are published by the 15th of each month, sensitive KYC/TXN data is AES-256-GCM encrypted, and all system actions are sealed in a SHA-256 hash-chained audit log.',
  },
  {
    id: 'faq-halal-ventures',
    category: 'governance',
    articleRef: 'Articles 07 & 21–25',
    sortOrder: 9,
    question: 'How do post-maturity Halal investments work under VISION-36?',
    answer:
      'In addition to providing 0% mutual relief today, the central fund pools long-term capital toward productive real-economy Mudarabah, Musharakah, and Murabahah ventures (such as verified land shares and ethical residential/educational initiatives). Every venture requires at least a 2/3 majority member vote before any capital is deployed.',
  },
  {
    id: 'faq-exit-transfer',
    category: 'membership',
    articleRef: 'Article 11a, d–e',
    sortOrder: 10,
    question: 'Can a member withdraw early or transfer their cooperative share?',
    answer:
      'Members commit until at least the cooperative’s first collective investment is completed. Afterward, a departing member may transfer their share to an approved acquaintance or an existing member (prioritizing single-share holders), or receive payout from the fund at the 4-monthly Board share valuation. Once exited, a member may not rejoin a second time.',
  },
];

export function createDefaultFaqs(nowIso = '2026-01-01T00:00:00.000Z'): FaqItem[] {
  return DEFAULT_FAQ_SEED.map((item) => ({
    ...item,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: 'System',
  }));
}

export function sortFaqItems(items: FaqItem[]): FaqItem[] {
  return [...items].sort((a, b) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}
