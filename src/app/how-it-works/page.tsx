import type { Metadata } from 'next';
import { FAQSection } from '../../components/FAQSection.tsx';
import { HowItWorks } from '../../components/HowItWorks.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';

export const metadata: Metadata = {
  title: 'How It Works — Amanah',
};

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <div className="space-y-8 sm:space-y-10">
        <HowItWorks embedded={false} />
        <FAQSection embedded={false} />
      </div>
    </PublicShell>
  );
}
