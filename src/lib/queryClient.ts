import { defaultShouldDehydrateQuery, isServer, QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Keep SSR-hydrated data fresh for 30s to prevent redundant immediate CSR refetches.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status === 400 || status === 401 || status === 403 || status === 404) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: 0,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    // Always create an isolated QueryClient per SSR request to avoid leaking data across users.
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
