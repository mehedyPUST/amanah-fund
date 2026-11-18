import { dehydrate, hydrate } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { makeQueryClient } from '../src/lib/queryClient.ts';
import { queryKeys } from '../src/lib/queryKeys.ts';
import { sanitizeUser } from '../src/server/auth.ts';
import { parseMongoUri, type VaultState } from '../src/server/db.ts';
import {
  buildBootstrapStatusFromState,
  buildConstitutionFromState,
  buildDashboardBundleFromState,
  buildFaqsFromState,
  buildNoticesFromState,
  buildReferencesFromState,
} from '../src/server/ssrData.ts';
import { createDefaultFaqs } from '../src/utils/faqDefaults.ts';

function makeTestVaultState(): VaultState {
  return {
    users: [],
    fundConfig: {
      id: 'default-config',
      fundName: 'Amanah Co-op Treasury',
      currency: 'BDT',
      monthlyContributionAmount: 5000,
      maxLoansPerYear: 3,
      maxLoanAmount: 50000,
      maxInstallmentMonths: 10,
      guarantorThresholdAmount: 40000,
      requiredGuarantorsCount: 1,
      voteThresholdNumerator: 2,
      voteThresholdDenominator: 3,
      maturityDate: '2036-12-31',
      halalInvestmentThesis: 'Halal asset-backed ventures post maturity.',
      updatedAt: '2027-01-01T00:00:00.000Z',
      updatedBy: 'Founding Admin',
    },
    contributions: [],
    loans: [],
    halalProjects: [],
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
    privateMessages: [],
    decisionPolls: [],
    meetings: [],
    notices: [],
    profileChangeRequests: [],
    faqs: createDefaultFaqs(),
  };
}

describe('TanStack Query SSR dehydration & CSR hydration', () => {
  it('prefetches public SSR queries and hydrates identically on the client QueryClient', async () => {
    const state = makeTestVaultState();
    state.fundConfig.constitutionPdfUrl = 'https://ik.imagekit.io/amanah/governance/charter.pdf';
    state.fundConfig.constitutionPdfName = 'charter-2027.pdf';

    const serverClient = makeQueryClient();
    await Promise.all([
      serverClient.prefetchQuery({
        queryKey: queryKeys.public.faqs(),
        queryFn: async () => buildFaqsFromState(state),
      }),
      serverClient.prefetchQuery({
        queryKey: queryKeys.public.constitution(),
        queryFn: async () => buildConstitutionFromState(state),
      }),
      serverClient.prefetchQuery({
        queryKey: queryKeys.auth.references(),
        queryFn: async () => buildReferencesFromState(state),
      }),
      serverClient.prefetchQuery({
        queryKey: queryKeys.auth.bootstrapStatus(),
        queryFn: async () => buildBootstrapStatusFromState(state),
      }),
    ]);

    const dehydrated = dehydrate(serverClient);
    const clientQueryClient = makeQueryClient();
    hydrate(clientQueryClient, dehydrated);

    const hydratedFaqs = clientQueryClient.getQueryData<{ faqs: unknown[] }>(
      queryKeys.public.faqs()
    );
    const hydratedConstitution = clientQueryClient.getQueryData<{
      constitutionPdfUrl: string | null;
      constitutionPdfName: string | null;
    }>(queryKeys.public.constitution());
    const hydratedRefs = clientQueryClient.getQueryData<{
      members: unknown[];
      hasMembers: boolean;
    }>(queryKeys.auth.references());
    const hydratedBootstrap = clientQueryClient.getQueryData<{
      hasMembers: boolean;
      activeMembersCount: number;
    }>(queryKeys.auth.bootstrapStatus());

    expect(hydratedFaqs?.faqs.length).toBeGreaterThan(0);
    expect(hydratedConstitution?.constitutionPdfUrl).toBe(
      'https://ik.imagekit.io/amanah/governance/charter.pdf'
    );
    expect(hydratedConstitution?.constitutionPdfName).toBe('charter-2027.pdf');
    expect(hydratedRefs?.hasMembers).toBe(false);
    expect(hydratedBootstrap?.activeMembersCount).toBe(0);
  });

  it('builds complete SSR dashboard workspace bundle and hydrates across SSR -> CSR boundary', async () => {
    const state = makeTestVaultState();
    state.users.push({
      id: 'user-ssr-1',
      name: 'Founding Admin',
      email: 'admin@amanah.test',
      passwordHash: 'hashed',
      role: 'admin',
      memberCode: 'AMN-001',
      status: 'active',
      joinedAt: '2027-01-01T00:00:00.000Z',
    });
    state.notices = [
      {
        id: 'notice-1',
        title: 'January Savings Open',
        body: 'Submit your BDT 5,000 contribution before the 10th.',
        priority: 'important',
        pinned: true,
        authorId: 'user-ssr-1',
        authorName: 'Founding Admin',
        authorCode: 'AMN-001',
        authorRole: 'admin',
        createdAt: '2027-01-02T00:00:00.000Z',
        updatedAt: '2027-01-02T00:00:00.000Z',
      },
    ];

    const viewer = sanitizeUser(state.users[0]);
    const bundle = buildDashboardBundleFromState(state, viewer);
    const notices = buildNoticesFromState(state);

    const serverClient = makeQueryClient();
    serverClient.setQueryData(queryKeys.dashboard.overview(), bundle.overview);
    serverClient.setQueryData(queryKeys.dashboard.contributions(), bundle.contributions);
    serverClient.setQueryData(queryKeys.dashboard.loans(), bundle.loans);
    serverClient.setQueryData(queryKeys.public.notices(), notices);

    const dehydrated = dehydrate(serverClient);
    const clientQueryClient = makeQueryClient();
    hydrate(clientQueryClient, dehydrated);

    const hydratedOverview = clientQueryClient.getQueryData<typeof bundle.overview>(
      queryKeys.dashboard.overview()
    );
    const hydratedNotices = clientQueryClient.getQueryData<typeof notices>(
      queryKeys.public.notices()
    );

    expect(hydratedOverview?.config.fundName).toBe('Amanah Co-op Treasury');
    expect(hydratedOverview?.treasury.activeMembersCount).toBe(1);
    expect(hydratedNotices?.notices).toHaveLength(1);
    expect(hydratedNotices?.notices[0]?.title).toBe('January Savings Open');
  });

  it('sanitizes quoted MONGODB_URI values and classifies invalid/missing URIs cleanly', () => {
    expect(parseMongoUri(undefined)).toEqual({ uri: null, reason: 'missing_uri' });
    expect(parseMongoUri('   ')).toEqual({ uri: null, reason: 'missing_uri' });
    expect(parseMongoUri('mongodb+srv://<username>:<db_password>@cluster.mongodb.net/')).toEqual({
      uri: null,
      reason: 'placeholder_uri',
    });
    expect(parseMongoUri('https://example.com/db')).toEqual({
      uri: null,
      reason: 'invalid_uri_scheme',
    });
    expect(parseMongoUri('  "mongodb+srv://user:pass@cluster0.abc.mongodb.net/?retryWrites=true"  ')).toEqual({
      uri: 'mongodb+srv://user:pass@cluster0.abc.mongodb.net/?retryWrites=true',
      reason: null,
    });
  });
});
