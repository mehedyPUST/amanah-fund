import type { Metadata } from 'next';
import { HowItWorks } from '../../components/HowItWorks.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'How It Works — Amanah',
};

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <HowItWorks embedded={false} />
    </PublicShell>
  );
}
