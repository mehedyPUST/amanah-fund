export const locales = ['en', 'bn'] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'en';

export const LOCALE_COOKIE_NAME = 'AMANAH_LOCALE';
export const LOCALE_STORAGE_KEY = 'amanah_locale';

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'en' || value === 'bn';
}

export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (clean === 'bn' || clean.startsWith('bn-')) {
      return 'bn';
    }
  }
  return defaultLocale;
}
