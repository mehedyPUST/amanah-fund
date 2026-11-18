import type { AppLocale } from '../i18n/config.ts';
import { getMessagesForLocale } from '../i18n/messages.ts';
import type { DashboardSectionId, UserRole } from '../types/coop.ts';

export function getDeskLabel(role?: UserRole | null, locale: AppLocale = 'en'): string {
  const nav = getMessagesForLocale(locale).Navigation;
  return role === 'admin' ? nav.governanceDesk : nav.managerDesk;
}

export function getRegistryLabel(role?: UserRole | null, locale: AppLocale = 'en'): string {
  const nav = getMessagesForLocale(locale).Navigation;
  return role === 'admin' ? nav.usersAndRoles : nav.memberRegistry;
}

export function getDashboardSectionLabel(
  sectionId: DashboardSectionId,
  role?: UserRole | null,
  locale: AppLocale = 'en'
): string {
  const nav = getMessagesForLocale(locale).Navigation;
  switch (sectionId) {
    case 'fund-overview':
      return nav.overview;
    case 'my-amanah':
      return nav.myAmanah;
    case 'monthly-contribution':
      return nav.contributions;
    case 'quard-hasan':
      return nav.qardHasan;
    case 'transaction-history':
      return nav.transactions;
    case 'statistics':
      return nav.statistics;
    case 'ballot':
      return nav.voting;
    case 'notification':
      return nav.notifications;
    case 'community':
      return nav.community;
    case 'members':
      return nav.members;
    case 'monthly-sheet':
      return nav.monthlySheet;
    case 'manager-cycle':
      return nav.managerCycle;
    case 'my-profile':
      return nav.profile;
    case 'member-profile':
      return nav.memberProfile;
    case 'manager-desk':
      return getDeskLabel(role, locale);
    case 'member-registry':
      return getRegistryLabel(role, locale);
    case 'site-settings':
      return nav.siteSettings;
    case 'email-queue':
      return nav.emailQueue;
    case 'site-activity':
      return nav.siteActivity;
    case 'system-audit-logs':
      return nav.auditLogs;
    default:
      return nav.overview;
  }
}
