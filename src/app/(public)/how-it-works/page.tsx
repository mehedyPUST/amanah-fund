import type { Metadata } from 'next';
import { FAQSection } from '../../../components/FAQSection.tsx';
import { HowItWorks } from '../../../components/HowItWorks.tsx';

export const metadata: Metadata = {
  title: 'How It Works — Amanah',
};

export default function HowItWorksPage() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <HowItWorks embedded={false} />
      <FAQSection embedded={false} />
    </div>
  );
}
