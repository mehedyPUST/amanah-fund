import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { SignUpForm } from '../../../components/SignUpForm.tsx';
import { prefetchSignUpPageState } from '../../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Join Amanah — Amanah',
};

export default async function SignUpPage() {
  const dehydratedState = await prefetchSignUpPageState();

  return (
    <HydrationBoundary state={dehydratedState}>
      <SignUpForm />
    </HydrationBoundary>
  );
}
