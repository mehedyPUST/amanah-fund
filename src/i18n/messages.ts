import enMessages from './messages/en.json';
import bnMessages from './messages/bn.json';
import type { AppLocale } from './config.ts';

export type MessagesBundle = typeof enMessages;

export const MESSAGES_BY_LOCALE: Record<AppLocale, MessagesBundle> = {
  en: enMessages,
  bn: bnMessages,
};

export function getMessagesForLocale(locale: AppLocale): MessagesBundle {
  return locale === 'bn' ? bnMessages : enMessages;
}

export function translateStatusLabel(status: string, locale: AppLocale = 'en'): string {
  const bundle = getMessagesForLocale(locale);
  const map = bundle.Status as Record<string, string>;
  return map[status] || status.replace(/_/g, ' ');
}

export function translateRoleLabel(role: string, locale: AppLocale = 'en'): string {
  const bundle = getMessagesForLocale(locale);
  const map = bundle.Common.roles as Record<string, string>;
  return map[role] || role;
}
