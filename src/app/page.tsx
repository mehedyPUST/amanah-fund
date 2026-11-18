import { HydrationBoundary } from '@tanstack/react-query';
import { About } from '../components/About.tsx';
import { FAQSection } from '../components/FAQSection.tsx';
import { Hero, HeroLifecycle } from '../components/Hero.tsx';
import { HomeHighlights } from '../components/HomeHighlights.tsx';
import { HomeNoticeBoardSection } from '../components/HomeNoticeBoardSection.tsx';
import { HowItWorks } from '../components/HowItWorks.tsx';
import { PublicShell } from '../components/PublicShell.tsx';
import { prefetchHomePageState } from '../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const dehydratedState = await prefetchHomePageState();

  return (
    <HydrationBoundary state={dehydratedState}>
      <PublicShell>
        <div className="space-y-2.5">
          <section id="overview" className="scroll-mt-2">
            <Hero includeLifecycle={false} embedded />
          </section>

          <HomeNoticeBoardSection embedded />

          <HeroLifecycle embedded />

          <section id="how-it-works" className="scroll-mt-2">
            <HowItWorks embedded />
          </section>

          <section id="architecture" className="scroll-mt-2">
            <About embedded />
          </section>

          <FAQSection embedded />

          <HomeHighlights />
        </div>
      </PublicShell>
    </HydrationBoundary>
  );
}
