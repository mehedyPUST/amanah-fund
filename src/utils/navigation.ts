import type { DashboardSectionId, UserRole } from '../types/coop.ts';

export function getDeskLabel(role?: UserRole | null): string {
  return role === 'admin' ? 'Governance Desk' : 'Manager Desk';
}

export function getRegistryLabel(role?: UserRole | null): string {
  return role === 'admin' ? 'Users & Roles' : 'Member Registry';
}

export function getDashboardSectionLabel(
  sectionId: DashboardSectionId,
  role?: UserRole | null
): string {
  switch (sectionId) {
    case 'fund-overview':
      return 'Overview';
    case 'my-amanah':
      return 'My Amanah';
    case 'monthly-contribution':
      return 'Contributions';
    case 'quard-hasan':
      return 'Qard Hasan';
    case 'transaction-history':
      return 'Transactions';
    case 'statistics':
      return 'Statistics';
    case 'ballot':
      return 'Voting';
    case 'notification':
      return 'Notifications';
    case 'community':
      return 'Community';
    case 'members':
      return 'Members';
    case 'manager-cycle':
      return 'Manager Cycle';
    case 'my-profile':
      return 'Profile';
    case 'member-profile':
      return 'Member Profile';
    case 'manager-desk':
      return getDeskLabel(role);
    case 'member-registry':
      return getRegistryLabel(role);
    case 'site-settings':
      return 'Site Settings';
    case 'email-queue':
      return 'Email Queue';
    case 'site-activity':
      return 'Site Activity';
    case 'system-audit-logs':
      return 'Audit Logs';
    default:
      return 'Overview';
  }
}
