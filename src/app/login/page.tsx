import type { Metadata } from 'next';
import { LoginPageClient } from '../../components/LoginPageClient.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'Member Sign In & Onboarding — Amanah Co-op Treasury',
};

export default function LoginPage() {
  return (
    <PublicShell>
      <LoginPageClient />
    </PublicShell>
  );
}
