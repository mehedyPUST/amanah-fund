import { Hero, HeroLifecycle } from '../components/Hero.tsx';
import { HomeHighlights } from '../components/HomeHighlights.tsx';
import { HomeNoticeBoardSection } from '../components/HomeNoticeBoardSection.tsx';
import { PublicShell } from '../components/PublicShell.tsx';

export default function HomePage() {
  return (
    <PublicShell>
      <div className="space-y-2.5">
        <section id="overview" className="scroll-mt-2">
          <Hero includeLifecycle={false} embedded />
        </section>

        <HomeNoticeBoardSection embedded />

        <HeroLifecycle embedded />

        <HomeHighlights />
      </div>
    </PublicShell>
  );
}
