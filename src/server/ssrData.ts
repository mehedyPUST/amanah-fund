import { dehydrate, type DehydratedState } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { makeQueryClient } from '../lib/queryClient.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import type {
  ConstitutionDocumentInfo,
  Contribution,
  CoopMeeting,
  CoopNotice,
  DashboardOverview,
  DecisionPoll,
  EmailNotification,
  FaqItem,
  HalalProject,
  LoanRequest,
  ProfileChangeRequest,
  PublicAgreementVerification,
  PublicUser,
} from '../types/coop.ts';
import { sortFaqItems } from '../utils/faqDefaults.ts';
import { SESSION_COOKIE_NAME, verifySessionTokensToUser } from './auth.ts';
import {
  buildDashboardOverview,
  buildMonthlySheetData,
  hydrateContributionForViewer,
  hydrateDecisionPollForViewer,
  hydrateHalalProjectForViewer,
  hydrateLoanForViewer,
  hydrateProfileChangeRequestsForViewer,
  verifyDigitalAgreementByToken,
} from './coopService.ts';
import {
  getStorageDiagnostic,
  loadFaqsOnly,
  loadFundConfigOnly,
  loadNoticesOnly,
  loadUserBootstrapSummary,
  loadVaultState,
  type StorageEngine,
  type StorageReason,
  type VaultState,
} from './db.ts';

export async function getServerSessionUser(): Promise<PublicUser | null> {
  try {
    const cookieStore = await cookies();
    const tokens = cookieStore
      .getAll(SESSION_COOKIE_NAME)
      .map((entry) => entry.value)
      .filter((val) => Boolean(val && val.trim()));
    if (tokens.length === 0) return null;
    return await verifySessionTokensToUser(tokens);
  } catch {
    return null;
  }
}

export function buildConstitutionFromState(state: VaultState): ConstitutionDocumentInfo {
  const cfg = state.fundConfig;
  return {
    constitutionPdfUrl: cfg.constitutionPdfUrl || null,
    constitutionPdfName: cfg.constitutionPdfName || null,
    constitutionUploadedAt: cfg.constitutionUploadedAt || null,
    constitutionUploadedBy: cfg.constitutionUploadedBy || null,
    fundName: cfg.fundName,
  };
}

export function buildFaqsFromState(state: VaultState): { faqs: FaqItem[] } {
  return {
    faqs: sortFaqItems(Array.isArray(state.faqs) ? state.faqs : []),
  };
}

export function buildNoticesFromState(state: VaultState): { notices: CoopNotice[] } {
  const notices = [...(state.notices || [])].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return { notices };
}

export function buildBootstrapStatusFromState(state: VaultState): {
  hasMembers: boolean;
  activeMembersCount: number;
  storageEngine: StorageEngine;
  storageReason: StorageReason;
  connectionErrorCode?: string;
} {
  const diag = getStorageDiagnostic();
  return {
    hasMembers: state.users.length > 0,
    activeMembersCount: state.users.filter((u) => u.status === 'active').length,
    storageEngine: diag.storageEngine,
    storageReason: diag.storageReason,
    ...(diag.connectionErrorCode ? { connectionErrorCode: diag.connectionErrorCode } : {}),
  };
}

export function buildReferencesFromState(state: VaultState): {
  members: Array<{ name: string; memberCode: string }>;
  hasMembers: boolean;
} {
  return {
    members: state.users
      .filter((u) => u.status === 'active')
      .map((u) => ({ name: u.name, memberCode: u.memberCode })),
    hasMembers: state.users.length > 0,
  };
}

