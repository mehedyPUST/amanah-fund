import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE_NAME, defaultLocale, normalizeLocale } from './config.ts';

export default getRequestConfig(async () => {
  let locale = defaultLocale;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    locale = normalizeLocale(raw);
  } catch {
    locale = defaultLocale;
  }

  const messages =
    locale === 'bn'
      ? (await import('./messages/bn.json')).default
      : (await import('./messages/en.json')).default;

  return {
    locale,
    messages,
    timeZone: 'Asia/Dhaka',
  };
});
