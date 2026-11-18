import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { DashboardShell } from '../../components/DashboardShell.tsx';
import { prefetchDashboardPageState } from '../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Members Dashboard — Amanah',
};

export default async function DashboardPage() {
  const dehydratedState = await prefetchDashboardPageState();

  return (
    <HydrationBoundary state={dehydratedState}>
      <DashboardShell />
    </HydrationBoundary>
  );
}
