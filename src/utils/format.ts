import type { FundConfig } from '../types/coop.ts';

const CURRENCY_SYMBOLS: Record<FundConfig['currency'], string> = {
  BDT: '৳',
  USD: '$',
  MYR: 'RM ',
  GBP: '£',
};

export function formatMoney(amount: number, currency: FundConfig['currency'] = 'BDT'): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '৳';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${symbol}${formatted}`;
}

export function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBillingMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function shortHash(hash?: string): string {
  if (!hash) return '—';
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export const MFS_PROVIDERS = [
  'bKash',
  'Nagad',
  'Rocket (DBBL)',
  'Upay',
  'CellFin (Islami Bank)',
  'Tap (Trust Axiata)',
  'OK Wallet (One Bank)',
  'mCash (Islami Bank)',
  'MyCash (Mercantile Bank)',
  'SureCash',
  'TeleCash (Southeast Bank)',
  'FirstPay (FSIB)',
] as const;

export const BANK_PROVIDERS = [
  // Shariah-Based Islami Commercial Banks
  'Islami Bank Bangladesh',
  'Al-Arafah Islami Bank',
  'Export Import Bank of Bangladesh (EXIM Bank)',
  'First Security Islami Bank',
  'Global Islami Bank',
  'ICB Islamic Bank',
  'Shahjalal Islami Bank',
  'Social Islami Bank (SIBL)',
  'Standard Bank',
  'Union Bank',
  // State-Owned Commercial & Specialized Banks
  'Sonali Bank',
  'Janata Bank',
  'Agrani Bank',
  'Rupali Bank',
  'BASIC Bank',
  'Bangladesh Development Bank (BDBL)',
  'Bangladesh Krishi Bank',
  'Rajshahi Krishi Unnayan Bank (RAKUB)',
  'Probashi Kallyan Bank',
  // Private Commercial Banks (Conventional)
  'AB Bank',
  'Bangladesh Commerce Bank',
  'Bank Asia',
  'Bengal Commercial Bank',
  'BRAC Bank',
  'Citizens Bank',
  'City Bank',
  'Community Bank Bangladesh',
  'Dhaka Bank',
  'Dutch-Bangla Bank',
  'Eastern Bank (EBL)',
  'IFIC Bank',
  'Jamuna Bank',
  'Meghna Bank',
  'Mercantile Bank',
  'Midland Bank',
  'Modhumoti Bank',
  'Mutual Trust Bank (MTB)',
  'National Bank (NBL)',
  'National Credit & Commerce Bank (NCC Bank)',
  'NRB Bank',
  'NRBC Bank',
  'One Bank',
  'Padma Bank',
  'Premier Bank',
  'Prime Bank',
  'Pubali Bank',
  'Shimanto Bank',
  'South Bangla Agriculture & Commerce Bank (SBAC)',
  'Southeast Bank',
  'Trust Bank',
  'United Commercial Bank (UCB)',
  'Uttara Bank',
  // Foreign Commercial Banks Operating in Bangladesh
  'Bank Al-Falah',
  'Citibank N.A.',
  'Commercial Bank of Ceylon',
  'Habib Bank',
  'HSBC Bangladesh',
  'National Bank of Pakistan',
  'Standard Chartered',
  'State Bank of India',
  'Woori Bank',
] as const;

export function escapeCsvCell(value: string | number | undefined): string {
  const str = value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function computeInstallmentDueDate(anchor: Date, monthOffset: number): string {
  const due = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + monthOffset, 15));
  return due.toISOString().slice(0, 10);
}

