export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
    bootstrapStatus: () => ['auth', 'bootstrap-status'] as const,
    references: () => ['auth', 'references'] as const,
  },
  public: {
    all: ['public'] as const,
    constitution: () => ['public', 'constitution'] as const,
    faqs: () => ['public', 'faqs'] as const,
    notices: () => ['public', 'notices'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    overview: () => ['dashboard', 'overview'] as const,
    contributions: () => ['dashboard', 'contributions'] as const,
    loans: () => ['dashboard', 'loans'] as const,
    halalProjects: () => ['dashboard', 'halal-projects'] as const,
    notifications: () => ['dashboard', 'notifications'] as const,
    polls: () => ['dashboard', 'polls'] as const,
    meetings: () => ['dashboard', 'meetings'] as const,
    profileChangeRequests: () => ['dashboard', 'profile-change-requests'] as const,
    balanceSheet: (month: string) => ['dashboard', 'balance-sheet', month] as const,
    monthlySheet: (month: string) => ['dashboard', 'balance-sheet', month] as const,
  },
  admin: {
    all: ['admin'] as const,
    systemStatus: () => ['admin', 'system-status'] as const,
    auditLogs: (filters?: Record<string, string | number | undefined>) =>
      ['admin', 'audit-logs', filters ?? {}] as const,
  },
  community: {
    all: ['community'] as const,
    posts: () => ['community', 'posts'] as const,
  },
  members: {
    all: ['members'] as const,
    active: () => ['members', 'active'] as const,
    cycle: () => ['members', 'cycle'] as const,
    profile: (memberId: string) => ['members', 'profile', memberId] as const,
  },
} as const;
