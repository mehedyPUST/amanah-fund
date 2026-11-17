import type { Metadata } from 'next';
import { PublicShell } from '../../components/PublicShell.tsx';
import { SignUpForm } from '../../components/SignUpForm.tsx';

export const metadata: Metadata = {
  title: 'Join Amanah — Amanah',
};

export default function SignUpPage() {
  return (
    <PublicShell>
      <SignUpForm />
    </PublicShell>
  );
}
