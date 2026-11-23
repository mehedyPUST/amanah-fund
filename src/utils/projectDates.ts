import type { Contribution, FundConfig, LoanRequest } from '../types/coop.ts';

export const DEFAULT_PROJECT_START_DATE = '2026-01-01';

/** Validates strict YYYY-MM-DD calendar dates cleanly (rejecting e.g. 2026-02-31). */
export function isValidIsoDateYmd(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === trimmed;
}

export function resolveProjectStartDate(
  config?: Pick<FundConfig, 'projectStartDate'> | null
): string {
  if (config && isValidIsoDateYmd(config.projectStartDate)) {
    return config.projectStartDate.trim();
  }
  return DEFAULT_PROJECT_START_DATE;
}

export function resolveProjectStartMonth(
  config?: Pick<FundConfig, 'projectStartDate'> | null
): string {
  return resolveProjectStartDate(config).slice(0, 7);
}

/**
 * Computes the effective YYYY-MM billing start month for a member:
 * never earlier than the cooperative's official projectStartDate.
 */
export function computeEffectiveMemberStartMonth(
  joinedAt: string | undefined,
  projectStartYm: string,
  fallbackYm?: string
): string {
  const rawJoined =
    joinedAt && /^\d{4}-\d{2}/.test(joinedAt)
      ? joinedAt.slice(0, 7)
      : fallbackYm || projectStartYm;
  return rawJoined > projectStartYm ? rawJoined : projectStartYm;
}

export function getContributionMonthKey(
  c: Pick<Contribution, 'billingMonth' | 'submittedAt'>
): string {
  return (c.billingMonth || c.submittedAt || '').slice(0, 7);
}

export function isContributionOnOrAfterProjectStart(
  c: Pick<Contribution, 'billingMonth' | 'submittedAt'>,
  projectStartDate: string
): boolean {
  const projectStartYm = projectStartDate.slice(0, 7);
  const ym = getContributionMonthKey(c);
  if (!/^\d{4}-\d{2}$/.test(ym)) return true;
  return ym >= projectStartYm;
}

export function getLoanEffectiveDate(
  loan: Pick<LoanRequest, 'disbursedAt' | 'approvedAt' | 'requestedAt'>
): string {
  return (loan.disbursedAt || loan.approvedAt || loan.requestedAt || '').slice(0, 10);
}

export function isLoanOnOrAfterProjectStart(
  loan: Pick<LoanRequest, 'disbursedAt' | 'approvedAt' | 'requestedAt'>,
  projectStartDate: string
): boolean {
  const effectiveDate = getLoanEffectiveDate(loan);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return true;
  return effectiveDate >= projectStartDate;
}

export function isIsoRecordOnOrAfterProjectStart(
  isoOrYmd: string | undefined,
  projectStartDate: string
): boolean {
  if (!isoOrYmd) return true;
  const datePart = isoOrYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return true;
  return datePart >= projectStartDate;
}
