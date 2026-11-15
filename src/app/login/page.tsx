import type { Metadata } from 'next';
import { PublicShell } from '../../components/PublicShell.tsx';
import { SignInForm } from '../../components/SignInForm.tsx';

export const metadata: Metadata = {
  title: 'Member Sign In — Amanah',
};

export default function LoginPage() {
  return (
    <PublicShell>
      <SignInForm />
    </PublicShell>
  );
}
