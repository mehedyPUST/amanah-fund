'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Languages,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type {
  CharterPdfExtractTranslateResult,
  CharterTargetLanguage,
  ConstitutionDocumentInfo,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatShortDate } from '../utils/format.ts';
import { MotionCard, type CardHue } from './MotionCard.tsx';

type CharterLanguage = 'en' | 'bn';

interface CharterSection {
  code: string;
  title: string;
  summary: string;
  points: string[];
}

const DEFAULT_CONSTITUTION_PDF_URL =
  '/assets/aistudio/cooperative-constitution-cooperative-charter-2027-2036-2026-11-16-30b5a0_98df82ac.pdf';
const DEFAULT_CONSTITUTION_PDF_NAME =
  'cooperative-constitution-cooperative-charter-2027-2036.pdf';

const CHARTER_SECTIONS_EN: CharterSection[] = [
  {
    code: 'Articles 01–03',
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
    code: 'Articles 04–06',
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
    code: 'Articles 07–10',
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
    code: 'Article 11',
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
    code: 'Article 12',
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
    code: 'Articles 13–17',
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
    code: 'Articles 18–20',
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
    code: 'Articles 21–25',
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

const CHARTER_SECTIONS_BN: CharterSection[] = [
  {
    code: 'ধারা ০১–০৩',
    title: 'সংগঠনের নাম, মূল লক্ষ্য ও উদ্দেশ্য',
    summary:
      'Savings, Investment and Interest-Free Loan Fund Cooperative Society হিসেবে ভবিষ্যৎ হালাল বিনিয়োগের জন্য যৌথ মূলধন গঠন এবং চলমান সঞ্চয় থেকে সদস্যদের প্রয়োজনে সুদমুক্ত কর্জে হাসানা প্রদান করে।',
    points: [
      '১. সংগঠনের নাম: Savings, Investment and Interest-Free Loan Fund Cooperative Society।',
      '২. মূল লক্ষ্য: ভবিষ্যতে বিনিয়োগের জন্য যৌথ মূলধন গঠন করা এবং চলমান জমাকৃত মূলধন নিজেদের প্রয়োজনে কর্জে হাসানা হিসেবে ব্যবহার করা।',
      '৩. উদ্দেশ্য: ক) নিজেদের মধ্যে একটি শক্তিশালী কমিউনিটি গড়ে তোলা; খ) দ্বীনের বিভিন্ন গুরুত্বপূর্ণ শাখায় খেদমত করা; গ) আমরা (মুসলমানরা) যাতে অর্থনৈতিকভাবে সমৃদ্ধশালী হতে পারি।',
    ],
  },
  {
    code: 'ধারা ০৪–০৬',
    title: 'সদস্যপদ লাভ, সদস্যের বৈশিষ্ট্য ও মেয়াদকাল (২০২৭–২০৩৬)',
    summary:
      'নির্ধারিত ফরম, জাতীয় পরিচয়পত্র ও ২০০ টাকা ম্যানেজমেন্ট ফিসহ সদস্যপদ গ্রহণ, দ্বীনি ও নৈতিক মানদণ্ড, সর্বোচ্চ ২০টি শেয়ার এবং জানুয়ারি ২০২৭ থেকে ডিসেম্বর ২০৩৬ মেয়াদ নির্ধারণ।',
    points: [
      '৪. সদস্যপদ লাভ: প্ল্যাটফর্মে নির্ধারিত ফরম (গুগল ফরম) পূরণ করে সদস্যপদ লাভ করতে হবে। ফরমের সাথে এক কপি ছবি, জাতীয় পরিচয়পত্রের এক কপি (সদস্য ও নমিনি) ও প্রতি সদস্য বাবদ ২০০/- টাকা (অ-ফেরতযোগ্য) প্রদান করতে হবে। উক্ত টাকা প্ল্যাটফর্মের ম্যানেজমেন্ট ফান্ডে জমা থাকবে, যা স্ট্যাপলার, ফটোকপি, রিং ফাইল, রেজিস্টার খাতা, স্ট্যাম্প ইত্যাদি ক্রয় বাবদ খরচ করা হবে ইনশাআল্লাহ।',
      '৫. সদস্যের বৈশিষ্ট্য: ক) অবশ্যই নামাজী হতে হবে; খ) হালাল-হারামের ব্যাপারে সতর্কতা অবলম্বনকারী হতে হবে; গ) দেশবরেণ্য ওলামায়ে কেরামকে মহব্বতকারী হতে হবে; ঘ) দ্বীন-ইসলামের বিজয় কামনাকারী হতে হবে।',
      '৬. মেয়াদকাল ও সদস্যসংখ্যা: ক) কার্যক্রম শুরু হবে জানুয়ারি ২০২৭ থেকে; খ) মোট সদস্যসংখ্যা হবে সর্বোচ্চ ২০ জন; গ) নতুন সদস্য গ্রহণের শেষ সময় হবে জুলাই ২০২৭, এরপর আর নতুন সদস্য নেওয়া হবে না; ঘ) জুলাই ২০২৭ এর মধ্যে নতুন সদস্য হতে চাইলে পূর্ববর্তী সকল মাসের বকেয়া চাঁদা একত্রে পরিশোধ করতে হবে; ঙ) জুলাই ২০২৭ এর মধ্যে সদস্য সংখ্যা ২০ জন হতে কম হলে একই ব্যক্তি সর্বাধিক ২টি শেয়ার নিতে পারবে এবং নতুন শেয়ারের জন্য পূর্ববর্তী সকল মাসের বকেয়া চাঁদা একত্রে পরিশোধ করতে হবে—সদস্য ও শেয়ার সংখ্যা কোনো অবস্থাতেই ২০ এর অধিক হবে না; চ) জানুয়ারি ২০২৭ হতে ডিসেম্বর ২০৩৬ এ প্রকল্প শেষ হবে এবং মেয়াদ শেষে সকল সদস্যের সর্বসম্মত আলোচনায় মেয়াদ পুনর্নির্ধারণ করা হবে।',
    ],
  },
  {
    code: 'ধারা ০৭–১০',
    title: '২/৩ বিনিয়োগ অনুমোদন, মূলধন হেফাজত, নথি ও মাসিক চাঁদা',
    summary:
      'যাবতীয় বিনিয়োগে কমপক্ষে দুই-তৃতীয়াংশ সদস্যের সম্মতি, চেকবই ও অ্যাকাউন্ট হোল্ডারের পৃথক দায়িত্ব, হার্ড ও সফট কপি সংরক্ষণ এবং বিলম্ব ফি সাদাকাহ হিসেবে বিতরণ।',
    points: [
      '৭. বিনিয়োগ অনুমোদন: প্ল্যাটফর্মের যাবতীয় অর্থ বিনিয়োগের ক্ষেত্রে কমপক্ষে ২/৩ (দুই-তৃতীয়াংশ) সদস্যের অনুমোদন থাকতে হবে।',
      '৮. মূলধন জমা ও উত্তোলন: একটি যৌথ অ্যাকাউন্টে প্রত্যেক সদস্য আপন শেয়ারের টাকা জমা দিবে। টাকার পরিমাণ অনেক বেশি হলে পরামর্শ সাপেক্ষে অন্য সদস্যের নামে আরেকটি যৌথ অ্যাকাউন্ট করা যেতে পারে। চেক বই অ্যাকাউন্ট হোল্ডার ব্যতীত অন্য শূরা/পরিচালনা কমিটির সদস্যের নিকট রাখা হবে এবং শূরা/বোর্ড মিটিংয়ের মাধ্যমে অ্যাকাউন্ট হোল্ডাররা ব্যাংক থেকে টাকা উত্তোলন করবে। প্রয়োজনে পরবর্তীতে প্রতিষ্ঠানের লাইসেন্স ও প্রতিষ্ঠানের নামে অ্যাকাউন্ট করা হলে যৌথ অ্যাকাউন্ট বাতিল করা হবে।',
      '৯. নথি সংগ্রহ: প্ল্যাটফর্মের যাবতীয় ডাটা যেমন সদস্য ফরম, জমা, আয় ও ব্যয় ইত্যাদি নির্ধারিত ফরম/রশিদের মাধ্যমে হার্ড ও সফট কপিতে সংরক্ষণ থাকবে।',
      '১০. মাসিক চাঁদা ও বিলম্ব ফি: ক) মাসিক সঞ্চয় ৫,০০০ টাকা প্রতি মাসের ১০ তারিখের মধ্যে পরিশোধ করতে হবে; জমা স্লিপের এক কপি দায়িত্বরত ব্যক্তির কাছে পাঠাতে হবে এবং মূল কপি সদস্যকে সংরক্ষণ করতে হবে; খ) নির্ধারিত সময়ে জমা দিতে ব্যর্থ হলে পরিচালনা কমিটির সদস্যকে অবহিত করতে হবে এবং বিলম্ব ফি হিসাবে ৫০ টাকা ধার্য হবে; গ) বিলম্ব ফি থেকে প্রাপ্ত অর্থ আলাদা হিসাবে রাখা হবে এবং বছর শেষে চূড়ান্ত হিসাব অনুযায়ী প্রতি বছর জানুয়ারি মাসে সাদাকাহ হিসেবে প্রদান করা হবে।',
    ],
  },
  {
    code: 'ধারা ১১',
    title: 'সদস্যপদ বাতিল, পুনর্বহাল ও সঞ্চয় ফেরত নীতিমালা',
    summary:
      'প্রথম বিনিয়োগের পূর্বে বহির্গমন রোধ, ৩ ও ৭ মাসের বকেয়া সংক্রান্ত বিধান, শৃঙ্খলাভঙ্গের ব্যবস্থা এবং প্রতি ৪ মাস পরপর শেয়ার মূল্যায়ন।',
    points: [
      'অব্যাহতি ও সঞ্চয় ফেরত (১১ক): প্ল্যাটফর্ম সূচনালগ্নে কমপক্ষে ১টি বিনিয়োগের পূর্বে কেউ বের হতে পারবে না। পরবর্তীতে যে কোনো সময় অব্যাহতি নিতে চাইলে প্রাপ্য অর্থ ফান্ডে জমা থাকা সাপেক্ষে ফেরত দিতে প্ল্যাটফর্ম বাধ্য থাকবে; অন্যথায় ফান্ডে জমা হওয়া পর্যন্ত অপেক্ষা করতে হবে।',
      '৩ মাস ও ৭ মাসের বকেয়া (১১খ–গ): কোনো সদস্যের ৩ মাসের টাকা বকেয়া থাকলে সদস্যপদ বাতিল হবে এবং পরবর্তী দুই মাসের ভেতর ২০০/- টাকা (অ-ফেরতযোগ্য) পরিশোধ করে Re-joining ফরম পূরণ করে পুনরায় সদস্যপদ গ্রহণ করতে হবে। ধারাবাহিক ৭ মাস টাকা জমা না দিলে সদস্যপদ স্থায়ীভাবে বাতিল বলে গণ্য হবে; তবে লিখিত দরখাস্ত ও শূরা/পরিচালনা কমিটির সম্মতি সাপেক্ষে সকল বকেয়া পরিশোধের মাধ্যমে পুনর্বহাল করা যাবে।',
      'শৃঙ্খলাভঙ্গ ও শেয়ার হস্তান্তর (১১ঘ–ঙ): বিশৃঙ্খলা বা শূরা/বোর্ড মিটিং সিদ্ধান্তের ওপর অনাস্থা প্রকাশ করে অরাজকতা সৃষ্টি করলে শূরা/বোর্ড মিটিংয়ের মাধ্যমে সদস্যপদ বাতিল করা হবে। প্রথম বিনিয়োগের পর কেউ চলে যেতে চাইলে পরিচিত যোগ্য ব্যক্তি বা বিদ্যমান সদস্যের নিকট (কম শেয়ারধারীকে অগ্রাধিকার দিয়ে) শেয়ার বিক্রির ব্যবস্থা করা হবে; সম্ভব না হলে বিনিয়োগ তহবিল থেকে ৪ মাস পরপর বোর্ড মিটিংয়ে নির্ধারিত মূল্যে টাকা ফেরত দেওয়া হবে। একবার বের হয়ে গেলে দ্বিতীয়বার যুক্ত হওয়ার সুযোগ থাকবে না।',
    ],
  },
  {
    code: 'ধারা ১২',
    title: 'সুদমুক্ত কর্জে হাসানা ঋণসুবিধা (সর্বোচ্চ ৫০,০০০ টাকা বা ৭৫%)',
    summary:
      'জানুয়ারি ২০২৭ হতে বিনাসুদে ১টি শেয়ারের বিপরীতে সর্বোচ্চ ৫০,০০০ টাকা অথবা সঞ্চয়ের সর্বোচ্চ ৭৫% পর্যন্ত কর্জে হাসানা এবং অনধিক ১০ মাসে পরিশোধের নিয়ম।',
    points: [
      '১২(ক) ঋণসীমা: জানুয়ারি ২০২৭ হতে বিনাসুদে ১টি শেয়ারের জন্য সর্বোচ্চ ৫০,০০০ টাকা অথবা সঞ্চয়ের সর্বোচ্চ ৭৫%—এর মধ্যে যেটি পরিমাণে কম সে পরিমাণ টাকা কর্জে হাসানা নিতে পারবে।',
      '১২(খ) পরিশোধের সময়সীমা: কর্জে হাসানা পরিশোধের সময় অনধিক ১০ মাস। ঋণের পরিমাণ ও ফেরত দেওয়ার সর্বোচ্চ মাস হিসাবে কিস্তি নির্ধারিত হবে।',
      '১২(গ–ঘ) কিস্তির বিলম্ব ফি ও মেয়াদান্তে সমন্বয়: কিস্তি পরিশোধে বিলম্ব হলে প্রতি মাসিক কিস্তির জন্য ৫০ টাকা বিলম্ব ফি আলাদা হিসাবে জমা হয়ে প্রতি বছর জানুয়ারি মাসে সাদাকাহ হিসেবে প্রদান করা হবে। প্রকল্পের মেয়াদ শেষ হওয়ার ১০ মাস পূর্ব থেকে বাকি সময়ের মধ্যে ঋণ আবেদন করলে কিস্তি অবশিষ্ট মাসের উপর নির্ধারিত হবে, যাতে সকল কর্জে হাসানা প্রকল্পের শেষ মাসের মধ্যেই পুনরায় ফান্ডে জমা হয়।',
    ],
  },
  {
    code: 'ধারা ১৩–১৭',
    title: 'শরঈ ফায়সালা, নিরপেক্ষতা, স্বচ্ছতা ও গঠনতন্ত্র সংশোধনী',
    summary:
      'ক্ষয়ক্ষতিতে শরঈ সিদ্ধান্ত, মূলধন ও লভ্যাংশের নিরাপত্তা, স্ট্যাম্পসহ স্বচ্ছ বিনিয়োগ এবং ২/৩ শূরা ও ১/২ উপস্থিত সদস্যের সম্মতিতে গঠনতন্ত্র সংশোধন।',
    points: [
      '১৩ ও ১৪. ফান্ডের নিরাপত্তা ও নিরপেক্ষ কার্যক্রম: ফান্ডের টাকা কারো মাধ্যমে ক্ষতিসাধিত হলে শরঈ সিদ্ধান্তই চূড়ান্ত হবে। প্ল্যাটফর্ম সর্বাবস্থায় ব্যক্তিগত ও প্রাতিষ্ঠানিক প্রভাবমুক্ত থাকবে; কোনো সদস্যের মূলধন ও লভ্যাংশ কখনোই বাজেয়াপ্ত বা ক্রোক করা যাবে না, তবে আর্থিক পাওনা থাকলে বোর্ড মিটিংয়ের নোটিশ প্রদান করে তা কেটে রাখা হবে।',
      '১৫ ও ১৬. স্বচ্ছতা ও নতুন সমস্যা সমাধান: অর্থ বিনিয়োগে সর্বোচ্চ সতর্কতা ও প্রয়োজনে স্ট্যাম্প ব্যবহারসহ যাবতীয় করণীয় অনুসরণ করতে হবে। গঠনতন্ত্রে উল্লেখ নেই এমন সমস্যা শূরা/পরিচালনা কমিটি পরামর্শক্রমে বা সদস্যদের নিয়ে পরামর্শ সভার মাধ্যমে সমাধান করবে।',
      '১৭. গঠনতন্ত্র সংশোধনী: গঠনতন্ত্রের কোনো ধারা সংশোধন, সংযোজন-বিয়োজন বা বাতিলের প্রয়োজন হলে শূরা/পরিচালনা কমিটি সদস্যদের নিয়ে মিটিংয়ের মাধ্যমে সমাধান করবে; এক্ষেত্রে কমপক্ষে শূরা/পরিচালনা কমিটির ২/৩ অংশ ও অন্যান্য উপস্থিত সদস্যদের ১/২ অংশের মতামতের উপর সবাইকে আস্থা রাখতে হবে।',
    ],
  },
  {
    code: 'ধারা ১৮–২০',
    title: '৫ সদস্যের শূরা ও সঞ্চয়ী হিসাব কমিটি এবং সদস্যদের দায়িত্ব',
    summary:
      'সক্রিয় ৫ সদস্যের পরিচালনা/শূরা কমিটি, ৫ সদস্যের সঞ্চয়ী হিসাব কমিটি, প্রতি মাসের ১৫ তারিখে হিসাব ও কর্জে হাসানা তালিকা প্রকাশ এবং স্থানীয় প্রকল্পে সদস্যদের সহযোগিতা।',
    points: [
      '১৮. পরিচালনা/শূরা কমিটি (৫ জন): সবচেয়ে সক্রিয়, ব্যবস্থাপনা, জমি/ফ্ল্যাট ক্রয়-বিক্রয় ও অলাভজনক প্রতিষ্ঠানের কাজে সময় দিতে আগ্রহী সর্বোচ্চ ৫ জন সদস্য নিয়ে শূরা কমিটি গঠিত হবে। তারা ঋণ আবেদন গ্রহণ ও অনুমোদন করবেন, প্রতি মাসের ১৫ তারিখের মধ্যে চলতি কর্জে হাসানা ও অপেক্ষমান তালিকা প্রকাশ করবেন, বিবাদ মীমাংসা করবেন এবং প্রতি ডিসেম্বর মিটিংয়ে প্রয়োজনে কমিটি পুনর্বিন্যাস করা হবে।',
      '১৯. সঞ্চয়ী হিসাব কমিটি (৫ জন): যৌথ অ্যাকাউন্ট খোলা যায় এমন সর্বোচ্চ সংখ্যক সদস্য এই কমিটিতে থাকবেন। তারা প্রতিটি সদস্যের হিসাব আলাদাভাবে এক্সেল ফাইলে রাখবেন, কর্জে হাসানা ও বিলম্ব ফি আলাদাভাবে নথিভুক্ত করবেন এবং প্রতি মাসের ১৫ তারিখের মধ্যে ব্যাংক স্টেটমেন্ট ও হিসাবের তালিকা সদস্য গ্রুপে শেয়ার করবেন।',
      '২০. সদস্যদের দায়িত্ব: সদস্যদের বর্তমান বা স্থায়ী ঠিকানার এলাকায় কোনো বিনিয়োগ, ধর্মীয় বা সামাজিক প্রকল্প বাস্তবায়ন চলাকালে উপস্থিত থেকে সর্বোচ্চ সহযোগিতা করা এবং প্রয়োজনে অন্তত ফোনের মাধ্যমে খোঁজখবর রাখা—যা পরকালের পাথেয় হবে ইনশাআল্লাহ।',
    ],
  },
  {
    code: 'ধারা ২১–২৫',
    title: 'VISION-36, আল মদিনা সিটি, প্রোপার্টি হেফাজত ও জরুরি বিধান',
    summary:
      '১০ বছরে প্রতি শেয়ারের বিপরীতে ১টি জমির শেয়ার, ৩ জেলায় ইসলামিক স্কুল, "আল মদিনা সিটি" আবাসন, মক্তব প্রতিষ্ঠা এবং জরুরি অবস্থায় ৩–৪ মাসে মূলধন ফেরত।',
    points: [
      '২১. VISION-36: ১০ বছর (১ দশক) পর ইনশাআল্লাহ প্রত্যেকেই ১টি শেয়ারের বিপরীতে ১টি করে জমির শেয়ারের মালিক হবো। সময়ের আগে লক্ষ্য পূরণ হলে সম্পদ বণ্টন করে নতুন ভিশন শুরু হবে, আর পূরণ না হলে শূরা/বোর্ড মিটিংয়ে সময় বর্ধিত করা হবে। কেউ প্রয়োজনবোধে অর্জিত শেয়ার বিক্রি করতে চাইলে সদস্যদের বৈশিষ্ট্যের অনুরূপ ব্যক্তির নিকট বিক্রির সর্বোচ্চ চেষ্টা করতে হবে। এছাড়া কমপক্ষে ৩টি জেলায় ইসলামিক স্কুল প্রতিষ্ঠা করা হবে।',
      '২২ ও ২৩. ভবিষ্যৎ পরিকল্পনা ও বহুমুখী বিনিয়োগ: দেশের প্রত্যেকটি সিটি কর্পোরেশনে কমপক্ষে ১টি করে আবাসিক হাউজিং সোসাইটি "আল মদিনা সিটি" গড়ে তোলা—যেখানে মসজিদ ও হেফজখানা কমপ্লেক্স, ইসলামিক স্কুল, কওমি মাদ্রাসা (মাদানী নেসাব + জেনারেল), ১০০% নামাজী ও পর্দানশীন পরিবেশ, খেলার মাঠ, পার্ক ও সাঁতার শেখার পুকুর থাকবে; পাশাপাশি উত্তরবঙ্গ ও পার্বত্য জেলাসমূহে একটি করে মক্তব প্রতিষ্ঠা করা হবে।',
      '২৪ ও ২৫. প্রোপার্টি ক্রয় প্রক্রিয়া ও অ-স্বাভাবিক পরিস্থিতি: ২০ জন সদস্যের কষ্টার্জিত হালাল টাকায় অর্জিত প্রতিটি প্রোপার্টির যত্ন নেওয়া ও হেফাজত করা প্রত্যেক সদস্যের দায়িত্ব ও কর্তব্য। আল্লাহ এই দ্বীনি প্ল্যাটফর্মকে হেফাজত করুন (আমীন)। কোনো কারণে বলিষ্ঠ নেতৃত্বের অভাবে অ-স্বাভাবিক পরিস্থিতির সৃষ্টি হলে শূরা/বোর্ড কমিটি ৩–৪ মাসের ভেতর যাবতীয় কার্যক্রম সমাপ্ত করে প্রত্যেক শেয়ারহোল্ডারকে তাদের টাকা ফেরত প্রদান করবে।',
    ],
  },
];

export function Rules({ embedded = false }: { embedded?: boolean }) {
  const HeadingTag = embedded ? 'h2' : 'h1';
  const PdfHeadingTag = embedded ? 'h3' : 'h2';
  const ArticleHeadingTag = embedded ? 'h3' : 'h2';
  const [lang, setLang] = useState<CharterLanguage>('en');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [constitution, setConstitution] = useState<ConstitutionDocumentInfo | null>(null);
  const [constitutionLoading, setConstitutionLoading] = useState(true);
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({});
  const [showPdfExtractor, setShowPdfExtractor] = useState(false);
  const [extractTargetLang, setExtractTargetLang] = useState<CharterTargetLanguage>('en');
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<CharterPdfExtractTranslateResult | null>(null);
  const [extractTab, setExtractTab] = useState<'translated' | 'raw'>('translated');
  const [copiedExtract, setCopiedExtract] = useState(false);

  // Language toggle is strictly for the standalone Charter page (/rules)
  const activeLang: CharterLanguage = embedded ? 'en' : lang;
  const isBn = activeLang === 'bn';
  const sections = isBn ? CHARTER_SECTIONS_BN : CHARTER_SECTIONS_EN;

  async function handleExtractAndTranslate(targetLanguage = extractTargetLang) {
    setExtractLoading(true);
    setExtractError(null);
    try {
      const res = await api.extractAndTranslateCharterPdf({
        targetLanguage,
        translate: true,
      });
      setExtractResult(res.result);
      setExtractTab(res.result.translatedText ? 'translated' : 'raw');
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Unable to extract and translate Constitution PDF.'
      );
    } finally {
      setExtractLoading(false);
    }
  }

  const allExpanded =
    !embedded || sections.every((section) => Boolean(expandedCodes[section.code]));

  function toggleSectionCode(code: string) {
    setExpandedCodes((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function toggleExpandAll() {
    if (allExpanded) {
      setExpandedCodes({});
    } else {
      const next: Record<string, boolean> = {};
      sections.forEach((s) => {
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

  const constitutionUrl = constitution?.constitutionPdfUrl || DEFAULT_CONSTITUTION_PDF_URL;
  const constitutionName =
    constitution?.constitutionPdfUrl
      ? constitution.constitutionPdfName || DEFAULT_CONSTITUTION_PDF_NAME
      : DEFAULT_CONSTITUTION_PDF_NAME;

  return (
    <div
      className={`bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs text-slate-900 dark:text-slate-100 w-full ${
        embedded ? 'p-6 sm:p-7' : 'p-6 sm:p-9'
      }`}
    >
      <section className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800"
        >
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Official Constitution &amp; Bylaws · Jan 2027 – Dec 2036
            </div>
            <HeadingTag
              className={
                embedded
                  ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                  : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
              }
            >
              Savings, Investment &amp; Interest-Free Loan Fund Charter
            </HeadingTag>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              Articles 1–25 governing cooperative operations, Qard Hasan lending, and 2/3 member voting.
            </p>
          </div>

          {!embedded ? (
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Languages className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="hidden md:inline">Language</span>
              </span>
              <div
                role="tablist"
                aria-label="Charter language"
                className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/85 dark:bg-slate-950/70"
              >
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'bn', label: 'বাংলা' },
                  ] as const
                ).map((option) => {
                  const selected = lang === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setLang(option.id)}
                      className={`relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                        selected
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {selected && (
                        <motion.span
                          layoutId="charter-language-toggle"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/70 dark:border-slate-700/70"
                          aria-hidden="true"
                        />
                      )}
                      <span lang={option.id} className="relative z-10">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleExpandAll}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                {allExpanded ? 'Collapse Clauses' : 'Expand All Articles'}
              </button>
              <Link
                href="/rules"
                className="px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors whitespace-nowrap"
              >
                Full Page
              </Link>
            </div>
          )}
        </motion.div>

        {/* Official Constitution PDF Banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.2 }}
          className="amanah-card-emerald rounded-xl border p-5 space-y-4"
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
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <PdfHeadingTag className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      Official Cooperative Constitution PDF (Articles 1–25 · 2027–2036)
                    </PdfHeadingTag>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
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
                    onClick={() => {
                      const next = !showPdfExtractor;
                      setShowPdfExtractor(next);
                      if (next && !extractResult && !extractLoading) {
                        void handleExtractAndTranslate(extractTargetLang);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      showPdfExtractor
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                        : 'border-indigo-200 dark:border-indigo-800/70 bg-white dark:bg-slate-900 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{showPdfExtractor ? 'Hide AI Reader' : 'Extract & Translate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPdfPreview((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open PDF</span>
                  </a>
                  <a
                    href={constitutionUrl}
                    download={constitutionName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download PDF</span>
                  </a>
                </div>
              </div>

              <AnimatePresence>
                {showPdfExtractor && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white/95 dark:bg-slate-950/90 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-200/75 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Charter PDF Text Extraction &amp; Translation</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Extracts live text directly from the published Constitution PDF and translates or reconstructs clauses cleanly via Groq AI.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={extractTargetLang}
                          onChange={(e) => {
                            const nextLang = e.target.value as CharterTargetLanguage;
                            setExtractTargetLang(nextLang);
                            void handleExtractAndTranslate(nextLang);
                          }}
                          aria-label="Target translation language"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200"
                        >
                          <option value="en">Translate to English</option>
                          <option value="bn">Translate to বাংলা (Bengali)</option>
                          <option value="ar">Translate to العربية (Arabic)</option>
                        </select>
                        <button
                          type="button"
                          disabled={extractLoading}
                          onClick={() => void handleExtractAndTranslate(extractTargetLang)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                        >
                          <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{extractLoading ? 'Extracting…' : 'Extract & Translate'}</span>
                        </button>
                      </div>
                    </div>

                    {extractError && (
                      <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
                        {extractError}
                      </div>
                    )}

                    {extractLoading && !extractResult && (
                      <div className="space-y-2 py-2">
                        <Skeleton height={16} width="55%" />
                        <Skeleton height={84} />
                      </div>
                    )}

                    {extractResult && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">
                            {extractResult.sourceName} · {extractResult.totalPages} page(s)
                            {extractResult.model ? ` · ${extractResult.model}` : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {extractResult.translatedText && (
                              <button
                                type="button"
                                onClick={() => setExtractTab('translated')}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                                  extractTab === 'translated'
                                    ? 'bg-indigo-600 text-white'
                                    : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                Translated ({extractResult.targetLanguage.toUpperCase()})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExtractTab('raw')}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                                extractTab === 'raw' || !extractResult.translatedText
                                  ? 'bg-slate-900 dark:bg-slate-700 text-white'
                                  : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Raw PDF Text
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const textToCopy =
                                  extractTab === 'translated' && extractResult.translatedText
                                    ? extractResult.translatedText
                                    : extractResult.extractedText;
                                void navigator.clipboard?.writeText(textToCopy);
                                setCopiedExtract(true);
                                setTimeout(() => setCopiedExtract(false), 1800);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              {copiedExtract ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedExtract ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>

                        {extractResult.summaryBullets.length > 0 && (
                          <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-1">
                            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                              Key Charter Highlights
                            </div>
                            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                              {extractResult.summaryBullets.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {extractResult.truncationNotice && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-300">
                            {extractResult.truncationNotice}
                          </p>
                        )}

                        <div
                          lang={
                            extractTab === 'translated' && extractResult.translatedText
                              ? extractResult.targetLanguage
                              : undefined
                          }
                          dir={
                            extractTab === 'translated' &&
                            extractResult.translatedText &&
                            extractResult.targetLanguage === 'ar'
                              ? 'rtl'
                              : undefined
                          }
                          className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed"
                        >
                          {extractTab === 'translated' && extractResult.translatedText
                            ? extractResult.translatedText
                            : extractResult.extractedText}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

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
                      src={constitutionUrl}
                      title="Savings, Investment and Interest-Free Loan Fund Cooperative Society Constitution PDF"
                      className="w-full h-[540px]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>

        <div lang={isBn ? 'bn' : 'en'} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sections.map((rule, idx) => {
            const isOpen = !embedded || Boolean(expandedCodes[rule.code]);
            const ruleHue: CardHue = (['emerald', 'violet', 'teal', 'amber'] as const)[idx % 4];
            return (
              <MotionCard
                as="article"
                key={`${activeLang}-${rule.code}`}
                hue={ruleHue}
                delay={idx * 0.03}
                inView
                className="backdrop-blur-md border rounded-xl p-5 space-y-3 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {rule.code}
                    </span>
                    <ArticleHeadingTag className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      {rule.title}
                    </ArticleHeadingTag>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify">
                    {rule.summary}
                  </p>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="divide-y divide-slate-200/75 dark:divide-slate-800 pt-2 border-t border-slate-200/75 dark:border-slate-800 overflow-hidden"
                      >
                        {rule.points.map((pt) => (
                          <li
                            key={pt}
                            className="flex items-start gap-2.5 text-xs leading-relaxed py-2.5 first:pt-1.5 last:pb-0 text-slate-700 dark:text-slate-300"
                          >
                            <CheckCircle2
                              className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="text-justify">{pt}</span>
                          </li>
                        ))}
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
              </MotionCard>
            );
          })}
        </div>

        <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Ready to participate in Amanah&apos;s 20-share cooperative treasury cycle (2027–2036)?
          </p>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Member Sign In
            </Link>
            <Link
              href="/signup"
              className="group px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              <span>Apply for Membership</span>
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
