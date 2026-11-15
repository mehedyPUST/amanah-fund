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

export const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay'] as const;

export const BANK_PROVIDERS = [
  'Islami Bank Bangladesh',
  'Dutch-Bangla Bank',
  'City Bank',
  'Bank Asia',
  'Standard Chartered',
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