export function buildDashboardBundleFromState(
  state: VaultState,
  viewer: PublicUser
): {
  overview: DashboardOverview;
  contributions: { contributions: Contribution[] };
  loans: { loans: LoanRequest[] };
  halalProjects: { projects: HalalProject[] };
  notifications: { notifications: EmailNotification[] };
  polls: { polls: DecisionPoll[] };
  meetings: { meetings: CoopMeeting[] };
  profileChangeRequests: { requests: ProfileChangeRequest[] };
} {
  const isStaff = viewer.role === 'admin' || viewer.role === 'manager';

  const contributionsList = isStaff
    ? state.contributions
    : state.contributions.filter((c) => c.userId === viewer.id);

  const notificationsList = isStaff
    ? state.emailNotifications
    : state.emailNotifications.filter(
        (n) =>
          n.recipientUserId === viewer.id ||
          n.recipientEmail.toLowerCase() === viewer.email.toLowerCase()
      );

  const meetingsList = [...(state.meetings || [])].sort((a, b) =>
    b.scheduledFor.localeCompare(a.scheduledFor)
  );

  const profileRequestsList = hydrateProfileChangeRequestsForViewer(state, viewer);

  return {
    overview: buildDashboardOverview(state, viewer),
    contributions: {
      contributions: contributionsList.map((c) => hydrateContributionForViewer(c, viewer)),
    },
    loans: {
      loans: state.loans.map((l) => hydrateLoanForViewer(l, viewer)),
    },
    halalProjects: {
      projects: state.halalProjects.map((p) => hydrateHalalProjectForViewer(p, viewer)),
    },
    notifications: {
      notifications: notificationsList,
    },
    polls: {
      polls: (state.decisionPolls || []).map((p) => hydrateDecisionPollForViewer(p, viewer)),
    },
    meetings: {
      meetings: meetingsList,
    },
    profileChangeRequests: {
      requests: profileRequestsList,
    },
  };
}

export async function prefetchHomePageState(): Promise<DehydratedState> {
  const queryClient = makeQueryClient();
  try {
    const [faqs, fundConfig, user] = await Promise.all([
      loadFaqsOnly(),
      loadFundConfigOnly(),
      getServerSessionUser(),
    ]);
    const constitution: ConstitutionDocumentInfo = {
      constitutionPdfUrl: fundConfig.constitutionPdfUrl || null,
      constitutionPdfName: fundConfig.constitutionPdfName || null,
      constitutionUploadedAt: fundConfig.constitutionUploadedAt || null,
      constitutionUploadedBy: fundConfig.constitutionUploadedBy || null,
      fundName: fundConfig.fundName,
    };

    const notices =
      user && user.status === 'active'
        ? [...(await loadNoticesOnly())].sort((a, b) => {
            const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            if (pinDiff !== 0) return pinDiff;
            return b.createdAt.localeCompare(a.createdAt);
          })
        : null;

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.public.faqs(),
        queryFn: async () => ({ faqs }),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.public.constitution(),
        queryFn: async () => constitution,
      }),
      ...(user && user.status === 'active' && notices
        ? [
            queryClient.prefetchQuery({
              queryKey: queryKeys.auth.me(),
              queryFn: async () => ({ user }),
            }),
            queryClient.prefetchQuery({
              queryKey: queryKeys.public.notices(),
              queryFn: async () => ({ notices }),
            }),
          ]
        : []),
    ]);
  } catch (err) {
    console.warn('[SSR] Home page prefetch skipped:', err);
  }
  return dehydrate(queryClient);
}

export async function prefetchRulesPageState(): Promise<DehydratedState> {
  const queryClient = makeQueryClient();
  try {
    const [fundConfig, faqs] = await Promise.all([loadFundConfigOnly(), loadFaqsOnly()]);
    const constitution: ConstitutionDocumentInfo = {
      constitutionPdfUrl: fundConfig.constitutionPdfUrl || null,
      constitutionPdfName: fundConfig.constitutionPdfName || null,
      constitutionUploadedAt: fundConfig.constitutionUploadedAt || null,
      constitutionUploadedBy: fundConfig.constitutionUploadedBy || null,
      fundName: fundConfig.fundName,
    };
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.public.constitution(),
        queryFn: async () => constitution,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.public.faqs(),
        queryFn: async () => ({ faqs }),
      }),
    ]);
  } catch (err) {
    console.warn('[SSR] Rules page prefetch skipped:', err);
  }
  return dehydrate(queryClient);
}

