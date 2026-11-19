import { HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { FAQSection } from '../../../components/FAQSection.tsx';
import { HowItWorks } from '../../../components/HowItWorks.tsx';
import { Rules } from '../../../components/Rules.tsx';
import { RulesMobileActionStrip } from '../../../components/RulesMobileActionStrip.tsx';
import { prefetchRulesPageState } from '../../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cooperative Rules & Shariah Charter — Amanah',
};

export default async function RulesPage() {
  const dehydratedState = await prefetchRulesPageState();

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="space-y-6 sm:space-y-10">
        <RulesMobileActionStrip />

        <div id="rules-charter" className="scroll-mt-4">
          <Rules />
        </div>

        <div id="rules-faq" className="scroll-mt-4">
          <FAQSection embedded />
        </div>

        <div id="rules-how-it-works" className="scroll-mt-4">
          <HowItWorks embedded />
        </div>
      </div>
    </HydrationBoundary>
  );
}
