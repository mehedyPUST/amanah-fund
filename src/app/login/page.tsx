import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { PublicShell } from '../../components/PublicShell.tsx';
import { SignInForm } from '../../components/SignInForm.tsx';
import { prefetchLoginPageState } from '../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign In — Amanah',
};

export default async function LoginPage() {
  const dehydratedState = await prefetchLoginPageState();

  return (
    <HydrationBoundary state={dehydratedState}>
      <PublicShell>
        <SignInForm />
      </PublicShell>
    </HydrationBoundary>
  );
}