export async function prefetchSignUpPageState(): Promise<DehydratedState> {
  const queryClient = makeQueryClient();
  try {
    const [summary, fundConfig] = await Promise.all([
      loadUserBootstrapSummary(),
      loadFundConfigOnly(),
    ]);
    const diag = getStorageDiagnostic();
    const constitution: ConstitutionDocumentInfo = {
      constitutionPdfUrl: fundConfig.constitutionPdfUrl || null,
      constitutionPdfName: fundConfig.constitutionPdfName || null,
      constitutionUploadedAt: fundConfig.constitutionUploadedAt || null,
      constitutionUploadedBy: fundConfig.constitutionUploadedBy || null,
      fundName: fundConfig.fundName,
    };
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.auth.references(),
        queryFn: async () => ({
          members: summary.activeReferences,
          hasMembers: summary.hasMembers,
        }),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.auth.bootstrapStatus(),
        queryFn: async () => ({
          hasMembers: summary.hasMembers,
          activeMembersCount: summary.activeMembersCount,
          storageEngine: diag.storageEngine,
          storageReason: diag.storageReason,
          ...(diag.connectionErrorCode ? { connectionErrorCode: diag.connectionErrorCode } : {}),
        }),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.public.constitution(),
        queryFn: async () => constitution,
      }),
    ]);
  } catch (err) {
    console.warn('[SSR] SignUp page prefetch skipped:', err);
  }
  return dehydrate(queryClient);
}

export async function prefetchLoginPageState(): Promise<DehydratedState> {
  const queryClient = makeQueryClient();
  try {
    const summary = await loadUserBootstrapSummary();
    const diag = getStorageDiagnostic();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.auth.bootstrapStatus(),
      queryFn: async () => ({
        hasMembers: summary.hasMembers,
        activeMembersCount: summary.activeMembersCount,
        storageEngine: diag.storageEngine,
        storageReason: diag.storageReason,
        ...(diag.connectionErrorCode ? { connectionErrorCode: diag.connectionErrorCode } : {}),
      }),
    });
  } catch (err) {
    console.warn('[SSR] Login page prefetch skipped:', err);
  }
  return dehydrate(queryClient);
}

export async function prefetchDashboardPageState(): Promise<DehydratedState> {
  const queryClient = makeQueryClient();
  try {
    const user = await getServerSessionUser();
    if (!user || user.status !== 'active') {
      return dehydrate(queryClient);
    }

    const state = await loadVaultState();
    const bundle = buildDashboardBundleFromState(state, user);
    const now = new Date();
    const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentMonthlySheet = buildMonthlySheetData(state, currentMonthKey);

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: async () => ({ user }),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.overview(),
        queryFn: async () => bundle.overview,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.contributions(),
        queryFn: async () => bundle.contributions,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.loans(),
        queryFn: async () => bundle.loans,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.halalProjects(),
        queryFn: async () => bundle.halalProjects,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.notifications(),
        queryFn: async () => bundle.notifications,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.polls(),
        queryFn: async () => bundle.polls,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.meetings(),
        queryFn: async () => bundle.meetings,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.profileChangeRequests(),
        queryFn: async () => bundle.profileChangeRequests,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.balanceSheet(currentMonthKey),
        queryFn: async () => currentMonthlySheet,
      }),
    ]);
  } catch (err) {
    console.warn('[SSR] Dashboard prefetch skipped:', err);
  }
  return dehydrate(queryClient);
}

export async function getPublicAgreementVerification(
  token: string
): Promise<{ verification: PublicAgreementVerification | null; projectHeading: string }> {
  try {
    const state = await loadVaultState();
    const projectHeading = state.fundConfig?.fundName?.trim() || 'Amanah Cooperative';
    const verification = verifyDigitalAgreementByToken(state, token);
    return { verification, projectHeading };
  } catch (err) {
    console.warn('[SSR] Public agreement verification lookup failed:', err);
    return { verification: null, projectHeading: 'Amanah Cooperative' };
  }
}

export async function getPublicFundHeading(): Promise<string> {
  try {
    const cfg = await loadFundConfigOnly();
    return cfg.fundName?.trim() || 'Amanah Cooperative';
  } catch {
    return 'Amanah Cooperative';
  }
}

